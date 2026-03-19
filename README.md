<div align="center">
  <h1>Cartesi Uniswap Integration</h1>
  <i>USDC yield vault on Cartesi + Uniswap v4 (Base Sepolia)</i>
</div>

<div align="center">
  <a href="https://docs.cartesi.io/cartesi-rollups/1.5/">
    <img alt="Cartesi Rollups" src="https://img.shields.io/badge/cartesi--rollups-1.5.0-5bd1d7" />
  </a>
  <a href="https://uniswap.org">
    <img alt="Uniswap" src="https://img.shields.io/badge/uniswap-v4-green" />
  </a>
</div>

---

## Index

1. [Introduction](#1-introduction)
2. [High-level Architecture](#2-high-level-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Backend (Cartesi dApp)](#4-backend-cartesi-dapp)
5. [Vault Contract](#5-vault-contract)
6. [Frontend](#6-frontend)
7. [Running the Backend (v2.0)](#7-running-the-backend-v20)
8. [Running the Frontend](#8-running-the-frontend)
9. [Showcase Flow](#9-showcase-flow)
10. [Local Testing Notes](#10-local-testing-notes)
11. [References](#11-references)

---

## 1. Introduction

This project shows how to build a **yield-bearing USDC vault** on top of **Cartesi Rollups** and **Uniswap v4**.  
The Cartesi application keeps the user ledger off-chain, while vouchers move USDC between:

- the **Cartesi dApp contract** (ERC20 Portal deposits),
- a **vault + liquidity adapter** (`USDCVaultWithLiquidity`) that provides liquidity to a Uniswap v4 USDC/USDT pool,
- and the **user wallet** on Base Sepolia.

---

## 2. High-level Architecture

- **Deposits (L1 → dApp)**  
  Users deposit USDC via the Cartesi **ERC20 Portal**. USDC is transferred to the dApp contract on L1, and the backend credits their balance in its ledger. No tokens reach the vault yet.

- **Add liquidity (dApp → Vault → Uniswap v4)**  
  When the undeployed balance (total deposits minus deployed liquidity) reaches a threshold (e.g. 1 000 USDC), the backend emits a voucher:
  - destination: `USDCVaultWithLiquidity`
  - payload: `addLiquidityFromApplication(int256 usdcAmount)`  
  The vault pulls USDC from the dApp and adds liquidity to the v4 pool.

- **Withdrawals (Vault → User)**  
  Users request withdrawals by sending an **InputBox** JSON input `{ "action": "withdraw", "amount": "<uint256>" }`.  
  The backend checks the ledger and, if sufficient balance:
  - emits a voucher `vault.withdrawToUser(user, amount)`.
  - On-chain, the vault:
    - first pays from idle USDC held in the vault;
    - if that’s not enough, removes liquidity from the pool (no swap) and sends the available USDC to the user.

- **Approvals**  
  - Backend has an `approve_vault` action that emits vouchers so the dApp approves the vault to pull **USDC and USDT**.
  - Frontend exposes an **“Approve Vault”** button that sends a JSON `{ "action": "approve_vault" }` input via the InputBox, which the backend converts into those approval vouchers.

---

## 3. Repository Structure

| Path | Description |
|------|-------------|
| **`contracts/`** | Solidity contracts and Foundry scripts (vault, mocks, deploy & helper scripts). |
| **`contracts/src/USDCVaultWithLiquidity.sol`** | Merged vault + Uniswap v4 LP manager. |
| **`uniswap-integration-v2.0/`** | **Current** Cartesi backend (Python, v2 JSON-RPC, `approve_vault`, add-liquidity, withdraw). |
| **`uniswap-integration-v1.5/`** | Legacy backend (1.5 style) kept for reference. |
| **`frontend/`** | React + Vite + wagmi dApp: deposit via ERC20 Portal, withdraw via InputBox, inspect via `/inspect`, list & execute vouchers via JSON-RPC. |

---

## 4. Backend (Cartesi dApp)

The v2 backend lives in `uniswap-integration-v2.0/dapp.py`.

- Tracks:
  - `balances[address]` – user USDC balances (application ledger, 6 decimals).
  - `total_deposited` – total deposits recorded.
  - `total_deployed_lp` – amount conceptually deployed to LP.
- Reads config from environment:
  - `ROLLUP_HTTP_SERVER_URL`
  - `VAULT_ADDRESS`, `USDC_ADDRESS`, `USDT_ADDRESS`
  - `ERC20_PORTAL_ADDRESS`
  - `DEPLOY_THRESHOLD` (default 1 000 * 1e6)
  - `VAULT_APPROVAL_AMOUNT` (default 1_000_000 * 1e6)

### 4.1 Advance inputs

- **ERC20 Portal deposits**  
  Payload is decoded as `(token, sender, amount, execLayerData)` (Cartesi v2 layout).  
  Behavior:
  - require `token == USDC_ADDRESS`
  - `balances[sender] += amount`
  - `total_deposited += amount`
  - emit `"deposit"` notice
  - while `(total_deposited - total_deployed_lp) >= DEPLOY_THRESHOLD`:
    - emit voucher: `vault.addLiquidityFromApplication(DEPLOY_THRESHOLD)`
    - `total_deployed_lp += DEPLOY_THRESHOLD`

- **`{ "action": "approve_vault" }`**  
  Behavior:
  - emit voucher: `USDC.approve(vault, VAULT_APPROVAL_AMOUNT)`
  - emit voucher: `USDT.approve(vault, VAULT_APPROVAL_AMOUNT)`
  - emit `"approve_vault"` notice (for debugging/UI)

- **`{ "action": "withdraw", "amount": "<uint256>" }`**  
  Behavior:
  - parse `amount`; ensure `amount > 0`
  - require `balances[msg_sender] >= amount`
  - emit voucher: `vault.withdrawToUser(msg_sender, amount)`
  - `balances[msg_sender] -= amount`
  - `total_deposited -= amount`

### 4.2 Inspect

Inspect routes are plain strings encoded as hex; responses are hex-encoded JSON in `reports[].payload`:

- `state` →  
  `{ total_deposited, total_deployed_lp, deploy_threshold, vault_address, application_address }`
- `balance/<address>` →  
  `{ address, balance }`

The frontend uses these to show application state and user balance.

---

## 5. Vault Contract

`contracts/src/USDCVaultWithLiquidity.sol`:

- Constructor:
  - `USDCVaultWithLiquidity(address usdc, address usdt, IPoolManager poolManager)`
  - Stores `poolKey` (USDC/USDT, fee, tick spacing, hooks).
- **Add liquidity**:
  - `addLiquidityFromApplication(int256 usdcAmount)`  
    - pulls USDC from `msg.sender` (the dApp, via approval) and provides liquidity to the Uniswap v4 pool.
    - increases `totalDeployedInLp`.
- **Withdraw**:
  - `withdrawToUser(address user, uint256 usdcAmount)`:
    - uses idle USDC in the vault first (`idleBalance()`).
    - if idle is insufficient:
      - computes the required amount to pull from LP.
      - calls an internal `modifyLiquidityFromVault(...)` to remove liquidity through the v4 `IPoolManager` callback.
      - does **not** swap on withdrawal; it just takes what the pool returns and sends as much USDC as available to the user.
- View helpers:
  - `idleBalance()`, `totalUsdcUnderManagement()`, `getPositionAmountsAndOrder()`, etc.

This version has been simplified to avoid swap-on-withdraw paths; swapping is only done on the add-liquidity side.

---

## 6. Frontend

`frontend/` is a Vite + React dApp using wagmi/viem.

Key behaviors:

- **Deposit**:
  - Approve the ERC20 Portal to spend USDC.
  - Call `depositERC20Tokens(USDC, DAPP, amount, "0x")`.
- **Withdraw**:
  - InputBox `addInput(DAPP, encodeWithdrawInput(amount))` where the payload is JSON:
    - `{ "action": "withdraw", "amount": "<uint256>" }`.
- **Inspect**:
  - Uses `VITE_INSPECT_URL` with plain-text routes:
    - `"state"` → global vault/app status.
    - `"balance/<address>"` → per-user ledger balance.
- **Vouchers & execution**:
  - Uses `VITE_JSONRPC_URL` and `cartesi_listOutputs` / `cartesi_getOutput` to list outputs and build proof data.
  - Executes vouchers via the Base-layer application contract’s `executeOutput(...)` or, in 1.5 mode, `executeVoucher(...)`.
- **Approve Vault button**:
  - In the **“Base layer & liquidity pool”** section there is an **“Approve Vault”** button.
  - It sends an InputBox advance input with payload `{ "action": "approve_vault" }`, which the backend turns into:
    - `USDC.approve(vault, VAULT_APPROVAL_AMOUNT)`
    - `USDT.approve(vault, VAULT_APPROVAL_AMOUNT)`

Environment (see `frontend/.env.example`):

- `VITE_INPUT_BOX_ADDRESS`, `VITE_DAPP_ADDRESS`, `VITE_VAULT_ADDRESS`
- `VITE_USDC_ADDRESS`, `VITE_ERC20_PORTAL_ADDRESS`
- `VITE_INSPECT_URL`, `VITE_JSONRPC_URL`, `VITE_RPC_URL`, `VITE_CHAIN_ID`

---

## 7. Running the Backend (v2.0)

```bash
cd uniswap-integration-v2.0
pip install -r requirements.txt

export ROLLUP_HTTP_SERVER_URL=http://localhost:6751/rollup
export VAULT_ADDRESS=0x...           # USDCVaultWithLiquidity
export ERC20_PORTAL_ADDRESS=0x...    # from Cartesi address book / deployment
export USDC_ADDRESS=0x...
export USDT_ADDRESS=0x...
# optional:
# export DEPLOY_THRESHOLD=1000000000          # 1000 USDC (6 decimals)
# export VAULT_APPROVAL_AMOUNT=1000000000000000000000000

cartesi build
cartesi run
```

Backend will:

- log deposits, liquidity deployments, and withdrawals;
- expose inspect routes at `/inspect/<dapp>` via the Cartesi node;
- expose JSON-RPC outputs at `/rpc` (used by the frontend to list/execute vouchers).

---

## 8. Running the Frontend

```bash
cd frontend
cp .env.example .env
# edit .env for your local or Base Sepolia environment
npm install
npm run dev
```

Make sure:

- `VITE_RPC_URL` points to the same chain the Cartesi node is watching;
- `VITE_DAPP_ADDRESS`, `VITE_INPUT_BOX_ADDRESS`, `VITE_ERC20_PORTAL_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_USDC_ADDRESS` match the contracts on that chain;
- `VITE_INSPECT_URL` and `VITE_JSONRPC_URL` point to the node’s inspect and JSON-RPC endpoints.

---

## 9. Showcase Flow

1. **Start Cartesi node** (`cartesi build && cartesi run`) and note the dApp address and endpoints.
2. **Deploy tokens, v4 pool, and vault** to the same chain (or use the addresses in `uniswap-integration-v2.0/sepolia.json` on Base Sepolia).
3. **Set backend env** for `VAULT_ADDRESS`, `USDC_ADDRESS`, `USDT_ADDRESS`, `ERC20_PORTAL_ADDRESS`, then run `dapp.py`.
4. **Configure frontend** `.env` with the same addresses and node URLs.
5. From the UI:
   - Deposit USDC (approve portal, deposit).
   - Click **Approve Vault** to emit approval vouchers.
   - Wait for the backend to deploy liquidity when the threshold is crossed.
   - Request a withdrawal and then execute the withdrawal voucher from the **Vouchers** popup.

---

## 10. Local Testing Notes

- Always keep the **frontend RPC**, **backend Rollups node**, and **contract deployments** on the same network.
- Use the node’s embedded Anvil or configure `BLOCKCHAIN_HTTP_ENDPOINT` / `BLOCKCHAIN_WS_ENDPOINT` in `uniswap-integration-v2.0/.env` to point to your own Base Sepolia endpoint.
- When debugging voucher execution, inspect:
  - JSON-RPC outputs via `/rpc` (`cartesi_listOutputs`, `cartesi_getOutput`);
  - vault contract methods (`addLiquidityFromApplication`, `withdrawToUser`) with `cast call` / `cast send`.

---

## 11. References

- [Cartesi ERC20 Portal](https://docs.cartesi.io/cartesi-rollups/1.5/rollups-apis/json-rpc/portals/ERC20Portal)
- [Cartesi Asset Handling](https://docs.cartesi.io/cartesi-rollups/1.5/development/asset-handling)
- [Cartesi Rollups Docs](https://docs.cartesi.io/cartesi-rollups/1.5/)
- [Uniswap v4 Docs](https://docs.uniswap.org/contracts/v4/overview)
