"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useMarketState } from "@/hooks/data/use-market-state";
import { useBinanceStats } from "@/hooks/data/use-binance-stats";
import { findMarket } from "@/lib/markets";
import { formatBN, PRICE_DECIMALS } from "@/lib/formatters";
import { MarketSelector } from "./MarketSelector";

interface Props {
  symbol: string;
  onSelect: (symbol: string) => void;
}

function fmtUsd(n: number): string {
  return n >= 1
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(4);
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function Cell({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.12em] text-sur-muted">
        {label}
      </span>
      <span className={`whitespace-nowrap text-[12px] font-semibold tabular-nums ${className ?? "text-bone"}`}>
        {value}
      </span>
    </div>
  );
}

export function MarketHeader({ symbol, onSelect }: Props) {
  const market = findMarket(symbol);
  const { market: state, loading } = useMarketState(market?.marketId ?? new Uint8Array(32));
  const stats = useBinanceStats(symbol);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const up = stats.changePercent >= 0;
  const markPrice = stats.price > 0 ? `$${fmtUsd(stats.price)}` : "—";
  const oracle =
    state && !state.indexPrice.isZero() ? `$${formatBN(state.indexPrice, PRICE_DECIMALS, 2)}` : "—";
  const dotColor = state ? "var(--gold)" : loading ? "#F0B90B" : "#F6465D";
  const dotLabel = state ? "On-chain" : loading ? "Loading" : "Devnet uninit";

  return (
    <header className="flex flex-shrink-0 items-center justify-between gap-4 overflow-x-auto border-b border-dashed border-ash bg-ink px-4 py-2 font-mono scrollbar-thin">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" ref={wrapperRef}>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Select market"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-none border border-transparent px-2 py-1 transition-colors hover:border-ash"
          >
            <span className="font-display text-[15px] font-bold text-bone">{symbol}</span>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              className={`text-gold transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <MarketSelector
            selectedSymbol={symbol}
            onSelect={onSelect}
            open={open}
            onClose={() => setOpen(false)}
          />
        </div>

        <div className="h-7 w-px shrink-0 bg-ash" />

        <div className="flex items-center gap-5 sm:gap-6">
          <Cell label="Mark" value={markPrice} />
          <Cell label="Oracle" value={oracle} />
          <Cell
            label="24h"
            value={`${up ? "+" : ""}${stats.changePercent.toFixed(2)}%`}
            className={up ? "text-sur-green" : "text-sur-red"}
          />
          <Cell label="24h Vol" value={stats.volume > 0 ? fmtCompact(stats.volume) : "—"} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full live-dot" style={{ background: dotColor }} />
        <span className="text-[10px] uppercase tracking-[0.14em] text-sur-muted">{dotLabel}</span>
      </div>
    </header>
  );
}
