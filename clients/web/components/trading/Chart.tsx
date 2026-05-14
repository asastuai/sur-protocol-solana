"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
} from "lightweight-charts";
import { PublicKey } from "@solana/web3.js";

import { useMarketState } from "@/hooks/data/use-market-state";
import { bnToNumber, PRICE_DECIMALS } from "@/lib/formatters";
import {
  aggregateCandles,
  DEFAULT_CANDLE_WINDOW_SEC,
  DEFAULT_SAMPLE_INTERVAL_MS,
  type PriceSample,
} from "@/lib/candles";

interface Props {
  marketId: Uint8Array | PublicKey;
  symbol: string;
  height?: number;
  /** Candle width in seconds. Defaults to 60s (1-minute candles). */
  windowSec?: number;
  /** Mark price polling interval in milliseconds. Defaults to 2500ms. */
  pollIntervalMs?: number;
}

/**
 * Trading chart for a single perpetual market.
 *
 * Reads mark price from the on-chain Market PDA via `useMarketState`, polls
 * at `pollIntervalMs`, and aggregates samples into client-side candles. No
 * external price feeds (no Binance, no Pyth WS) — this is fully Solana-native
 * for v0.3 devnet.
 *
 * Gracefully degrades when the market isn't initialized on-chain yet: shows a
 * faint dashed grid + an inline "No price data yet" message and never throws.
 */
export function Chart({
  marketId,
  symbol,
  height = 380,
  windowSec = DEFAULT_CANDLE_WINDOW_SEC,
  pollIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const samplesRef = useRef<PriceSample[]>([]);
  const lastSampleAtRef = useRef<number>(0);

  // Stable poll: React Query inside useMarketState refetches; we also force a
  // refetch on `pollIntervalMs` so the candle pipeline ticks predictably even
  // when the market data hasn't changed.
  const { market, refetch } = useMarketState(marketId);

  // Reset state when switching markets so we don't bleed BTC samples into SOL.
  const marketKey = useMemo(() => {
    const bytes = marketId instanceof PublicKey ? marketId.toBytes() : marketId;
    return Buffer.from(bytes).toString("hex");
  }, [marketId]);

  useEffect(() => {
    samplesRef.current = [];
    lastSampleAtRef.current = 0;
    if (seriesRef.current) {
      seriesRef.current.setData([]);
    }
  }, [marketKey]);

  // Build chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#848E9C",
        fontFamily:
          "Inter, DM Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(30, 35, 41, 0.6)", style: 1 },
        horzLines: { color: "rgba(30, 35, 41, 0.6)", style: 1 },
      },
      rightPriceScale: {
        borderColor: "#1E2329",
      },
      timeScale: {
        borderColor: "#1E2329",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
      },
      autoSize: false,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#0ECB81",
      downColor: "#F6465D",
      wickUpColor: "#0ECB81",
      wickDownColor: "#F6465D",
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Keep chart sized to container.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.applyOptions({ width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Sample mark price each time the query data changes, throttled so we don't
  // double-sample in the same poll interval if React re-renders for other
  // reasons.
  useEffect(() => {
    if (!market) return;
    const priceNum = bnToNumber(market.markPrice, PRICE_DECIMALS);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return;

    const now = Math.floor(Date.now() / 1000);
    if (now - lastSampleAtRef.current < Math.floor(pollIntervalMs / 1000)) {
      // Still update the last candle's close in real time even when throttled.
      const latest = samplesRef.current[samplesRef.current.length - 1];
      if (latest && latest.ts === now) {
        latest.price = priceNum;
      }
    } else {
      lastSampleAtRef.current = now;
      samplesRef.current.push({ ts: now, price: priceNum });
      // Bound memory: keep ~24h of 2.5s samples max ((24*3600)/2.5 ≈ 34,560).
      if (samplesRef.current.length > 40_000) {
        samplesRef.current = samplesRef.current.slice(-30_000);
      }
    }

    const candles: CandlestickData[] = aggregateCandles(
      samplesRef.current,
      windowSec,
    );
    if (seriesRef.current && candles.length > 0) {
      seriesRef.current.setData(candles);
    }
  }, [market, windowSec, pollIntervalMs]);

  // Drive the poll loop independently from React Query's defaults so we get a
  // predictable cadence regardless of focus/visibility.
  useEffect(() => {
    const id = window.setInterval(() => {
      refetch();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [refetch, pollIntervalMs]);

  const hasData = !!market && bnToNumber(market.markPrice, PRICE_DECIMALS) > 0;

  return (
    <div className="flex-1 flex flex-col bg-sur-bg/40 border-b border-sur-border relative min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-sur-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-sur-muted">
            {symbol}
          </span>
          <span className="text-[10px] text-sur-muted">
            · {windowSec >= 60 ? `${Math.round(windowSec / 60)}m` : `${windowSec}s`} candles
          </span>
        </div>
        <span className="text-[10px] text-sur-muted">
          {hasData ? "Live · on-chain mark" : "Awaiting on-chain data"}
        </span>
      </div>

      <div className="relative flex-1 min-h-0" style={{ minHeight: height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-1.5 px-4">
              <div className="text-xs text-sur-muted">
                No price data — market not initialized yet on devnet
              </div>
              <div className="text-[10px] text-sur-muted/70">
                Candles will populate once mark price is set on-chain
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
