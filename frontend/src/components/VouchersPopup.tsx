import { useCallback, useEffect, useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import { Button } from "./ui/button";
import { CARTESI_DAPP_ABI } from "../contracts";
import { fetchGraphQLData, callJsonRpc } from "../utils/api";
import {
  VOUCHERS_QUERY,
  VOUCHERS_QUERY_INLINE,
  VOUCHERS_BY_INPUT_QUERY,
  INPUTS_QUERY,
  VOUCHER_WITH_PROOF_QUERY,
} from "../utils/queries";
import type { Voucher } from "../utils/types";
import { CartesiDApp__factory } from "@cartesi/rollups";
import { ethers } from "ethers";

const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ||
  (import.meta.env.VITE_INSPECT_URL
    ? `${String(import.meta.env.VITE_INSPECT_URL).replace(/\/+$/, "").replace(/\/inspect.*$/, "")}/graphql`
    : "");

// Cartesi v2 JSON-RPC endpoint (e.g. http://127.0.0.1:6751/rpc). Uses VITE_JSONRPC_URL.
const ROLLUPS_RPC_URL = import.meta.env.VITE_JSONRPC_URL || "";

// Minimal ABI for Cartesi Rollups 2.0 Application.wasOutputExecuted(uint256)
const APPLICATION_ABI_V2 = [
  {
    type: "function",
    stateMutability: "view",
    name: "wasOutputExecuted",
    inputs: [{ name: "outputIndex", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Epoch length in blocks and block time in seconds (optional). Used to estimate "due for execution" time. */
const EPOCH_LENGTH = Number(import.meta.env.VITE_EPOCH_LENGTH) || 0;
const BLOCK_TIME_SEC = Number(import.meta.env.VITE_BLOCK_TIME_SEC) || 0;

/** Parse Cartesi input timestamp (ISO string or Unix seconds) to Date. */
function parseInputTimestamp(ts: string | number | undefined): Date | null {
  if (ts == null) return null;
  if (typeof ts === "number") {
    return new Date(ts <= 1e12 ? ts * 1000 : ts);
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format date for display. */
function formatDueTime(d: Date): string {
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

/**
 * Compute expected time when the voucher is due for execution (after the epoch containing the input is closed).
 * Uses input timestamp and optional EPOCH_LENGTH + BLOCK_TIME_SEC to estimate.
 */
function getDueForExecutionLabel(v: VoucherRow): string {
  const ts = v.input?.timestamp;
  const blockNum = v.input?.blockNumber;
  const inputDate = parseInputTimestamp(ts);

  if (inputDate) {
    const inputStr = formatDueTime(inputDate);
    if (EPOCH_LENGTH > 0 && BLOCK_TIME_SEC > 0 && typeof blockNum === "number") {
      const epochIndex = Math.floor(blockNum / EPOCH_LENGTH);
      const epochEndBlock = (epochIndex + 1) * EPOCH_LENGTH - 1;
      const blocksUntilEnd = Math.max(0, epochEndBlock - blockNum);
      const secondsUntilExecutable = blocksUntilEnd * BLOCK_TIME_SEC;
      const dueDate = new Date(inputDate.getTime() + secondsUntilExecutable * 1000);
      return `~${formatDueTime(dueDate)} (input: ${inputStr})`;
    }
    return `After epoch closes (input: ${inputStr})`;
  }
  if (blockNum != null) {
    return `After epoch closes (block ${blockNum})`;
  }
  return "After epoch closes";
}

function toOutputIndexHex(value: string | number | bigint | undefined, fallback = 0): `0x${string}` {
  if (typeof value === "string") {
    if (value.startsWith("0x")) return value as `0x${string}`;
    return `0x${BigInt(value).toString(16)}` as `0x${string}`;
  }
  if (typeof value === "number") return `0x${BigInt(value).toString(16)}` as `0x${string}`;
  if (typeof value === "bigint") return `0x${value.toString(16)}` as `0x${string}`;
  return `0x${BigInt(fallback).toString(16)}` as `0x${string}`;
}

function toSafeNumberFromIndex(value: string | number | bigint | undefined, fallback = 0): number {
  try {
    const bi =
      typeof value === "string"
        ? value.startsWith("0x")
          ? BigInt(value)
          : BigInt(value)
        : typeof value === "number"
          ? BigInt(value)
          : typeof value === "bigint"
            ? value
            : BigInt(fallback);
    return bi <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bi) : Number.MAX_SAFE_INTEGER;
  } catch {
    return fallback;
  }
}

type ProofValidity = {
  inputIndexWithinEpoch: number;
  outputIndexWithinInput: number;
  outputHashesRootHash: string;
  vouchersEpochRootHash: string;
  noticesEpochRootHash: string;
  machineStateHash: string;
  outputHashInOutputHashesSiblings: string[];
  outputHashesInEpochSiblings: string[];
};

type ProofPayload = {
  validity: ProofValidity;
  context: string;
};

type VoucherRow = Voucher & {
  executed?: boolean;
  rpcOutputIndexHex?: `0x${string}`;
  rpcRawData?: `0x${string}`;
  rpcOutputHashesSiblings?: `0x${string}`[];
};

interface VouchersPopupProps {
  open: boolean;
  onClose: () => void;
  dappAddress: Address;
}

export function VouchersPopup({ open, onClose, dappAddress }: VouchersPopupProps) {
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const { data: executeHash, isPending: isExecutePending } = useWriteContract();
  const { isLoading: isExecuteConfirming } = useWaitForTransactionReceipt({ hash: executeHash });

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let list: VoucherRow[] = [];

      // Prefer Cartesi v2 JSON-RPC if configured.
      if (ROLLUPS_RPC_URL && dappAddress) {
        type Output = {
          index?: string | number;
          input_index?: string | number;
          raw_data?: string;
          output_hashes_siblings?: string[];
          decoded_data?: {
            type: string;
            destination?: string;
            payload?: string;
          };
        };
        type ListOutputsResult = { data?: Output[] };
        const res = await callJsonRpc<ListOutputsResult>(ROLLUPS_RPC_URL, "cartesi_listOutputs", {
          application: dappAddress,
          limit: 100,
          offset: 0,
        });
        const outputs = res?.data ?? [];
        const vouchersFromOutputs: VoucherRow[] = outputs
          .filter((o) => o.decoded_data?.type === "Voucher")
          .map((o, idx) => ({
            index: toSafeNumberFromIndex(o.index, idx),
            input: {
              index: toSafeNumberFromIndex(o.input_index, 0),
            },
            destination: (o.decoded_data?.destination ?? "") as string,
            payload: (o.decoded_data?.payload ?? "0x") as string,
            rpcOutputIndexHex: toOutputIndexHex(o.index, idx),
            rpcRawData: (o.raw_data ?? undefined) as `0x${string}` | undefined,
            rpcOutputHashesSiblings: (o.output_hashes_siblings ?? undefined) as `0x${string}`[] | undefined,
          }));
        list = vouchersFromOutputs;
      } else {
        if (!GRAPHQL_URL || !dappAddress) {
          if (!GRAPHQL_URL) setError("VITE_GRAPHQL_URL (or VITE_INSPECT_URL) is not set.");
          else if (!dappAddress) setError("VITE_DAPP_ADDRESS is not set.");
          setVouchers([]);
          return;
        }
        type VouchersData = { vouchers?: { edges: { node: Voucher }[] } };
        let data: VouchersData | undefined;
        try {
          data = await fetchGraphQLData<VouchersData>(GRAPHQL_URL, VOUCHERS_QUERY, { first: 100 });
        } catch {
          data = await fetchGraphQLData<VouchersData>(GRAPHQL_URL, VOUCHERS_QUERY_INLINE);
        }
        console.log("data", data);
        list = (data?.vouchers?.edges?.map((e) => e.node) ?? []) as VoucherRow[];
        if (list.length === 0) {
          try {
            const inputsData = await fetchGraphQLData<{
              inputs?: { edges: { node: { index: number } }[] };
            }>(GRAPHQL_URL, INPUTS_QUERY);
            const inputIndices = inputsData?.inputs?.edges?.map((e) => e.node.index) ?? [];
            const byInput: VoucherRow[] = [];
            for (const idx of inputIndices) {
              const inputVouchers = await fetchGraphQLData<{
                input?: { vouchers?: { edges: { node: Voucher }[] } };
              }>(GRAPHQL_URL, VOUCHERS_BY_INPUT_QUERY, { inputIndex: idx });
              const nodes = inputVouchers?.input?.vouchers?.edges?.map((e) => e.node) ?? [];
              for (const n of nodes) byInput.push(n);
            }
            list = byInput;
          } catch {
            // ignore fallback errors
          }
        }
      }

      setVouchers(list.map((v) => ({ ...v, executed: undefined })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch vouchers";
      if (ROLLUPS_RPC_URL) {
        setError(`${msg}. Ensure JSON-RPC is reachable at ${ROLLUPS_RPC_URL}.`);
      } else {
        setError(`${msg}. Ensure GraphQL is at ${GRAPHQL_URL} and the rollup has processed inputs.`);
      }
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [dappAddress]);

  useEffect(() => {
    if (open && dappAddress && (ROLLUPS_RPC_URL || GRAPHQL_URL)) {
      fetchVouchers();
    }
  }, [open, dappAddress, fetchVouchers]);

  const inputIndices = vouchers.map((v) => v.input.index);
  const outputIndices = vouchers.map((v) => (v.rpcOutputIndexHex ? BigInt(v.rpcOutputIndexHex) : BigInt(v.index)));
  const wasExecutedCalls =
    open && vouchers.length > 0 && dappAddress
      ? vouchers.map((_, i) =>
          ROLLUPS_RPC_URL
            ? {
                // Cartesi v2: Application.wasOutputExecuted(outputIndex)
                address: dappAddress,
                abi: APPLICATION_ABI_V2,
                functionName: "wasOutputExecuted" as const,
                args: [outputIndices[i]] as const,
              }
            : {
                // Cartesi 1.5: CartesiDApp.wasVoucherExecuted(inputIndex, voucherIndex)
                address: dappAddress,
                abi: CARTESI_DAPP_ABI,
                functionName: "wasVoucherExecuted" as const,
                args: [BigInt(inputIndices[i]), BigInt(outputIndices[i])] as const,
              },
        )
      : [];

  const { data: executedResults } = useReadContracts({
    contracts: wasExecutedCalls,
  });

  const executedFlags =
    (executedResults ?? []).map((r: unknown) =>
      typeof r === "boolean" ? r : (r as { result?: boolean })?.result === true
    );

  const vouchersWithStatus: VoucherRow[] = vouchers.map((v, i) => ({
    ...v,
    executed: executedFlags[i],
  }));

  const handleExecute = useCallback(
    async (voucher: VoucherRow) => {
      if (!dappAddress) return;
      const inputIndex = voucher.input.index;
      const voucherIndex = voucher.index;
      const id = `${inputIndex}:${voucherIndex}`;
      setExecutingId(id);
      try {
        if (ROLLUPS_RPC_URL) {
          // Cartesi 2.0 path: use JSON-RPC cartesi_getOutput and Application.executeOutput
          type GetOutputResult = {
            data?: {
              index?: string;
              raw_data?: string;
              output_hashes_siblings?: string[];
            };
          };

          // Prefer output payload/proof material already returned by cartesi_listOutputs.
          let outputIndexHex = voucher.rpcOutputIndexHex ?? toOutputIndexHex(voucherIndex, voucherIndex);
          let outputBytes = voucher.rpcRawData;
          let outputHashesSiblings = voucher.rpcOutputHashesSiblings;

          if (!outputBytes || !outputHashesSiblings?.length) {
            const res = await callJsonRpc<GetOutputResult>(ROLLUPS_RPC_URL, "cartesi_getOutput", {
              application: dappAddress,
              output_index: outputIndexHex,
            });
            const out = res?.data;
            if (!out?.raw_data || !out?.output_hashes_siblings) {
              setError(
                `cartesi_getOutput missing raw_data/output_hashes_siblings for output ${outputIndexHex}.`,
              );
              return;
            }
            outputIndexHex = out.index ? toOutputIndexHex(out.index, voucherIndex) : outputIndexHex;
            outputBytes = out.raw_data as `0x${string}`;
            outputHashesSiblings = out.output_hashes_siblings as `0x${string}`[];
          }
          const outputIndex = BigInt(outputIndexHex);

          const provider = new ethers.providers.Web3Provider(
            (window as Window & { ethereum?: unknown }).ethereum as any
          );
          const signer = provider.getSigner();

          // ABI for Cartesi Rollups 2.0 Application.executeOutput(OutputValidityProof)
          const applicationAbi = [
            "function executeOutput(bytes output, (uint64 outputIndex, bytes32[] outputHashesSiblings) proof) external",
          ];

          const application = new ethers.Contract(dappAddress, applicationAbi, signer);
          const tx = await application.executeOutput(outputBytes as `0x${string}`, {
            outputIndex,
            outputHashesSiblings: outputHashesSiblings as `0x${string}`[],
          });
          const receipt = await tx.wait();
          console.log("executeOutput receipt", receipt);
        } else {
          // Cartesi 1.5 path: keep existing GraphQL + executeVoucher flow
          if (!GRAPHQL_URL) return;
          const data = await fetchGraphQLData<{
            voucher: Voucher & { proof: ProofPayload };
          }>(GRAPHQL_URL, VOUCHER_WITH_PROOF_QUERY, {
            voucherIndex,
            inputIndex,
          });
          const v = data?.voucher;
          console.log("voucher", v);

          if (!v?.proof) {
            setError("Voucher or proof not found (epoch may not be closed yet)");
            return;
          }
          const proof = v.proof;
          console.log("proof", proof);

          const provider = new ethers.providers.Web3Provider(
            (window as Window & { ethereum?: unknown }).ethereum as any
          );
          const signer = provider.getSigner();

          const dApp = CartesiDApp__factory.connect(dappAddress, signer);

          const voucher_execution = await dApp.executeVoucher(v.destination, v.payload, proof);
          const receipt = await voucher_execution.wait();
          console.log("executeVoucher receipt", receipt);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load proof or execute");
      } finally {
        setExecutingId(null);
      }
    },
    [dappAddress]
  );

  useEffect(() => {
    if (executeHash && !isExecutePending && !isExecuteConfirming) {
      setExecutingId(null);
      fetchVouchers();
    }
  }, [executeHash, isExecutePending, isExecuteConfirming, fetchVouchers]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-lg border border-border bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-lg">Vouchers</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchVouchers} disabled={loading}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <p className="text-sm text-destructive mb-3">{error}</p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading vouchers…</p>
          ) : vouchersWithStatus.length === 0 ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>No vouchers found.</p>
              <p className="text-xs">
                {ROLLUPS_RPC_URL
                  ? `Ensure the Cartesi JSON-RPC server is reachable at ${ROLLUPS_RPC_URL} and that your application has processed inputs. Vouchers may appear only after the epoch is closed.`
                  : `Ensure the rollup GraphQL is at the configured URL and that inputs have been processed. Vouchers may appear only after the current epoch is closed.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium">Identifier</th>
                    <th className="text-left py-2 px-2 font-medium">Destination</th>
                    <th className="text-left py-2 px-2 font-medium">Due for execution</th>
                    <th className="text-left py-2 px-2 font-medium">Executed</th>
                    <th className="text-right py-2 px-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchersWithStatus.map((v) => {
                    const id = `${v.input.index}:${v.index}`;
                    const isExecuting = executingId === id || (isExecutePending && executingId === id) || isExecuteConfirming;
                    return (
                      <tr key={id} className="border-b border-border/60">
                        <td className="py-2 px-2 font-mono text-xs">
                          Input #{v.input.index} → Voucher #{v.index}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs truncate max-w-[180px]" title={v.destination}>
                          {v.destination}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground max-w-[240px]" title={getDueForExecutionLabel(v)}>
                          {getDueForExecutionLabel(v)}
                        </td>
                        <td className="py-2 px-2">
                          {v.executed === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : v.executed ? (
                            <span className="text-green-600 dark:text-green-400">Yes</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">No</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={v.executed === true || isExecuting}
                            onClick={() => handleExecute(v)}
                          >
                            {isExecuting ? "Executing…" : "Execute"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
