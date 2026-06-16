"use client";

/**
 * Lightweight live 24h stats for a market (REST poll to Binance — real data).
 * Used for the trade header stat strip (price, 24h %, volume) while SUR's
 * on-chain mark/oracle are uninitialized on devnet.
 */

import { useEffect, useState } from "react";

const BINANCE_SYMBOL: Record<string, string> = {
  "BTC-USD": "BTCUSDT",
  "SOL-USD": "SOLUSDT",
  "ETH-USD": "ETHUSDT",
};

export interface BinanceStats {
  price: number;
  changePercent: number;
  volume: number;
  loading: boolean;
}

export function useBinanceStats(symbol: string): BinanceStats {
  const sym = BINANCE_SYMBOL[symbol] ?? "BTCUSDT";
  const [stats, setStats] = useState<BinanceStats>({
    price: 0,
    changePercent: 0,
    volume: 0,
    loading: true,
  });

  useEffect(() => {
    let closed = false;
    setStats((p) => ({ ...p, loading: true }));

    const fetchStats = () => {
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || closed) return;
          setStats({
            price: parseFloat(d.lastPrice) || 0,
            changePercent: parseFloat(d.priceChangePercent) || 0,
            volume: parseFloat(d.quoteVolume) || 0,
            loading: false,
          });
        })
        .catch(() => {
          if (!closed) setStats((p) => ({ ...p, loading: false }));
        });
    };

    fetchStats();
    const id = setInterval(fetchStats, 15_000);
    return () => {
      closed = true;
      clearInterval(id);
    };
  }, [sym]);

  return stats;
}
