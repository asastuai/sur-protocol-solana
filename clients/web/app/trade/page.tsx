"use client";

import { useMemo, useState } from "react";
import { MarketHeader } from "@/components/trading/MarketHeader";
import { OrderPanel } from "@/components/trading/OrderPanel";
import { PositionsPanel } from "@/components/trading/PositionsPanel";
import { AccountPanel } from "@/components/trading/AccountPanel";
import { DepositWithdrawPanel } from "@/components/trading/DepositWithdrawPanel";
import { Chart } from "@/components/trading/Chart";
import { findMarket } from "@/lib/markets";

type LeftTab = "funds" | "account";
type BottomTab = "positions";

export default function TradePage() {
  const [symbol, setSymbol] = useState("BTC-USD");
  const [leftTab, setLeftTab] = useState<LeftTab>("funds");
  const [bottomTab] = useState<BottomTab>("positions");

  const selectedMarketId = useMemo(
    () => findMarket(symbol)?.marketId ?? new Uint8Array(32),
    [symbol],
  );

  return (
    <div className="h-full min-h-[calc(100vh-12rem)] flex flex-col">
      <MarketHeader symbol={symbol} onSelect={setSymbol} />

      <div className="flex-1 flex min-h-0">
        {/* Left rail — funds + account */}
        <aside className="hidden lg:flex flex-col w-72 border-r border-sur-border bg-sur-surface/40">
          <div className="px-3 py-2 border-b border-sur-border flex gap-1">
            {(["funds", "account"] as LeftTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setLeftTab(t)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded transition-colors ${
                  leftTab === t
                    ? "bg-sur-border/60 text-sur-text"
                    : "text-sur-muted hover:text-sur-text"
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
          <Chart marketId={selectedMarketId} symbol={symbol} />
          <div className="border-t border-sur-border bg-sur-surface/40">
            <div className="px-3 py-2 border-b border-sur-border">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sur-muted">
                {bottomTab === "positions" ? "Positions" : ""}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <PositionsPanel />
            </div>
          </div>
        </section>

        {/* Right rail — order panel */}
        <aside className="hidden md:flex flex-col w-72 border-l border-sur-border bg-sur-surface/40">
          <OrderPanel symbol={symbol} />
        </aside>
      </div>
    </div>
  );
}
