"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { CatalogMarket } from "@/lib/market-catalog";
import { useBinanceTicker } from "@/hooks/data/use-binance-prices";

export function fmtPrice(p: number): string {
  if (!p) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

export function fmtVol(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function CatalogMarketCard({ market }: { market: CatalogMarket }) {
  const t = useBinanceTicker(market.symbol);
  const up = (t?.change24h ?? 0) >= 0;

  return (
    <Link
      href={`/trade?symbol=${encodeURIComponent(market.symbol)}`}
      className="group panel p-4 flex flex-col gap-3 hover:border-sur-accent/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-sur-surface-2 border border-sur-border flex items-center justify-center text-[10px] font-bold text-sur-text">
            {market.baseAsset.slice(0, 4)}
          </div>
          <div>
            <div className="text-sm font-semibold text-sur-text leading-tight">
              {market.symbol}
            </div>
            <div className="text-[10px] text-sur-muted">{market.maxLeverage}x max</div>
          </div>
        </div>
        {market.onChain ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-long/15 text-long font-semibold uppercase tracking-wide">
            On-chain
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sur-surface-2 text-sur-muted font-semibold uppercase tracking-wide">
            Live
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div className="text-lg font-mono tabular-nums text-sur-text">
          {t ? `$${fmtPrice(t.price)}` : <span className="text-sur-muted">…</span>}
        </div>
        {t && (
          <div
            className={cn(
              "text-xs font-mono tabular-nums font-semibold",
              up ? "text-long" : "text-short",
            )}
          >
            {up ? "+" : ""}
            {t.change24h.toFixed(2)}%
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-sur-muted">
        <span>Vol {t ? fmtVol(t.volume24h) : "—"}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-sur-accent font-medium">
          Trade →
        </span>
      </div>
    </Link>
  );
}
