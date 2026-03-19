// Notice payloads from the bonding curve dapp (hex-decoded JSON)

export type TokenCreatedNotice = {
  type: "token_created";
  token_id: string;
  name: string;
  symbol: string;
  initial_supply: number;
  initial_price: number;
  reserve_balance: number;
};

export type PriceCurvePoint = {
  step: number;
  supply: number;
  price: number;
  action: "initial" | "buy" | "sell";
};

export type PriceCurveNotice = {
  type: "price_curve";
  notice_id: number;
  token_id: string;
  points: PriceCurvePoint[];
  total_buys?: number;
  total_sells?: number;
  total_transactions?: number;
  /** Final curve state after this simulation */
  supply?: number;
  reserve_balance?: number;
  price?: number;
};

export type BondingNotice = TokenCreatedNotice | PriceCurveNotice;

export type Token = {
  token_id: string;
  name: string;
  symbol: string;
  initial_supply: number;
  initial_price: number;
  reserve_balance: number;
  // Latest curve state (from last simulation)
  current_price?: number;
  current_supply?: number;
  current_reserve_balance?: number;
  // Cumulative across all simulations for this token
  total_transactions?: number;
  total_buys?: number;
  total_sells?: number;
};
