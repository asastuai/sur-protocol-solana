"use client";

import { useState } from "react";
import { MarketHeader } from "@/components/trading/MarketHeader";
import { OrderPanel } from "@/components/trading/OrderPanel";
import { PositionsPanel } from "@/components/trading/PositionsPanel";
import { AccountPanel } from "@/components/trading/AccountPanel";
import { DepositWithdrawPanel } from "@/components/trading/DepositWithdrawPanel";
import { TradingViewChart } from "@/components/trading/TradingViewChart";
import { Stamp, useClock } from "@/components/dossier/kit";
import { OrderBook } from "@/components/trading/OrderBook";
import { useBinanceOrderbook } from "@/hooks/data/use-binance-orderbook";

type LeftTab = "funds" | "account";
type BottomTab = "positions";

export default function TradePage() {
  const [symbol, setSymbol] = useState("BTC-USD");
  const [leftTab, setLeftTab] = useState<LeftTab>("funds");
  const [bottomTab] = useState<BottomTab>("positions");
  const clock = useClock();
  const ob = useBinanceOrderbook(symbol);

  return (
    <div className="h-full min-h-[calc(100vh-12rem)] flex flex-col bg-ink text-bone font-mono">
      {/* Dossier console bar — compact terminal header above the trade desk */}
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-dashed border-ash px-4 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
        <span className="text-gold">SUR://trade</span>
        <span className="flex items-center gap-3">
          <Stamp>Devnet // 2026</Stamp>
          <span className="hidden sm:inline tabular-nums">{clock}</span>
        </span>
      </div>

      <MarketHeader symbol={symbol} onSelect={setSymbol} />

      <div className="flex-1 flex min-h-0">
        {/* Left rail — funds + account */}
        <aside className="hidden lg:flex flex-col w-72 border-r border-dashed border-ash bg-smoke/40">
          <div className="px-3 py-2 border-b border-dashed border-ash flex gap-1">
            {(["funds", "account"] as LeftTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setLeftTab(t)}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] rounded-none border transition-colors ${
                  leftTab === t
                    ? "border-gold text-gold bg-gold/10"
                    : "border-transparent text-sur-muted hover:text-bone"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {leftTab === "funds" ? <DepositWithdrawPanel /> : null}
            <AccountPanel />
          </div>
        </aside>

        {/* Center — chart + positions */}
        <section className="flex-1 flex flex-col min-w-0">
          <TradingViewChart symbol={symbol} />
          <div className="border-t border-dashed border-ash bg-smoke/40">
            <div className="px-3 py-2 border-b border-dashed border-ash">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
                // {bottomTab === "positions" ? "open positions" : ""}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <PositionsPanel />
            </div>
          </div>
        </section>

        {/* Order book — live real feed (Binance) with flashes, dossier-themed */}
        <aside className="hidden xl:flex flex-col w-[300px] border-l border-dashed border-ash bg-smoke/40">
          <div className="px-3 py-2 border-b border-dashed border-ash">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
              // order book
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <OrderBook
              orderBook={ob.orderBook}
              recentTrades={ob.recentTrades}
              currentPrice={ob.currentPrice}
              priceChange24h={ob.priceChange24h}
            />
          </div>
        </aside>

        {/* Right rail — order panel */}
        <aside className="hidden md:flex flex-col w-72 border-l border-dashed border-ash bg-smoke/40">
          <OrderPanel symbol={symbol} />
        </aside>
      </div>
    </div>
  );
}
