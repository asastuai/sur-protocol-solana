"use client";

import Link from "next/link";
import { useBinancePrices } from "@/hooks/data/use-binance-prices";
import { CATALOG } from "@/lib/market-catalog";
import { fmtPrice } from "@/components/markets/CatalogMarketCard";
import { cn } from "@/lib/cn";

// A thin marquee of all catalog markets with live Binance prices.
export function TickerBar() {
  const prices = useBinancePrices();

  const track = (
    <div className="flex items-center gap-6 px-3 shrink-0">
      {CATALOG.map((c) => {
        const t = prices[c.symbol];
        const up = (t?.change24h ?? 0) >= 0;
        return (
          <Link
            key={c.symbol}
            href={`/trade?symbol=${encodeURIComponent(c.symbol)}`}
            className="flex items-center gap-1.5 text-[11px] whitespace-nowrap hover:opacity-80 transition-opacity"
          >
            <span className="text-sur-muted font-medium">{c.baseAsset}</span>
            <span className="font-mono tabular-nums text-sur-text">
              {t ? `$${fmtPrice(t.price)}` : "…"}
            </span>
            {t && (
              <span
                className={cn(
                  "font-mono tabular-nums",
                  up ? "text-long" : "text-short",
                )}
              >
                {up ? "+" : ""}
                {t.change24h.toFixed(2)}%
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="h-8 border-y border-sur-border bg-sur-surface overflow-hidden relative">
      <div className="absolute inset-0 flex items-center">
        <div className="flex animate-[ticker_80s_linear_infinite] hover:[animation-play-state:paused]">
          {track}
          {track}
        </div>
      </div>
      <style>{`@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}
