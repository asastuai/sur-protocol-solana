"use client";

import { useState } from "react";
import { MarketHeader } from "@/components/trading/MarketHeader";
import { LeftDeskPanel } from "@/components/trading/LeftDeskPanel";
import { PositionsPanel } from "@/components/trading/PositionsPanel";
import { TradingViewChart } from "@/components/trading/TradingViewChart";
import { OrderBook } from "@/components/trading/OrderBook";
import { Stamp, useClock } from "@/components/dossier/kit";
import { useBinanceOrderbook } from "@/hooks/data/use-binance-orderbook";

export default function TradePage() {
  const [symbol, setSymbol] = useState("BTC-USD");
  const clock = useClock();
  const ob = useBinanceOrderbook(symbol);

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col bg-ink font-mono text-bone lg:h-full">
      {/* Dossier console bar */}
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-dashed border-ash px-4 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
        <span className="text-gold">SUR://trade</span>
        <span className="flex items-center gap-3">
          <Stamp>Devnet // 2026</Stamp>
          <span className="hidden tabular-nums sm:inline">{clock}</span>
        </span>
      </div>

      <MarketHeader symbol={symbol} onSelect={setSymbol} />

      {/* Desk: consolidated left panel + (chart 50 / order book 50) + positions */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left panel — Funds + Account + Order entry, all together */}
        <aside className="w-full flex-shrink-0 border-b border-dashed border-ash lg:w-80 lg:border-b-0 lg:border-r">
          <LeftDeskPanel symbol={symbol} />
        </aside>

        {/* Right region — chart + order book split 50/50, positions underneath */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Chart — half the freed space */}
            <div className="h-[55vh] min-w-0 border-b border-dashed border-ash lg:h-auto lg:flex-1 lg:border-b-0 lg:border-r">
              <TradingViewChart symbol={symbol} />
            </div>
            {/* Order book — the other half */}
            <div className="flex h-[26rem] min-w-0 flex-col lg:h-auto lg:flex-1">
              <OrderBook
                orderBook={ob.orderBook}
                recentTrades={ob.recentTrades}
                currentPrice={ob.currentPrice}
                priceChange24h={ob.priceChange24h}
              />
            </div>
          </div>

          {/* Open positions — thin strip spanning the right region */}
          <div className="flex-shrink-0 border-t border-dashed border-ash bg-smoke/40">
            <div className="border-b border-dashed border-ash px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
                // open positions
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto scrollbar-thin">
              <PositionsPanel />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
