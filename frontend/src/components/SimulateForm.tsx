import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Token } from "../types/bonding";

interface SimulateFormProps {
  token: Token;
  onSubmit: (payload: {
    action: "simulate_purchase";
    token_id: string;
    num_buys: number;
    num_sells: number;
    buy_amount_min: number;
    buy_amount_max: number;
    sell_amount_min: number;
    sell_amount_max: number;
  }) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}

export const SimulateForm: React.FC<SimulateFormProps> = ({
  token,
  onSubmit,
  onClose,
  disabled = false,
}) => {
  const [numBuys, setNumBuys] = useState("5");
  const [numSells, setNumSells] = useState("2");
  const [buyMin, setBuyMin] = useState("1");
  const [buyMax, setBuyMax] = useState("5");
  const [sellMin, setSellMin] = useState("1");
  const [sellMax, setSellMax] = useState("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const nBuy = Math.max(0, Math.min(1000, Math.floor(Number(numBuys))));
    const nSell = Math.max(0, Math.min(1000, Math.floor(Number(numSells))));
    const bMin = Number(buyMin);
    const bMax = Number(buyMax);
    const sMin = Number(sellMin);
    const sMax = Number(sellMax);
    if (bMin < 0 || bMax < bMin || sMin < 0 || sMax < sMin) {
      setError("Invalid amount ranges");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        action: "simulate_purchase",
        token_id: token.token_id,
        num_buys: nBuy,
        num_sells: nSell,
        buy_amount_min: bMin,
        buy_amount_max: bMax,
        sell_amount_min: sMin,
        sell_amount_max: sMax,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Simulate buys & sells</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Token: {token.name || token.symbol || token.token_id}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Number of buys</label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={numBuys}
                onChange={(e) => setNumBuys(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Number of sells</label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={numSells}
                onChange={(e) => setNumSells(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Buy amount min</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={buyMin}
                onChange={(e) => setBuyMin(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Buy amount max</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={buyMax}
                onChange={(e) => setBuyMax(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Sell amount min</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={sellMin}
                onChange={(e) => setSellMin(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Sell amount max</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={sellMax}
                onChange={(e) => setSellMax(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={disabled || loading}>
              {loading ? "Running…" : "Run simulation"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
