import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { INPUT_BOX_ABI, ERC20_PORTAL_ABI, ERC20_ABI, ADAPTER_ABI } from "./contracts";
import { VouchersPopup } from "./components/VouchersPopup";

const INPUT_BOX = (import.meta.env.VITE_INPUT_BOX_ADDRESS || "") as `0x${string}`;
const DAPP = (import.meta.env.VITE_DAPP_ADDRESS || "") as `0x${string}`;
const VAULT = (import.meta.env.VITE_VAULT_ADDRESS || "") as `0x${string}`;
// Merged contract: vault and adapter are the same address
const ADAPTER = VAULT;
const USDC = (import.meta.env.VITE_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;
const ERC20_PORTAL = (import.meta.env.VITE_ERC20_PORTAL_ADDRESS || "") as `0x${string}`;
const INSPECT_BASE = (import.meta.env.VITE_INSPECT_URL || "").replace(/\/$/, "");
/** Cartesi v2 inspect: POST to this URL with body = plain route string (e.g. "state" or "balance/0x..."). Use base + /inspect/<DAPP> if base does not already contain /inspect/. */
const INSPECT_URL =
  !INSPECT_BASE
    ? ""
    : /\/inspect\/0x[a-fA-F0-9]+/i.test(INSPECT_BASE)
      ? INSPECT_BASE
      : DAPP
        ? `${INSPECT_BASE}/inspect/${DAPP}`
        : "";

const USDC_DECIMALS = 6;

function encodeApproveVaultInput(): `0x${string}` {
  const payload = JSON.stringify({ action: "approve_vault" });
  const bytes = new TextEncoder().encode(payload);
  const hex = "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex as `0x${string}`;
}

function encodeWithdrawInput(amount: string): `0x${string}` {
  const payload = JSON.stringify({
    action: "withdraw",
    amount: String(BigInt(parseUnits(amount || "0", USDC_DECIMALS))),
  });
  console.log("payload", payload);
  const bytes = new TextEncoder().encode(payload);
  const hex = "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  console.log("hex", hex);
  console.log("input box", INPUT_BOX);
  console.log("dapp", DAPP);
  return hex as `0x${string}`;
}

type GlobalState = {
  total_deposited: number;
  total_deployed_lp: number;
  deploy_threshold: number;
  vault_address: string;
  application_address?: string;
} | null;

interface LandingPageProps {
  isConnected: boolean;
}

export default function LandingPage({ isConnected }: LandingPageProps) {
  const { address, chain } = useAccount();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [globalState, setGlobalState] = useState<GlobalState>(null);
  const [vouchersOpen, setVouchersOpen] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const { data: dappUsdcBalance } = useReadContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: DAPP ? [DAPP] : undefined,
  });

  const { data: positionAmounts } = useReadContract({
    address: ADAPTER,
    abi: ADAPTER_ABI,
    functionName: "getPositionAmountsAndOrder",
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: usdcAllowance } = useReadContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ERC20_PORTAL] : undefined,
  });

  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();
  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveReceiptError,
  } = useWaitForTransactionReceipt({ hash: approveHash, chainId: chain?.id });

  const { writeContract: writeDeposit, data: depositHash, isPending: isDepositPending } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
    chainId: chain?.id,
  });

  const { writeContract: writeAddInput, data: addInputHash, isPending: isAddInputPending } = useWriteContract();
  const { isLoading: isAddInputConfirming } = useWaitForTransactionReceipt({ hash: addInputHash, chainId: chain?.id });

  // Show approve error and clear when user starts a new approve or when success
  useEffect(() => {
    if (approveReceiptError) setApproveError(approveReceiptError.message || "Transaction failed");
    else if (isApproveSuccess) setApproveError(null);
  }, [approveReceiptError, isApproveSuccess]);
  useEffect(() => {
    if (approveHash) setApproveError(null);
  }, [approveHash]);

  const depositAmountWei = depositAmount ? parseUnits(depositAmount, USDC_DECIMALS) : 0n;
  const needsApproval =
    ERC20_PORTAL && depositAmountWei > 0n && usdcAllowance !== undefined && usdcAllowance < depositAmountWei;

  async function fetchInspectRoute(route: string) {
    if (!INSPECT_URL) throw new Error("INSPECT_URL not set");
    const res = await fetch(INSPECT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: route,
    });
    return res.json();
  }

  function decodeReportJson(payloadHex: unknown): any | null {
    if (typeof payloadHex !== "string" || payloadHex.length < 2) return null;
    const bytesHex = payloadHex.startsWith("0x") ? payloadHex.slice(2) : payloadHex;
    const str = new TextDecoder().decode(
      new Uint8Array((bytesHex.match(/.{2}/g) || []).map((x) => parseInt(x, 16))),
    );
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  // Inspect: user balance from Cartesi backend. Cartesi v2: POST to /inspect/<app> with body = plain route string.
  useEffect(() => {
    if (!INSPECT_URL || !address) {
      setUserBalance(null);
      return;
    }

    let cancelled = false;
    const route = "balance/" + address.toLowerCase();

    const run = async () => {
      try {
        const d = await fetchInspectRoute(route);
        const obj = decodeReportJson(d?.reports?.[0]?.payload);
        if (cancelled) return;
        const bal = obj?.balance;
        setUserBalance(typeof bal === "number" ? bal : Number(bal ?? 0));
      } catch {
        if (!cancelled) setUserBalance(null);
      }
    };

    // Always fetch once immediately.
    run();

    // After a deposit is submitted/confirmed, poll briefly until the rollups backend catches up.
    const shouldPoll = Boolean(depositHash || isDepositConfirming || isDepositSuccess || addInputHash);
    const interval = shouldPoll ? window.setInterval(run, 4000) : null;
    const timeout = shouldPoll ? window.setTimeout(() => interval && window.clearInterval(interval), 45000) : null;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [INSPECT_URL, address, depositHash, isDepositConfirming, isDepositSuccess, addInputHash]);

  // Inspect: global state (totals) from Cartesi backend. Cartesi v2: POST to /inspect/<app> with body = JSON.stringify("state").
  useEffect(() => {
    if (!INSPECT_URL) {
      setGlobalState(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const d = await fetchInspectRoute("state");
        const obj = decodeReportJson(d?.reports?.[0]?.payload) as
          | {
              total_deposited?: number;
              total_deployed_lp?: number;
              deploy_threshold?: number;
              vault_address?: string;
              application_address?: string;
            }
          | null;
        if (cancelled) return;
        if (!obj) {
          setGlobalState(null);
          return;
        }
        setGlobalState({
          total_deposited: obj.total_deposited ?? 0,
          total_deployed_lp: obj.total_deployed_lp ?? 0,
          deploy_threshold: obj.deploy_threshold ?? 0,
          vault_address: obj.vault_address ?? "",
          application_address: obj.application_address,
        });
      } catch {
        if (!cancelled) setGlobalState(null);
      }
    };

    run();

    const shouldPoll = Boolean(depositHash || isDepositConfirming || isDepositSuccess || addInputHash);
    const interval = shouldPoll ? window.setInterval(run, 4000) : null;
    const timeout = shouldPoll ? window.setTimeout(() => interval && window.clearInterval(interval), 45000) : null;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [INSPECT_URL, depositHash, isDepositConfirming, isDepositSuccess, addInputHash]);

  const handleApprove = () => {
    if (!ERC20_PORTAL || depositAmountWei <= 0n) return;
    writeApprove({
      address: USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ERC20_PORTAL, depositAmountWei],
    });
  };

  const handleDeposit = () => {
    if (!ERC20_PORTAL || !DAPP || !depositAmount || Number(depositAmount) <= 0) return;
    writeDeposit({
      address: ERC20_PORTAL,
      abi: ERC20_PORTAL_ABI,
      functionName: "depositERC20Tokens",
      args: [USDC, DAPP, depositAmountWei, "0x" as `0x${string}`],
    });
  };

  const handleWithdraw = () => {
    if (!INPUT_BOX || !DAPP || !withdrawAmount || Number(withdrawAmount) <= 0) return;
    writeAddInput({
      address: INPUT_BOX,
      abi: INPUT_BOX_ABI,
      functionName: "addInput",
      args: [DAPP, encodeWithdrawInput(withdrawAmount)],
    });
    console.log("depositHash", depositHash);
  };

  const handleApproveVaultViaInput = () => {
    if (!INPUT_BOX || !DAPP) return;
    writeAddInput({
      address: INPUT_BOX,
      abi: INPUT_BOX_ABI,
      functionName: "addInput",
      args: [DAPP, encodeApproveVaultInput()],
    });
  };

  const formatUsdc = (v: bigint | undefined) => (v !== undefined ? formatUnits(v, USDC_DECIMALS) : "—");
  const formatUsdcFromNum = (v: number | null) =>
    v != null ? formatUnits(BigInt(v), USDC_DECIMALS) : "—";

  if (!isConnected) {
    return (
      <main className="flex-grow flex flex-col items-center p-6 md:p-8">
        <section className="rounded-lg border border-border bg-card p-4 w-full max-w-2xl text-center">
          <p className="text-muted-foreground">
            Connect your wallet (Base / Base Sepolia) to deposit or withdraw.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-grow flex flex-col items-center p-6 md:p-8 space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 w-full max-w-3xl mb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Application state (Cartesi)</h2>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            onClick={() => setVouchersOpen(true)}
          >
            Vouchers
          </button>
        </div>
        <ul className="space-y-1 text-sm">
          <li>
            <span className="text-muted-foreground">Total deposited (app ledger)</span>{" "}
            <strong>
              {globalState
                ? formatUnits(BigInt(globalState.total_deposited), USDC_DECIMALS)
                : "—"}{" "}
              USDC
            </strong>
          </li>
          <li>
            <span className="text-muted-foreground">Total deployed to LP (app ledger)</span>{" "}
            <strong>
              {globalState
                ? formatUnits(BigInt(globalState.total_deployed_lp), USDC_DECIMALS)
                : "—"}{" "}
              USDC
            </strong>
          </li>
          {/* <li>
            <span className="text-muted-foreground">Deploy threshold (app)</span>{" "}
            <strong>
              {globalState
                ? formatUnits(BigInt(globalState.deploy_threshold), USDC_DECIMALS)
                : "—"}{" "}
              USDC
            </strong>
          </li> */}
          {/* <li>
            <span className="text-muted-foreground">Vault address (from backend)</span>{" "}
            <strong className="font-mono text-xs">
              {globalState?.vault_address || "—"}
            </strong>
          </li> */}
          <li>
            <span className="text-muted-foreground">Your balance (application)</span>{" "}
            <strong>{formatUsdcFromNum(userBalance)} USDC</strong>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 w-full max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Base layer & liquidity pool</h2>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleApproveVaultViaInput}
            disabled={isAddInputPending || isAddInputConfirming}
          >
            {isAddInputPending || isAddInputConfirming ? "Sending…" : "Approve Vault"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Cartesi application and users USDC balance on base layer.
        </p>
        <ul className="space-y-1 text-sm">
          <li>
            <span className="text-muted-foreground">Vault address (from backend)</span>{" "}
            <strong className="font-mono text-xs">
              {globalState?.vault_address || "—"}
            </strong>
          </li>
          <li>
            <span className="text-muted-foreground">Cartesi application USDC (base layer)</span>{" "}
            <strong>{formatUsdc(dappUsdcBalance)} USDC</strong>
          </li>
          {positionAmounts && (
              <>
                {/* <li>
                  <span className="text-muted-foreground">
                    {isUsdcCurrency0 ? "USDC" : "Pair token (e.g. USDT)"} in LP
                  </span>{" "}
                  <strong>
                    {formatUnits(isUsdcCurrency0 ? amount0 : amount1, USDC_DECIMALS)}{" "}
                    {isUsdcCurrency0 ? "USDC" : ""}
                  </strong>
                </li> */}
                <li>
                  <span className="text-muted-foreground">Your USDC (wallet)</span>{" "}
                  <strong>{formatUsdc(usdcBalance)} USDC</strong>
                </li>
                {/* <li>
                  <span className="text-muted-foreground">
                    {isUsdcCurrency0 ? "Pair token (e.g. USDT)" : "USDC"} in LP
                  </span>{" "}
                  <strong>
                    {formatUnits(isUsdcCurrency0 ? amount1 : amount0, USDC_DECIMALS)}{" "}
                    {isUsdcCurrency0 ? "" : "USDC"}
                  </strong>
                </li> */}
              </>
            )}
        </ul>
      </section>

    
      <section className="rounded-lg border border-border bg-card p-4 w-full max-w-3xl mb-4 space-y-3">
        <h2 className="font-semibold">Deposit</h2>
        <p className="text-sm text-muted-foreground">
          Approve the ERC20 Portal to spend USDC, then deposit. Tokens go to the dApp on base
          layer; the application records your balance.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">USDC</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {needsApproval ? (
            <button
              className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => { setApproveError(null); handleApprove(); }}
              disabled={isApprovePending || isApproveConfirming}
            >
              {isApprovePending || isApproveConfirming ? "Confirming…" : "Approve USDC (Portal)"}
            </button>
          ) : (
            <button
              className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleDeposit}
              disabled={
                !depositAmount ||
                Number(depositAmount) <= 0 ||
                isDepositPending ||
                isDepositConfirming
              }
            >
              {isDepositPending || isDepositConfirming ? "Depositing…" : "Deposit via Portal"}
            </button>
          )}
        </div>
        {approveError && (
          <p className="text-sm text-destructive" role="alert">
            {approveError} Switch your wallet to the same network as the app RPC (e.g. Localhost / Anvil when using <code className="rounded bg-muted px-1">localhost:8545</code> and try again.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Use the same RPC as the Cartesi rollup node when using <code className="rounded bg-muted px-1">cartesi run</code> so the backend receives the deposit. If your balance doesn’t update, see README.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 w-full max-w-3xl mb-4 space-y-3">
        <h2 className="font-semibold">Withdraw</h2>
        <p className="text-sm text-muted-foreground">
          Request withdrawal. The application verifies your balance and issues a voucher; the vault
          sends USDC to you.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">USDC</span>
        </div>
        <button
          className="inline-flex w-full items-center justify-center rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleWithdraw}
          disabled={
            !withdrawAmount ||
            Number(withdrawAmount) <= 0 ||
            isAddInputPending ||
            isAddInputConfirming
          }
        >
          {isAddInputPending || isAddInputConfirming ? "Sending…" : "Request withdrawal"}
        </button>
      </section>

      <VouchersPopup
        open={vouchersOpen}
        onClose={() => setVouchersOpen(false)}
        dappAddress={DAPP}
      />

      <section className="rounded-lg border border-border bg-card p-4 w-full max-w-3xl">
        <h2 className="font-semibold mb-2">How it works</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            Deposits use the Cartesi ERC20 Portal: USDC is transferred to the dApp contract on base
            layer and the application records your balance.
          </li>
          <li>
            When undeployed balance reaches the threshold, the application emits a voucher that
            moves USDC from the dApp to the vault and adds liquidity to a USDT/USDC pool.
          </li>
          <li>
            Withdrawals: you submit a withdraw input; the application verifies your balance and only
            then emits a voucher for the vault to send USDC to you.
          </li>
        </ul>
      </section>
    </main>
  );
}
