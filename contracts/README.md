# USDC Vault & Uniswap v4 Hook

## Build (main contracts)

To build **without** Uniswap v4 (e.g. to run only the token deploy script; vault deploy script requires v4):

```bash
forge build --skip UniswapV4 --skip DeployVault
```

To build **everything** (vault-with-liquidity, deploy script):

```bash
forge install Uniswap/v4-core Uniswap/v4-periphery
forge build
```

`foundry.toml` already includes remappings for v4-core and v4-periphery.

## Deploy sample USDC/USDT (CREATE2)

Deploy mock USDC and USDT to **deterministic addresses** (same deployer + same salts + same bytecode ⇒ same addresses every time). Use for local liquidity pool testing.

If you have **not** installed Uniswap v4 (`forge install Uniswap/v4-core Uniswap/v4-periphery`), skip the v4 adapter so the project compiles:

```bash
# Optional: DEPLOYER and MINT_TO (default: broadcast sender)
export RPC_URL=http://localhost:8545   # or http://localhost:6751/anvil
forge script script/DeployTokens.s.sol:DeployTokensScript \
  --skip UniswapV4 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Tokens get 10M units (6 decimals) minted to `MINT_TO`. Addresses only stay deterministic if you use the same solc version and avoid appending metadata to bytecode (see [Foundry CREATE2 guide](https://book.getfoundry.sh/guides/deterministic-deployments-using-create2)).

## Deploy vault with liquidity (single contract)

**Requires Uniswap v4 libs and a deployed PoolManager + initialized pool.**

1. **Install v4 dependencies** (once per clone; run from repo root or from `contracts/`):

   ```bash
   cd /path/to/cartesi-uniswap-integration/contracts
   forge install Uniswap/v4-core Uniswap/v4-periphery
   ```

2. **Set env and run the script** (from the `contracts/` directory):

   ```bash
   export USDC_ADDRESS=0x...
   export USDT_ADDRESS=0x...              # pair token (e.g. USDT)
   export POOL_MANAGER_ADDRESS=0x...
   # Optional: POOL_FEE (default 3000), POOL_TICK_SPACING (default 60), HOOKS_ADDRESS (default 0)

   forge script script/DeployVault.s.sol:DeployVaultScript \
     --rpc-url http://localhost:8545 \
     --private-key $PRIVATE_KEY \
     --broadcast
   ```

   If you see "Source lib/v4-core/... not found", the v4 libs are missing — run step 1 from `contracts/`.

   The script deploys a single **USDCVaultWithLiquidity** contract (no separate adapter). Use its address as `VITE_VAULT_ADDRESS` in the frontend.

## Contract and hook

- **USDCVaultWithLiquidity** (`src/USDCVaultWithLiquidity.sol`): Merged vault + Uniswap v4 LP. On `addLiquidityFromApplication(usdcAmount)` it pulls USDC from the caller (dApp), swaps half to the pair token, and adds both to the pool (full-range). On `withdrawToUser(user, usdcAmount)` it sends USDC from idle or by removing liquidity and swapping the other token to USDC. Deploy with `(usdcAddress, IPoolManager, PoolKey)`.
- **VaultLPHook** (`v4-hook/VaultLPHook.sol`): Optional hook that restricts add/remove liquidity to the vault address. Requires the same v4 deps.
