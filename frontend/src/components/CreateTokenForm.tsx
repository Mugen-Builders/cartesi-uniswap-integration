import React, { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** Reserve balance = this fraction of (price × supply); keeps curve within valid range (5–99%). */
const RESERVE_RATIO = 0.25;

function formatReserve(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  const fixed = value.toFixed(4).replace(/\.?0+$/, "");
  return Number(fixed).toLocaleString();
}

interface CreateTokenFormProps {
  onSubmit: (payload: {
    action: "create_token";
    name: string;
    symbol: string;
    initial_supply: number;
    initial_price: number;
    reserve_balance: number;
  }) => Promise<void>;
  disabled?: boolean;
}

export const CreateTokenForm: React.FC<CreateTokenFormProps> = ({
  onSubmit,
  disabled = false,
}) => {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [initialSupply, setInitialSupply] = useState("80");
  const [initialPrice, setInitialPrice] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supplyNum = Number(initialSupply) || 0;
  const priceNum = Number(initialPrice) || 0;
  const reserveBalance = useMemo(() => {
    if (supplyNum < 1 || priceNum <= 0) return 0;
    return priceNum * supplyNum * RESERVE_RATIO;
  }, [supplyNum, priceNum]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const supply = Number(initialSupply);
    const price = Number(initialPrice);
    if (supply < 1 || price <= 0) {
      setError("Supply ≥ 1, price > 0");
      return;
    }
    const reserve = price * supply * RESERVE_RATIO;
    setLoading(true);
    try {
      await onSubmit({
        action: "create_token",
        name: name.trim(),
        symbol: symbol.trim(),
        initial_supply: supply,
        initial_price: price,
        reserve_balance: reserve,
      });
      setName("");
      setSymbol("");
      setInitialSupply("80");
      setInitialPrice("2");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 className="text-lg font-semibold">Create token</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Name</label>
          <Input
            placeholder="MyToken"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Symbol</label>
          <Input
            placeholder="MTK"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Initial supply</label>
          <Input
            type="number"
            min={1}
            step={1}
            value={initialSupply}
            onChange={(e) => setInitialSupply(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Initial price</label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={initialPrice}
            onChange={(e) => setInitialPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Reserve balance</label>
          <Input
            type="text"
            value={reserveBalance > 0 ? formatReserve(reserveBalance) : "—"}
            readOnly
            disabled
            className="bg-muted"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Auto: {RESERVE_RATIO * 100}% of (price × supply)
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={disabled || loading}>
        {loading ? "Creating…" : "Create token"}
      </Button>
    </form>
  );
};
