"use client";

/**
 * Live order-book feed from Binance (REAL market data — no synthetic/hardcoded
 * fallback). Used while SUR's own on-chain/backend order book isn't synced on
 * devnet yet. Maps SUR market symbols -> Binance spot symbols. When SUR
 * publishes its own book, swap this hook's source and the UI stays the same.
 */

import { useEffect, useRef, useState } from "react";

export interface OBEntry {
  price: number;
  size: number;
  total: number;
  percentage: number;
}

export interface OB {
  bids: OBEntry[];
  asks: OBEntry[];
  spread: number;
  spreadPercentage: number;
}

export interface OBTrade {
  id: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  timestamp: number;
}

const EMPTY: OB = { bids: [], asks: [], spread: 0, spreadPercentage: 0 };

const BINANCE_SYMBOL: Record<string, string> = {
  "BTC-USD": "btcusdt",
  "SOL-USD": "solusdt",
  "ETH-USD": "ethusdt",
};

function toLevels(raw: [string, string][]): OBEntry[] {
  let cum = 0;
  const rows = raw.map(([p, q]) => {
    const price = parseFloat(p);
    const size = parseFloat(q);
    cum += size;
    return { price, size, total: cum };
  });
  const max = rows.length ? rows[rows.length - 1].total : 1;
  return rows.map((r) => ({ ...r, percentage: max > 0 ? (r.total / max) * 100 : 0 }));
}

export function useBinanceOrderbook(symbol: string) {
  const sym = BINANCE_SYMBOL[symbol] ?? "btcusdt";
  const [orderBook, setOrderBook] = useState<OB>(EMPTY);
  const [recentTrades, setRecentTrades] = useState<OBTrade[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange24h, setPriceChange24h] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    setOrderBook(EMPTY);
    setRecentTrades([]);
    setCurrentPrice(0);
    setPriceChange24h(0);

    // Real 24h stats (REST), refreshed periodically
    const fetch24h = () => {
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym.toUpperCase()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !closed) {
            setPriceChange24h(parseFloat(d.priceChangePercent) || 0);
            setCurrentPrice((p) => p || parseFloat(d.lastPrice) || 0);
          }
        })
        .catch(() => {});
    };
    fetch24h();
    const t24 = setInterval(fetch24h, 30_000);

    const url = `wss://stream.binance.com:9443/stream?streams=${sym}@depth20@100ms/${sym}@aggTrade`;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const stream: string = msg.stream || "";
          const data = msg.data;
          if (!data) return;

          if (stream.includes("@depth")) {
            const bids = toLevels(data.bids || []);
            const asks = toLevels(data.asks || []);
            const bestBid = bids[0]?.price ?? 0;
            const bestAsk = asks[0]?.price ?? 0;
            const spread = bestBid && bestAsk ? bestAsk - bestBid : 0;
            const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
            setOrderBook({
              bids,
              asks,
              spread,
              spreadPercentage: mid > 0 ? (spread / mid) * 100 : 0,
            });
          } else if (stream.includes("@aggTrade")) {
            const price = parseFloat(data.p);
            const size = parseFloat(data.q);
            if (!Number.isFinite(price)) return;
            const trade: OBTrade = {
              id: String(data.a ?? data.T),
              price,
              size,
              side: data.m ? "sell" : "buy",
              timestamp: data.T ?? Date.now(),
            };
            setCurrentPrice(price);
            setRecentTrades((prev) => [trade, ...prev].slice(0, 50));
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      closed = true;
      clearInterval(t24);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [sym]);

  return { orderBook, recentTrades, currentPrice, priceChange24h };
}
