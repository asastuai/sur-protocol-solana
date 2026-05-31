"use client";

import { useId, useMemo } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { bnToNumber, fmtPrice, fmtPct, PRICE_DECIMALS } from "@/lib/formatters";
import type { MarketMeta } from "@/lib/markets";
import { useMarketState } from "@/hooks/data/use-market-state";
import {
  useMarkPriceHistory,
  type PriceSample,
} from "@/hooks/data/use-mark-price-history";

interface MarketCardProps {
  market: MarketMeta;
  className?: string;
}

const SPARK_W = 120;
const SPARK_H = 36;

/**
 * Build an SVG polyline `points` string from price samples, normalized to
 * the sparkline box. Fewer than two samples yields a flat baseline so the
 * card always renders something rather than an empty box.
 */
function buildSparkPoints(samples: PriceSample[]): {
  points: string;
  flat: boolean;
} {
  if (samples.length < 2) {
    const mid = SPARK_H / 2;
    return { points: `0,${mid} ${SPARK_W},${mid}`, flat: true };
  }

  const prices = samples.map((s) => s.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  const stepX = SPARK_W / (samples.length - 1);
  // Inset vertically so the stroke never clips at the box edges.
  const pad = 3;
  const usableH = SPARK_H - pad * 2;

  const points = samples
    .map((s, i) => {
      const x = i * stepX;
      const norm = span === 0 ? 0.5 : (s.price - min) / span;
      // SVG y grows downward — invert so higher price sits higher.
      const y = pad + (1 - norm) * usableH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return { points, flat: span === 0 };
}

/**
 * Clickable market thumbnail. Reads the live Market PDA, samples a local
 * price history into a mini sparkline (--sur-gradient stroke), and surfaces
 * OI + max-leverage badges. Links to the trade view for the symbol.
 *
 * Degrades gracefully: when the market isn't initialized on-chain yet it
 * shows a muted "awaiting on-chain data" flatline instead of erroring.
 */
export function MarketCard({ market, className }: MarketCardProps) {
  const { market: state, loading } = useMarketState(market.marketId);

  const history = useMarkPriceHistory(
    market.symbol,
    state?.markPrice,
    state?.lastPriceUpdate,
  );

  const markPrice = state ? bnToNumber(state.markPrice, PRICE_DECIMALS) : 0;
  const hasPrice = markPrice > 0;

  // Derive change from the oldest vs. newest sample we have locally.
  // This is "since this session opened", not a true 24h window — only
  // shown once we have enough samples to be meaningful.
  const changePct = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].price;
    const last = history[history.length - 1].price;
    if (!Number.isFinite(first) || first <= 0) return null;
    return ((last - first) / first) * 100;
  }, [history]);

  const { points, flat } = useMemo(
    () => buildSparkPoints(history),
    [history],
  );

  // OI = long + short, in price units (PRICE_DECIMALS on-chain notional).
  const openInterest = useMemo(() => {
    if (!state) return 0;
    const long = bnToNumber(state.openInterestLong, PRICE_DECIMALS);
    const short = bnToNumber(state.openInterestShort, PRICE_DECIMALS);
    return long + short;
  }, [state]);

  const gradientId = useId();
  const changeUp = changePct != null && changePct >= 0;
  const strokeColor = flat
    ? "var(--sur-muted)"
    : `url(#${gradientId})`;

  return (
    <Link
      href={`/trade?symbol=${encodeURIComponent(market.symbol)}`}
      className={cn(
        "group block rounded-xl border border-sur-border bg-sur-surface p-4 transition-colors hover:border-white/15 hover:bg-sur-surface-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-sur-text">
              {market.baseAsset}
            </span>
            <span className="text-[11px] text-sur-muted">
              {market.quoteAsset}
            </span>
          </div>
          <div className="mt-1 font-mono text-lg tabular-nums text-sur-text">
            {hasPrice ? (
              <>
                <span className="text-sur-muted">$</span>
                {fmtPrice(markPrice)}
              </>
            ) : loading ? (
              <span className="text-sur-muted">—</span>
            ) : (
              <span className="text-[12px] font-sans text-sur-muted">
                awaiting on-chain data
              </span>
            )}
          </div>
        </div>

        {changePct != null && (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              changeUp
                ? "bg-sur-green/10 text-sur-green"
                : "bg-sur-red/10 text-sur-red",
            )}
          >
            {fmtPct(changePct)}
          </span>
        )}
      </div>

      {/* Mini sparkline */}
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        width="100%"
        height={SPARK_H}
        preserveAspectRatio="none"
        className="mt-3 overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9945FF" />
            <stop offset="100%" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={flat ? 0.4 : 1}
        />
      </svg>

      {/* Badges */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="rounded border border-sur-border px-1.5 py-0.5 text-sur-muted">
          {market.maxLeverage}x max
        </span>
        <span className="text-sur-muted tabular-nums">
          OI{" "}
          <span className="font-mono text-sur-text">
            {openInterest > 0
              ? `$${fmtPrice(openInterest)}`
              : "—"}
          </span>
        </span>
      </div>
    </Link>
  );
}
