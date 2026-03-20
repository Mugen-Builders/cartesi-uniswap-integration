"""
Cartesi dApp backend: yield-bearing USDC vault (USDCVaultWithLiquidity).

Interacts with the merged vault-with-liquidity contract on the base layer:
  - addLiquidityFromApplication(int256): vault pulls USDC from the dApp and adds to Uniswap v4 LP.
  - withdrawToUser(address,uint256): vault sends USDC to the user (from idle or by removing from LP).

- Application address: When the DApp Address Relayer sends an input (relayDAppAddress(dapp)),
  we receive the dApp contract address in the payload and store it. See Cartesi 1.5 docs:
  https://docs.cartesi.io/cartesi-rollups/1.5/rollups-apis/json-rpc/relays
- Deposits: ERC20 Portal sends tokens to the dApp on base layer and notifies this application.
  We record the deposit in the application ledger (no voucher); user balance is application state only.
- Add liquidity: When (total_deposited - total_deployed_lp) >= threshold, we emit a voucher
  to the vault: addLiquidityFromApplication(threshold). The vault pulls USDC from the dApp
  (voucher executor) and adds it to the Uniswap v4 pool.
- Withdrawals: User sends a withdraw input; we verify balance and emit a voucher
  to the vault: withdrawToUser(sender, amount). The vault sends USDC to the user.
- Set vault: Advance with JSON {"action": "set_vault_address", "address": "0x..."} sets the
  vault contract address (deployed USDCVaultWithLiquidity) for add-liquidity and withdraw vouchers.
- Approve vault: Advance with JSON {"action": "approve_vault"} emits a voucher that calls
  USDC.approve(vault, 1_000_000e6) so the application (dApp) contract grants the vault permission
  to pull USDC when addLiquidityFromApplication is executed. Required once before add-liquidity works.
"""
from os import environ
import logging
import json
import requests

logging.basicConfig(level="INFO")
logger = logging.getLogger(__name__)

rollup_server = environ["ROLLUP_HTTP_SERVER_URL"]
logger.info("HTTP rollup_server url is %s", rollup_server)

# Config: vault = USDCVaultWithLiquidity (merged vault + Uniswap v4 LP)
VAULT_ADDRESS = environ.get("VAULT_ADDRESS", "0xdf84b8858F2036ea837054E0543a3ad716d9058D")
DEPLOY_THRESHOLD = int(environ.get("DEPLOY_THRESHOLD", "1000000000"))  # 1000 USDC (6 decimals)
# Amount the application approves to the vault (1M USDC, 6 decimals); used by approve_vault voucher.
VAULT_APPROVAL_AMOUNT = int(environ.get("VAULT_APPROVAL_AMOUNT", "10000000000000000000000"))  # 1_000_000 * 1e6
# ERC20 Portal address (chain-specific; use cartesi address-book or deploy config)
ERC20_PORTAL_ADDRESS = environ.get("ERC20_PORTAL_ADDRESS", "0xACA6586A0Cf05bD831f2501E7B4aea550dA6562D").lower()
USDC_ADDRESS = environ.get("USDC_ADDRESS", "0xe08760f90822cAb7755449091414AAF7e0b458c1").lower()
USDT_ADDRESS = environ.get("USDT_ADDRESS", "0xF3c79e7B48d662b989b042d78C619C524D6FDd26").lower()
# DApp Address Relayer: when msg_sender is this, payload is the application (dApp) contract address.
# Optional; set per chain from Cartesi address book (e.g. https://github.com/cartesi/rollups-contracts).
DAPP_ADDRESS_RELAY_ADDRESS = environ.get("DAPP_ADDRESS_RELAY_ADDRESS", "0xF5DE34d6BbC0446E2a45719E718efEbaaE179daE").lower()

# Application (dApp) contract address: received from DApp Address Relayer or set via env at startup.
APPLICATION_ADDRESS = environ.get("APPLICATION_ADDRESS", "0xab7528bb862fB57E8A2BCd567a2e929a0Be56a5e").lower()

# Application state: user balance (USDC 18 decimals), total deposited, total deployed to LP
balances = {}
total_deposited = 0
total_deployed_lp = 0


def hex2bytes(hex_payload: str) -> bytes:
    h = hex_payload[2:] if hex_payload.startswith("0x") else hex_payload
    return bytes.fromhex(h)


def hex2str(hex_payload: str) -> str:
    return hex2bytes(hex_payload).decode("utf-8")


def str2hex(s: str) -> str:
    return "0x" + s.encode("utf-8").hex()


def decode_erc20_deposit(payload_hex: str) -> tuple[bool, str, str, int, bytes]:
    """Decode ERC20 Portal deposit payload: (success, token, sender, amount, execLayerData).
    Cartesi v2.0 layout (no success byte; portal only sends successful transfers):
      - 20 bytes: token address
      - 20 bytes: sender address
      - 32 bytes: amount (uint256 big-endian)
      - optional: exec_layer_data (remaining bytes)
    """
    data = hex2bytes(payload_hex)
    if len(data) < 72:
        raise ValueError(f"payload too short for ERC20 deposit: got {len(data)} bytes, need at least 72")

    token = ("0x" + data[0:20].hex()).lower()
    sender = ("0x" + data[20:40].hex()).lower()
    amount = int.from_bytes(data[40:72], "big")
    exec_layer_data = data[72:] if len(data) > 72 else b""
    # v2 only delivers successful transfers
    return True, token, sender, amount, exec_layer_data


def _abi_encode_address(addr: str) -> str:
    a = addr[2:] if addr.startswith("0x") else addr
    return ("0" * 24 + a.lower())[:64]


def _abi_encode_uint256(n: int) -> str:
    h = hex(n)[2:].replace("x", "")
    return h.zfill(64) if len(h) <= 64 else "0" * 64


# USDCVaultWithLiquidity selectors (addLiquidityFromApplication, withdrawToUser)
SELECTORS = {
    # addLiquidityFromApplication(int256)
    "addLiquidityFromApplication(int256)": "c750aaf5",
    "withdrawToUser(address,uint256)": "2b371295",
}
# ERC20 approve(spender, amount) - used so dApp can approve vault to pull USDC
SELECTOR_ERC20_APPROVE = "095ea7b3"


def _encode_erc20_approve(spender: str, amount: int) -> str:
    """ABI-encode approve(address,uint256) for ERC20. Voucher destination = USDC; executor = dApp."""
    return "0x" + SELECTOR_ERC20_APPROVE + _abi_encode_address(spender) + _abi_encode_uint256(amount)


def _encode_add_liquidity_from_application(amount: int) -> str:
    # ABI encoding for positive int256 matches uint256 32-byte representation.
    return "0x" + SELECTORS["addLiquidityFromApplication(int256)"] + _abi_encode_uint256(amount)


def _encode_withdraw_to_user(user: str, amount: int) -> str:
    sel = SELECTORS["withdrawToUser(address,uint256)"]
    return "0x" + sel + _abi_encode_address(user) + _abi_encode_uint256(amount)


def add_voucher(destination: str, payload: str) -> None:
    r = requests.post(
        rollup_server + "/voucher",
        json={"destination": destination, "payload": payload},
        timeout=5,
    )
    r.raise_for_status()
    logger.info("Voucher added: destination=%s", destination)


def emit_notice(payload_obj: dict) -> None:
    requests.post(
        rollup_server + "/notice",
        json={"payload": str2hex(json.dumps(payload_obj))},
        timeout=5,
    )
    logger.info("Notice emitted")


def emit_report(message: str) -> None:
    requests.post(rollup_server + "/report", json={"payload": str2hex(message)}, timeout=5)
    logger.info("Report emitted")


def _is_valid_eth_address(addr: str) -> bool:
    if not addr or not isinstance(addr, str):
        return False
    a = addr.strip()
    if not a.startswith("0x") or len(a) != 42:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in a[2:])


def _decode_application_address_from_payload(payload_hex: str) -> str | None:
    """Decode dApp address from DApp Address Relayer payload.
    Payload is either 20 bytes (raw address) or 32 bytes (ABI-encoded address, right-padded).
    """
    data = hex2bytes(payload_hex)
    if len(data) == 20:
        return "0x" + data.hex()
    if len(data) == 32:
        # ABI: address is right-padded in 32 bytes
        return "0x" + data[-20:].hex()
    return None


def handle_advance(data: dict) -> str:
    global total_deposited, total_deployed_lp, balances, VAULT_ADDRESS, APPLICATION_ADDRESS

    meta = data.get("metadata", {})
    msg_sender = (meta.get("msg_sender") or "0x0000000000000000000000000000000000000000").lower()
    print(f"msg_sender: {msg_sender}")

    # Cartesi v2: each input includes the application contract address in metadata
    app_contract = meta.get("application_contract")
    if app_contract and _is_valid_eth_address(app_contract):
        APPLICATION_ADDRESS = app_contract.strip().lower()
    payload_hex = data.get("payload", "0x")
    print(f"payload_hex: {payload_hex}")
    # ERC20 Portal deposit: tokens already transferred to dApp on base layer
    if ERC20_PORTAL_ADDRESS and msg_sender == ERC20_PORTAL_ADDRESS:
        try:
            print(f"Decoding ERC20 deposit: {payload_hex}")
            success, token, sender, amount, _ = decode_erc20_deposit(payload_hex)
            print(f"Decoded ERC20 deposit: {success}, {token}, {sender}, {amount}")
            sender = sender.lower()
            token = token.lower()
            if not success or amount == 0:
                emit_report("ERC20 deposit: success=false or amount=0")
                return "reject"
            if USDC_ADDRESS and token != USDC_ADDRESS:
                emit_report("ERC20 deposit: only USDC accepted")
                return "reject"
            balances[sender] = balances.get(sender, 0) + amount
            total_deposited += amount
            emit_notice({"action": "deposit", "sender": sender, "amount": amount, "token": token})
        except Exception as e:
            emit_report(f"ERC20 deposit decode failed: {e}")
            return "reject"

        # If undeployed balance >= threshold, emit voucher: vault.addLiquidityFromApplication(threshold)
        # Vault pulls USDC from the dApp and adds to Uniswap v4 LP (swap half to pair token, add both).
        while (total_deposited - total_deployed_lp) >= DEPLOY_THRESHOLD:
            try:
                add_voucher(VAULT_ADDRESS, _encode_add_liquidity_from_application(amount))
                total_deployed_lp += amount
                emit_notice({"action": "add_liquidity", "amount": amount})
            except Exception as e:
                logger.warning("addLiquidityFromApplication voucher failed: %s", e)
                break
        return "accept"

    # JSON advance: set_vault_address or withdraw
    try:
        payload_str = hex2str(payload_hex)
        body = json.loads(payload_str)
    except (KeyError, json.JSONDecodeError, ValueError) as e:
        emit_report(f"Invalid payload: {e}")
        return "reject"

    # Special advance: set vault address (any sender; restrict via rollup auth if needed)
    if body.get("action") == "set_vault_address":
        addr = body.get("address")
        if not _is_valid_eth_address(addr):
            emit_report("set_vault_address: missing or invalid address (expected 0x + 40 hex)")
            return "reject"
        VAULT_ADDRESS = addr.strip().lower()
        emit_notice({"action": "set_vault_address", "vault_address": VAULT_ADDRESS})
        logger.info("Vault address set to %s", VAULT_ADDRESS)
        print(f"Vault address set to {VAULT_ADDRESS}")
        return "accept"

    # Emit voucher: USDC.approve(vault, VAULT_APPROVAL_AMOUNT). When executed, the dApp contract
    # is the caller, so the application grants the vault permission to pull USDC (for addLiquidityFromApplication).
    if body.get("action") == "approve_vault":
        if not USDC_ADDRESS or not VAULT_ADDRESS:
            emit_report("approve_vault: USDC_ADDRESS and VAULT_ADDRESS must be set")
            return "reject"
        try:
            add_voucher(USDC_ADDRESS, _encode_erc20_approve(VAULT_ADDRESS, VAULT_APPROVAL_AMOUNT))
            add_voucher(USDT_ADDRESS, _encode_erc20_approve(VAULT_ADDRESS, VAULT_APPROVAL_AMOUNT))
            emit_notice({
                "action": "approve_vault",
                "vault_address": VAULT_ADDRESS,
                "usdc_address": USDC_ADDRESS,
                "amount": VAULT_APPROVAL_AMOUNT,
            })
            logger.info("approve_vault voucher added: USDC.approve(vault=%s, amount=%s)", VAULT_ADDRESS, VAULT_APPROVAL_AMOUNT)
        except Exception as e:
            emit_report(f"approve_vault voucher failed: {e}")
            return "reject"
        return "accept"

    if body.get("action") == "withdraw":
        amount = body.get("amount")
        print(f"Withdraw amount: {amount}")
        if amount is None:
            emit_report("withdraw: missing amount")
            return "reject"
        try:
            amount = int(amount)
            print(f"Converted amount: {amount}")
        except (TypeError, ValueError):
            print(f"Conversion failed: {e}")
            emit_report("withdraw: amount must be integer")
            return "reject"
        if amount <= 0:
            print(f"Amount is not positive: {amount}")
            emit_report("withdraw: amount must be positive")
            return "reject"

        balance = balances.get(msg_sender, 0)
        if balance < amount:
            print(f"Insufficient balance: {balance}, requested {amount}")
            emit_report(f"withdraw: insufficient balance (have {balance}, requested {amount})")
            return "reject"

        try:
            # Emit voucher: vault.withdrawToUser(sender, amount); vault sends USDC from idle or LP.
            add_voucher(VAULT_ADDRESS, _encode_withdraw_to_user(msg_sender, amount))
            balances[msg_sender] = balance - amount
            total_deposited -= amount  # reduce app-ledger total so (total_deposited - total_deployed_lp) stays correct
            emit_notice({"action": "withdraw", "sender": msg_sender, "amount": amount})
        except Exception as e:
            emit_report(f"withdraw voucher failed: {e}")
            return "reject"
        return "accept"

    emit_report("Unknown action or invalid sender")
    return "reject"


def handle_inspect(data: dict) -> str:
    """Inspect: route in payload (plain text). Routes: state, balance/<address>."""
    try:
        payload_hex = data.get("payload", "0x")
        route = hex2str(payload_hex).strip() if payload_hex and payload_hex != "0x" else "state"
    except Exception:
        route = "state"

    if route.startswith("balance/"):
        addr = route.split("/", 1)[1].strip().lower()
        report = json.dumps({"address": addr, "balance": balances.get(addr, 0)})
    else:
        report = json.dumps({
            "total_deposited": total_deposited,
            "total_deployed_lp": total_deployed_lp,
            "deploy_threshold": DEPLOY_THRESHOLD,
            "vault_address": VAULT_ADDRESS,
            "application_address": APPLICATION_ADDRESS,
        })
    requests.post(rollup_server + "/report", json={"payload": str2hex(report)}, timeout=5)
    return "accept"


handlers = {
    "advance_state": handle_advance,
    "inspect_state": handle_inspect,
}

finish = {"status": "accept"}

if __name__ == "__main__":
    print("Starting dApp")
    print(f"Vault address: {VAULT_ADDRESS}")
    print(f"Deploy threshold: {DEPLOY_THRESHOLD}")
    print(f"Vault approval amount (approve_vault voucher): {VAULT_APPROVAL_AMOUNT}")
    print(f"ERC20 portal address: {ERC20_PORTAL_ADDRESS}")
    print(f"USDC address: {USDC_ADDRESS}")
    print(f"DApp address relayer: {DAPP_ADDRESS_RELAY_ADDRESS or '(not set)'}")
    print(f"Application address (from env or relayer): {APPLICATION_ADDRESS or '(not set)'}")

    while True:
        logger.info("Sending finish")
        try:
            response = requests.post(rollup_server + "/finish", json=finish, timeout=10)
        except Exception as e:
            logger.exception("Finish request failed: %s", e)
            continue
        logger.info("Received finish status %s", response.status_code)
        if response.status_code == 202:
            logger.info("No pending rollup request, trying again")
            continue
        try:
            rollup_request = response.json()
            request_type = rollup_request.get("request_type")
            handler = handlers.get(request_type)
            if handler:
                finish["status"] = handler(rollup_request.get("data", {}))
            else:
                finish["status"] = "accept"
        except Exception as e:
            logger.exception("Handler failed: %s", e)
            finish["status"] = "reject"
