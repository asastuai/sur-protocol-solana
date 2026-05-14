"use client";

import { useMarketState } from "@/hooks/data/use-market-state";
import { findMarket } from "@/lib/markets";
import { formatBN, PRICE_DECIMALS } from "@/lib/formatters";

interface Props {
  symbol: string;
}

// Phase 6 owns lightweight-charts wiring. For Phase 5 we render the same
// frame the real chart will occupy, so the layout is correct and the
// trade page reads end-to-end.
export function ChartPlaceholder({ symbol }: Props) {
  const market = findMarket(symbol);
  const { market: state } = useMarketState(
    market?.marketId ?? new Uint8Array(32),
  );

  const price = state ? `$${formatBN(state.markPrice, PRICE_DECIMALS, 2)}` : "—";

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-sur-bg/40 border-b border-sur-border">
      <div className="text-center space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-sur-muted">
            {symbol}
          </div>
          <div className="text-4xl font-mono font-semibold tabular-nums mt-1">
            {price}
          </div>
        </div>
        <div className="text-xs text-sur-muted max-w-xs">
          Chart panel — Phase 6 wires lightweight-charts here.
        </div>
        <div className="flex justify-center gap-1">
          {[20, 40, 60, 50, 70, 65, 80, 60].map((h, i) => (
            <div
              key={i}
              className="w-2 bg-sur-border rounded-sm"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
