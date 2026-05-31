"use client";

// ============================================================
//        LIVE CHART — lightweight-charts + Binance feed
// ============================================================
// Full programmatic control of styling (green dotted crosshair, #191919 bg,
// green dotted price line, SUR candle colors) with real-time Binance candles
// (REST history + WS live) and timeframe switching. Display only; on-chain
// settlement reads the oracle.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/cn";
import { findCatalogMarket } from "@/lib/market-catalog";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const BG = "#191919";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function binanceSymbol(symbol: string): string {
  return findCatalogMarket(symbol)?.binanceSymbol.toUpperCase() ?? "BTCUSDT";
}

async function fetchKlines(
  sym: string,
  interval: string,
): Promise<CandlestickData[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const arr = (await res.json()) as unknown[][];
  return arr.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000) as UTCTimestamp,
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  }));
}

export function LiveChart({ symbol }: { symbol: string }) {
  const [tf, setTf] = useState<Timeframe>("15m");
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const sym = useMemo(() => binanceSymbol(symbol), [symbol]);

  // Create the chart once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: "#848E9C",
        fontFamily:
          "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: GREEN,
          style: LineStyle.Dotted,
          width: 1,
          labelBackgroundColor: GREEN,
        },
        horzLine: {
          color: GREEN,
          style: LineStyle.Dotted,
          width: 1,
          labelBackgroundColor: GREEN,
        },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceLineVisible: true,
      priceLineColor: GREEN,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load history + live WS on symbol / timeframe change.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    let cancelled = false;

    series.setData([]);
    void fetchKlines(sym, tf).then((data) => {
      if (cancelled || !seriesRef.current) return;
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    });

    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`,
    );
    ws.onmessage = (ev) => {
      try {
        const k = JSON.parse(ev.data as string).k;
        seriesRef.current?.update({
          time: Math.floor(Number(k.t) / 1000) as UTCTimestamp,
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
        });
      } catch {
        /* ignore malformed frame */
      }
    };

    return () => {
      cancelled = true;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, [sym, tf]);

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: BG }}>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-sur-border flex-shrink-0">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              "px-2 py-0.5 text-[11px] rounded font-medium transition-colors",
              tf === t
                ? "bg-sur-accent/15 text-sur-accent"
                : "text-sur-muted hover:text-sur-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div ref={hostRef} className="flex-1 min-h-0" />
    </div>
  );
}

export default LiveChart;
