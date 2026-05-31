"use client";

import { useState, useMemo } from "react";
import { CATALOG } from "@/lib/market-catalog";
import { CatalogMarketCard } from "@/components/markets/CatalogMarketCard";
import { TickerBar } from "@/components/layout/TickerBar";

export default function MarketsPage() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return CATALOG;
    return CATALOG.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.baseAsset.toLowerCase().includes(s),
    );
  }, [q]);

  const onChain = filtered.filter((c) => c.onChain);
  const rest = filtered.filter((c) => !c.onChain);

  return (
    <div>
      <TickerBar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-sur-text">Markets</h1>
          <p className="text-sur-muted text-sm mt-1">
            {CATALOG.length} markets · live prices · 3 settle on-chain on devnet
          </p>
        </header>

        <div className="mb-6 max-w-xs">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets…"
            className="w-full bg-sur-surface border border-sur-border rounded-md px-3 py-2 text-sm text-sur-text placeholder:text-sur-muted focus:outline-none focus:border-sur-accent transition-colors"
          />
        </div>

        {onChain.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-sur-muted uppercase tracking-wider mb-3">
              Tradeable on-chain
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {onChain.map((c) => (
                <CatalogMarketCard key={c.symbol} market={c} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold text-sur-muted uppercase tracking-wider mb-3">
            All markets · live prices
          </h2>
          {rest.length === 0 ? (
            <p className="text-sur-muted text-sm py-8 text-center">
              No markets match “{q}”.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {rest.map((c) => (
                <CatalogMarketCard key={c.symbol} market={c} />
              ))}
            </div>
          )}
        </section>

        <p className="text-[11px] text-sur-muted mt-8 max-w-2xl">
          Live prices are public market data (Binance) for display. On-chain
          settlement uses the protocol oracle. BTC/SOL/ETH settle on-chain on
          devnet today; the rest are live-price markets.
        </p>
      </div>
    </div>
  );
}
