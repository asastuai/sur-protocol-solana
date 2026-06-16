"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { OrderPanel } from "./OrderPanel";
import { AccountPanel } from "./AccountPanel";
import { DepositWithdrawPanel } from "./DepositWithdrawPanel";

type ChromeTab = "funds" | "account";

/**
 * Consolidated trade-desk left panel: a compact Funds/Account tab strip
 * (the "chrome" — only one renders at a time so it stays breathable) sitting
 * above the always-visible Order entry form. Collapsing the old split rails
 * (funds far-left, order far-right) into one column frees the right side for
 * the chart + order book to split 50/50.
 */
export function LeftDeskPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<ChromeTab>("funds");

  return (
    <div className="flex h-full flex-col bg-smoke/40 font-mono">
      {/* Chrome tab strip */}
      <div className="flex flex-shrink-0 gap-1 border-b border-dashed border-ash px-3 py-2">
        {(["funds", "account"] as ChromeTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-none border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
              tab === t
                ? "border-gold text-gold bg-gold/10"
                : "border-transparent text-sur-muted hover:text-bone",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Chrome body — one panel at a time */}
      <div className="flex-shrink-0 border-b border-dashed border-ash">
        {tab === "funds" ? <DepositWithdrawPanel /> : <AccountPanel />}
      </div>

      {/* Order entry — primary, scrolls if tall */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <OrderPanel symbol={symbol} />
      </div>
    </div>
  );
}
