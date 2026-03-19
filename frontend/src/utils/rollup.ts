import { type Address, type Hex } from "viem";

// ---------------------------------------------------------------------------
// Payload types matching backend expectations (dapp.py hex2str → json.loads)
// ---------------------------------------------------------------------------

/** Create-token input: backend expects action, name, symbol, initial_supply, initial_price, reserve_balance */
export type CreateTokenPayload = {
  action: "create_token";
  name: string;
  symbol: string;
  initial_supply: number;
  initial_price: number;
  reserve_balance: number;
};

/** Simulate-purchase input: backend expects action, token_id, num_buys, num_sells, buy/sell amount ranges */
export type SimulatePurchasePayload = {
  action: "simulate_purchase";
  token_id: string;
  num_buys: number;
  num_sells: number;
  buy_amount_min: number;
  buy_amount_max: number;
  sell_amount_min: number;
  sell_amount_max: number;
};

export type InputPayload = CreateTokenPayload | SimulatePurchasePayload;

// ---------------------------------------------------------------------------
// Hex encode: JSON object → JSON string (UTF-8) → hex (for InputBox)
// Backend decodes: hex → UTF-8 string → json.loads → dict
// ---------------------------------------------------------------------------

/**
 * Encode a payload object to hex for the Cartesi InputBox contract.
 * 1. Serialize payload to a JSON string (no extra whitespace).
 * 2. Encode the string as UTF-8 bytes.
 * 3. Convert bytes to hex with "0x" prefix.
 * The backend uses: bytes.fromhex(h).decode("utf-8") then json.loads(...).
 */
export function payloadToHex(payload: InputPayload): Hex {
  const jsonString = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(jsonString);
  const hex = Array.from(utf8Bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return (`0x${hex}`) as Hex;
}

/** Decode hex payload (with or without 0x) to UTF-8 string */
export function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes =
    clean.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Decode hex payload to JSON object */
export function hexToJson<T = unknown>(hex: string): T {
  return JSON.parse(hexToUtf8(hex)) as T;
}

export type SendInputFn = (
  dappAddress: Address,
  payload: object
) => Promise<void>;

export type NoticeItem = {
  decoded_data?: { payload?: string };
  raw_data?: string;
};

export type ListOutputsResponse = {
  jsonrpc: "2.0";
  result?: {
    data?: NoticeItem[];
    pagination?: { total_count: number; limit: number; offset: number };
  };
  error?: { code: number; message: string };
  id: number;
};

/** Fetch notices for a dapp from Cartesi JSON-RPC (cartesi_listOutputs) */
export async function fetchNotices(
  applicationAddress: string,
  rpcUrl: string,
  limit = 100,
  offset = 0
): Promise<NoticeItem[]> {
  const body = {
    jsonrpc: "2.0",
    method: "cartesi_listOutputs",
    params: {
      application: applicationAddress,
      limit,
      offset,
    },
    id: 1,
  };

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const rpc: ListOutputsResponse = await res.json();

  if (!res.ok || rpc.error) {
    throw new Error(rpc.error?.message ?? `HTTP ${res.status}`);
  }

  return rpc.result?.data ?? [];
}
