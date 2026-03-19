import React from "react";
import { Button } from "./ui/button";
import { PriceChart } from "./PriceChart";
import type { Token } from "../types/bonding";
import type { PriceCurvePoint } from "../types/bonding";

interface TokenDetailProps {
  token: Token;
  priceCurvePoints: PriceCurvePoint[];
  onSimulate: () => void;
}

export const TokenDetail: React.FC<TokenDetailProps> = ({
  token,
  priceCurvePoints,
  onSimulate,
}) => {
  const displayName = token.name || token.symbol || `Token ${token.token_id}`;

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5 shadow-sm w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{displayName}</h2>
        <Button onClick={onSimulate}>Simulate buys & sells</Button>
      </div>

      {/* Token details: full-width block */}
      <section className="rounded-md border border-border bg-muted/30 p-4 w-full">
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          Token details
        </h4>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="font-mono">{token.token_id}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Symbol</dt>
            <dd>{token.symbol || "—"}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Initial supply</dt>
            <dd>{token.initial_supply}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Initial price</dt>
            <dd>{token.initial_price}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Initial reserve balance</dt>
            <dd>{token.reserve_balance}</dd>
          </div>
          {token.current_price != null && (
            <div className="flex justify-between sm:block border-t border-border pt-2 sm:col-span-2 lg:col-span-3">
              <dt className="text-muted-foreground">Current price</dt>
              <dd className="font-medium">{token.current_price.toFixed(4)}</dd>
            </div>
          )}
          {token.current_supply != null && (
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Current supply</dt>
              <dd className="font-medium">{token.current_supply.toFixed(2)}</dd>
            </div>
          )}
          {token.current_reserve_balance != null && (
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Current reserve balance</dt>
              <dd className="font-medium">{token.current_reserve_balance.toFixed(2)}</dd>
            </div>
          )}
          {token.total_transactions != null && (
            <>
              <div className="flex justify-between sm:block border-t border-border pt-2 sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Total transactions</dt>
                <dd className="font-medium">{token.total_transactions}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Total buys</dt>
                <dd className="font-medium">{token.total_buys ?? 0}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Total sells</dt>
                <dd className="font-medium">{token.total_sells ?? 0}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {/* Chart: full-width block below details */}
      <section className="w-full min-w-0">
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">
          Price curve (from simulations)
        </h4>
        <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <PriceChart points={priceCurvePoints} height={280} />
        </div>
      </section>
    </div>
  );
};
