"use client";

// ============================================================
//          LIVE BINANCE PRICE FEED (display only)
// ============================================================
// One shared WebSocket for the whole app (singleton) streaming the combined
// `<symbol>@ticker` channels for every catalog market, seeded by a REST call
// for instant first paint, with auto-reconnect and throttled snapshots so the
// UI never thrashes. Public market data — DISPLAY ONLY; on-chain settlement
// reads the protocol oracle, never this.

import { useSyncExternalStore } from "react";
import {
  CATALOG_BINANCE_SYMBOLS,
  BINANCE_TO_SYMBOL,
} from "@/lib/market-catalog";

export interface LiveTicker {
  price: number;
  change24h: number; // percent
  volume24h: number; // quote volume (USD)
  high24h: number;
  low24h: number;
}
export type LivePriceMap = Record<string, LiveTicker>;

const REST_URL = "https://api.binance.com/api/v3/ticker/24hr";
const WS_URL = "wss://stream.binance.com:9443/stream";
const THROTTLE_MS = 500;
const RECONNECT_MS = 3000;

// ---- singleton state (shared across all hook consumers) ----
let started = false;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

const data = new Map<string, LiveTicker>(); // keyed by catalog symbol ("BTC-USD")
let snapshot: LivePriceMap = {};
const listeners = new Set<() => void>();

function rebuildSnapshot() {
  const next: LivePriceMap = {};
  data.forEach((v, k) => {
    next[k] = v;
  });
  snapshot = next;
}

function scheduleNotify() {
  dirty = true;
  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    if (!dirty) return;
    dirty = false;
    rebuildSnapshot();
    listeners.forEach((l) => l());
  }, THROTTLE_MS);
}

interface RawTicker {
  s?: string; // symbol
  c?: string; // last price
  P?: string; // price change percent
  q?: string; // quote volume
  h?: string; // high
  l?: string; // low
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  highPrice?: string;
  lowPrice?: string;
}

function applyTicker(rawSymbolUpper: string, t: RawTicker) {
  const sym = BINANCE_TO_SYMBOL[rawSymbolUpper];
  if (!sym) return;
  const price = parseFloat((t.c ?? t.lastPrice) || "0");
  if (!Number.isFinite(price) || price <= 0) return;
  data.set(sym, {
    price,
    change24h: parseFloat((t.P ?? t.priceChangePercent) || "0") || 0,
    volume24h: parseFloat((t.q ?? t.quoteVolume) || "0") || 0,
    high24h: parseFloat((t.h ?? t.highPrice) || "0") || 0,
    low24h: parseFloat((t.l ?? t.lowPrice) || "0") || 0,
  });
  scheduleNotify();
}

async function seedRest() {
  try {
    const symbols = CATALOG_BINANCE_SYMBOLS.map((s) => s.toUpperCase());
    const url = `${REST_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const arr = (await res.json()) as RawTicker[];
    for (const t of arr) {
      if (t.symbol) applyTicker(String(t.symbol).toUpperCase(), t);
    }
  } catch {
    /* ignore — WS will fill in */
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function connect() {
  if (typeof window === "undefined") return;
  const streams = CATALOG_BINANCE_SYMBOLS.map((s) => `${s}@ticker`).join("/");
  try {
    ws = new WebSocket(`${WS_URL}?streams=${streams}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      const d: RawTicker | undefined = msg?.data;
      if (d && d.s) applyTicker(String(d.s).toUpperCase(), d);
    } catch {
      /* ignore malformed frame */
    }
  };
  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  };
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  void seedRest();
  connect();
}

function subscribe(cb: () => void) {
  ensureStarted();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): LivePriceMap {
  return snapshot;
}
function getServerSnapshot(): LivePriceMap {
  return snapshot; // empty on the server — hydrates on the client
}

/** Live map of every catalog symbol -> ticker. Shares one WS app-wide. */
export function useBinancePrices(): LivePriceMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Live ticker for a single catalog symbol (e.g. "BTC-USD"). */
export function useBinanceTicker(symbol: string): LiveTicker | undefined {
  const map = useBinancePrices();
  return map[symbol];
}
