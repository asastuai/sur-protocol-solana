"use client";

// ============================================================
//        TRADING VIEW — Advanced Chart (live, themed)
// ============================================================
// The on-chain mark price is static on devnet, so an on-chain-sampled chart is
// a flat line. This embeds TradingView's free widget (tv.js) pointed at the
// matching Binance pair — real-time price, full timeframes, drawing tools,
// indicators & parameters — themed to SUR (green dotted crosshair, #191919 bg,
// SUR candle colors). Display only; on-chain settlement reads the oracle.

import { useEffect, useRef, memo } from "react";
import { findCatalogMarket } from "@/lib/market-catalog";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

/** SUR symbol ("BTC-USD") -> TradingView symbol ("BINANCE:BTCUSDT"). */
function tvSymbol(symbol: string): string {
  const c = findCatalogMarket(symbol);
  return c ? `BINANCE:${c.binanceSymbol.toUpperCase()}` : "BINANCE:BTCUSDT";
}

const TV_SRC = "https://s3.tradingview.com/tv.js";
let tvLoad: Promise<void> | null = null;
function loadTradingView(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvLoad) return tvLoad;
  tvLoad = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TV_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load tv.js"));
    document.head.appendChild(s);
  });
  return tvLoad;
}

let counter = 0;

const OVERRIDES: Record<string, string | number> = {
  "paneProperties.background": "#191919",
  "paneProperties.backgroundType": "solid",
  "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.04)",
  "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.04)",
  // Green dotted crosshair, matching the price line.
  "paneProperties.crossHairProperties.color": "#0ECB81",
  "paneProperties.crossHairProperties.style": 1, // 1 = dotted
  "paneProperties.crossHairProperties.width": 1,
  "scalesProperties.backgroundColor": "#191919",
  "scalesProperties.lineColor": "rgba(255,255,255,0.10)",
  "scalesProperties.textColor": "#848E9C",
  // SUR candle palette.
  "mainSeriesProperties.candleStyle.upColor": "#0ECB81",
  "mainSeriesProperties.candleStyle.downColor": "#F6465D",
  "mainSeriesProperties.candleStyle.borderUpColor": "#0ECB81",
  "mainSeriesProperties.candleStyle.borderDownColor": "#F6465D",
  "mainSeriesProperties.candleStyle.wickUpColor": "#0ECB81",
  "mainSeriesProperties.candleStyle.wickDownColor": "#F6465D",
};

function TradingViewChartInner({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>(`tv_chart_${(counter += 1)}`);

  useEffect(() => {
    let cancelled = false;
    const id = idRef.current;

    loadTradingView()
      .then(() => {
        const host = hostRef.current;
        if (cancelled || !host || !window.TradingView) return;
        host.innerHTML = "";
        const inner = document.createElement("div");
        inner.id = id;
        inner.style.height = "100%";
        inner.style.width = "100%";
        host.appendChild(inner);

        new window.TradingView.widget({
          container_id: id,
          autosize: true,
          symbol: tvSymbol(symbol),
          interval: "15",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1", // candles
          locale: "en",
          toolbar_bg: "#191919",
          enable_publishing: false,
          hide_side_toolbar: false, // drawing tools
          allow_symbol_change: false,
          withdateranges: true,
          details: false,
          overrides: OVERRIDES,
        });
      })
      .catch(() => {
        /* network blocked — leave the empty host */
      });

    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [symbol]);

  return <div className="h-full w-full bg-[#191919]" ref={hostRef} />;
}

export const TradingViewChart = memo(TradingViewChartInner);
export default TradingViewChart;
