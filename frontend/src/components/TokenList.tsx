import React from "react";
import type { Token } from "../types/bonding";
import { cn } from "../lib/utils";

interface TokenListProps {
  tokens: Token[];
  selectedTokenId: string | null;
  onSelectToken: (token: Token) => void;
}

export const TokenList: React.FC<TokenListProps> = ({
  tokens,
  selectedTokenId,
  onSelectToken,
}) => {
  if (tokens.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No tokens yet. Create one above.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <h3 className="border-b border-border px-4 py-3 text-lg font-semibold">
        Tokens
      </h3>
      <ul className="divide-y divide-border">
        {tokens.map((token) => (
          <li key={token.token_id}>
            <button
              type="button"
              onClick={() => onSelectToken(token)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50",
                selectedTokenId === token.token_id && "bg-muted/70"
              )}
            >
              <span className="font-medium">
                {token.name || token.symbol || `Token ${token.token_id}`}
              </span>
              <span className="text-sm text-muted-foreground">
                {token.symbol || token.token_id}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
