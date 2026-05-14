"use client";

import { useState, useRef, useEffect } from "react";
import { useMarketState } from "@/hooks/data/use-market-state";
import { findMarket } from "@/lib/markets";
import { formatBN, PRICE_DECIMALS, SIZE_DECIMALS } from "@/lib/formatters";
import { MarketSelector } from "./MarketSelector";

interface Props {
  symbol: string;
  onSelect: (symbol: string) => void;
}

export function MarketHeader({ symbol, onSelect }: Props) {
  const market = findMarket(symbol);
  const { market: state, loading } = useMarketState(
    market?.marketId ?? new Uint8Array(32),
  );
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

  const price = state ? `$${formatBN(state.markPrice, PRICE_DECIMALS, 2)}` : "—";
  const oiLong = state ? formatBN(state.openInterestLong, SIZE_DECIMALS, 4) : "—";
  const oiShort = state ? formatBN(state.openInterestShort, SIZE_DECIMALS, 4) : "—";
  const wsColor = state ? "#0ECB81" : loading ? "#F0B90B" : "#F6465D";
  const wsLabel = state ? "On-chain" : loading ? "Loading…" : "Uninit";

  return (
    <header className="h-10 border-b border-sur-border bg-sur-bg/50 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="relative" ref={wrapperRef}>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Select market"
            aria-expanded={open}
            className="flex items-center gap-2 px-2.5 py-1 rounded hover:bg-white/[0.04] transition-colors"
          >
            <span className="font-semibold text-sm">{symbol}</span>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              className={`text-sur-muted transition-transform ${open ? "rotate-180" : ""}`}
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

        <div className="w-px h-5 bg-sur-border" />

        <div className="flex items-center gap-3">
          <span className="tabular-nums font-semibold text-sm">{price}</span>
        </div>

        <div className="hidden lg:flex items-center gap-5 text-[11px] text-sur-muted">
          <div>
            <span className="mr-1.5">OI Long</span>
            <span className="text-sur-text tabular-nums">{oiLong}</span>
          </div>
          <div>
            <span className="mr-1.5">OI Short</span>
            <span className="text-sur-text tabular-nums">{oiShort}</span>
          </div>
          <div>
            <span className="mr-1.5">Leverage</span>
            <span className="text-sur-text tabular-nums">{market?.maxLeverage ?? "—"}x</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: wsColor }} />
          <span className="text-[10px] text-sur-muted">{wsLabel}</span>
        </div>
      </div>
    </header>
  );
}
