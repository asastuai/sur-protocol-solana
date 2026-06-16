"use client";

/**
 * Real-time price chart via the TradingView embedded widget (live data for all
 * assets — no devnet/on-chain dependency). Symbol follows the selected market.
 * Dark theme tuned to the dossier palette. Client-only (loads tv.js).
 */

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const TV_SYMBOL: Record<string, string> = {
  "BTC-USD": "BINANCE:BTCUSDT",
  "SOL-USD": "BINANCE:SOLUSDT",
  "ETH-USD": "BINANCE:ETHUSDT",
};

const CONTAINER_ID = "sur-tv-chart";
const SCRIPT_SRC = "https://s3.tradingview.com/tv.js";

export function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tvSymbol = TV_SYMBOL[symbol] ?? "BINANCE:BTCUSDT";

  useEffect(() => {
    let cancelled = false;

    const build = () => {
      if (cancelled || !window.TradingView || !ref.current) return;
      ref.current.innerHTML = "";
      // eslint-disable-next-line no-new
      new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0a0a0a",
        enable_publishing: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        save_image: false,
        container_id: CONTAINER_ID,
        backgroundColor: "#0a0a0a",
        gridColor: "rgba(42, 42, 42, 0.5)",
      });
    };

    if (window.TradingView) {
      build();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener("load", build, { once: true });
    }

    return () => {
      cancelled = true;
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [tvSymbol]);

  return (
    <div className="relative h-full w-full bg-ink">
      <div id={CONTAINER_ID} ref={ref} className="h-full w-full" />
    </div>
  );
}
