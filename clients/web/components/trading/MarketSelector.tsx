"use client";

import { useState } from "react";
import { MARKETS } from "@/lib/markets";
import { useMarkets } from "@/hooks/data/use-markets";
import { formatBN, PRICE_DECIMALS } from "@/lib/formatters";

interface Props {
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  open: boolean;
  onClose: () => void;
}

export function MarketSelector({ selectedSymbol, onSelect, open, onClose }: Props) {
  const [search, setSearch] = useState("");
  const { markets: onChainMarkets } = useMarkets();

  if (!open) return null;

  const onChainBySymbol = new Map(onChainMarkets.map((m) => [m.symbol, m]));

  const filtered = MARKETS.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.symbol.toLowerCase().includes(q) ||
      m.baseAsset.toLowerCase().includes(q)
    );
  });

  return (
    <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-sur-surface border border-sur-border rounded-lg shadow-2xl overflow-hidden animate-fade-in">
      <div className="p-3 border-b border-sur-border">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-sur-bg border border-sur-border rounded px-3 py-1.5 text-xs text-sur-text placeholder:text-sur-muted focus:outline-none focus:border-sur-accent"
          autoFocus
        />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-sur-muted">No markets found</div>
        )}
        {filtered.map((m) => {
          const onChain = onChainBySymbol.get(m.symbol);
          const price = onChain
            ? `$${formatBN(onChain.markPrice, PRICE_DECIMALS, 2)}`
            : "—";
          const isSelected = m.symbol === selectedSymbol;
          return (
            <button
              key={m.symbol}
              onClick={() => {
                onSelect(m.symbol);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors ${
                isSelected ? "bg-sur-accent/10" : ""
              }`}
            >
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-sur-text">{m.baseAsset}</span>
                  <span className="text-[9px] text-sur-yellow font-mono">CRYPTO</span>
                </div>
                <div className="text-[10px] text-sur-muted">{m.symbol}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-sur-text font-mono tabular-nums">{price}</div>
                <div className="text-[10px] text-sur-muted">{m.maxLeverage}x</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
