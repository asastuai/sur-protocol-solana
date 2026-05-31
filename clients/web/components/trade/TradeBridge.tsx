"use client";

// ============================================================
//  TradeBridge — on-chain data → trading-v2 prop shapes
// ============================================================
//
// The trading-v2 presentation components (TradeForm, OrderBookPanel,
// PositionsPanel, ...) consume the network-agnostic shapes in
// `@/lib/front-types` (Market / OrderBook / Trade / Position / Order).
//
// This module is the ONLY place that maps Solana on-chain reads (BN-based
// hooks under hooks/data/*) into those shapes. Keep all decimal math here so
// the page stays declarative.
//
// HONESTY NOTES (do not misrepresent — see app/trade/page.tsx disclaimer):
//   - There is NO on-chain order book. `useSimOrderBook` produces a SIMULATED
//     off-chain book/trade tape, seeded by the live on-chain mark price. It is
//     labeled "simulated" wherever it renders.
//   - Solana Market has no funding-rate field → fundingRate is forced to 0 and
//     the funding UI is never shown.

import { useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

import { useMarkets } from "@/hooks/data/use-markets";
import { useBinancePrices } from "@/hooks/data/use-binance-prices";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import type { MarketState } from "@/hooks/data/use-market-state";
import type { OpenPosition } from "@/hooks/data/use-open-positions";
import { MARKETS, type MarketMeta } from "@/lib/markets";
import { CATALOG } from "@/lib/market-catalog";
import { bnToNumber, PRICE_DECIMALS, SIZE_DECIMALS } from "@/lib/formatters";
import { createDemoOrderbook } from "@/lib/demo-orderbook";
import type {
  Market,
  OrderBook,
  Position,
  Order,
  Trade,
} from "@/lib/front-types";

const SIZE_SCALE = 10 ** SIZE_DECIMALS;

// ------------------------------------------------------------
// Decimal helpers (UI number ⇄ on-chain BN)
// ------------------------------------------------------------

/** Live mark price (PRICE_DECIMALS BN) → plain USD number, or 0 if unset. */
export function markPriceToNumber(markPrice: BN | undefined | null): number {
  return bnToNumber(markPrice, PRICE_DECIMALS);
}

/** UI size in base units (e.g. 0.1 BTC) → SIZE_DECIMALS BN, or null if invalid. */
export function sizeToBn(size: number): BN | null {
  if (!Number.isFinite(size) || size <= 0) return null;
  return new BN(Math.round(size * SIZE_SCALE));
}

// ------------------------------------------------------------
// Markets bridge — on-chain Market PDAs → trading-v2 Market[]
// ------------------------------------------------------------

export interface MarketsBridge {
  /** All configured markets, mapped for the selector + header. */
  markets: Market[];
  /** The market matching `symbol`, or the first available, or a zero stub. */
  selectedMarket: Market;
  /** The static UI metadata (marketId bytes, maxLeverage) for `symbol`. */
  selectedMeta: MarketMeta | undefined;
  /** The raw on-chain state for the selected market (markPrice as BN, ...). */
  selectedState: MarketState | undefined;
  loading: boolean;
}

/**
 * Maps on-chain markets into trading-v2 `Market` shapes.
 *
 * Markets that exist on-chain contribute their live mark/index price; the
 * three configured markets (BTC/SOL/ETH) always appear in the list so the UI
 * is stable even before Phase 9 init (uninitialized → price 0, handled by the
 * "awaiting on-chain data" affordances downstream).
 *
 * fundingRate is hard-zeroed: the Solana Market account has no funding field.
 */
export function useMarketsBridge(symbol: string): MarketsBridge {
  const { markets: onChain, loading } = useMarkets();

  // Index on-chain state by symbol for O(1) lookup.
  const stateBySymbol = useMemo(() => {
    const map = new Map<string, MarketState>();
    for (const m of onChain) map.set(m.symbol, m);
    return map;
  }, [onChain]);

  // Live Binance prices (display only) for the full catalog — gives the 30+
  // markets their live price/change/volume. On-chain settlement still uses the
  // protocol oracle (markPrice) for the 3 tradeable markets.
  const live = useBinancePrices();

  const markets: Market[] = useMemo(
    () =>
      CATALOG.map((c) => {
        const state = stateBySymbol.get(c.symbol);
        const onChainMark = markPriceToNumber(state?.markPrice);
        const onChainIndex = markPriceToNumber(state?.indexPrice);
        const oiLong = bnToNumber(state?.openInterestLong, SIZE_DECIMALS);
        const oiShort = bnToNumber(state?.openInterestShort, SIZE_DECIMALS);
        const lt = live[c.symbol];
        // Display price: live Binance preferred; fall back to on-chain mark.
        const displayPrice = lt?.price ?? onChainMark;
        // Execution mark: on-chain oracle for tradeable markets; live elsewhere.
        const execMark = c.onChain ? onChainMark || displayPrice : displayPrice;
        return {
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          price: displayPrice,
          change24h: lt?.change24h ?? 0,
          high24h: lt?.high24h ?? 0,
          low24h: lt?.low24h ?? 0,
          volume24h: lt?.volume24h ?? 0,
          openInterest: c.onChain ? (oiLong + oiShort) * (onChainMark || 0) : 0,
          // Solana Market has NO funding field — never surface a fake rate.
          fundingRate: 0,
          nextFunding: "--:--:--",
          markPrice: execMark,
          indexPrice: c.onChain ? onChainIndex || execMark : displayPrice,
        } satisfies Market;
      }),
    [stateBySymbol, live],
  );

  const selectedMeta = useMemo(
    () => MARKETS.find((m) => m.symbol === symbol),
    [symbol],
  );

  const selectedState = stateBySymbol.get(symbol);

  const selectedMarket = useMemo(
    () => markets.find((m) => m.symbol === symbol) ?? markets[0],
    [markets, symbol],
  );

  return { markets, selectedMarket, selectedMeta, selectedState, loading };
}

// ------------------------------------------------------------
// Positions bridge — on-chain Position PDAs → trading-v2 Position[]
// ------------------------------------------------------------

export interface PositionsBridge {
  positions: Position[];
  /** PDA (base58) keyed by the trading-v2 position id, for close + explorer. */
  pdaById: Map<string, PublicKey>;
  /** marketId bytes keyed by the trading-v2 position id, for close ix. */
  marketIdById: Map<string, Uint8Array>;
  loading: boolean;
  refetch: () => void;
}

function computePnl(
  isLong: boolean,
  size: number,
  entry: number,
  mark: number,
): { pnl: number; pnlPct: number } {
  if (mark <= 0 || entry <= 0 || size <= 0) return { pnl: 0, pnlPct: 0 };
  const pnl = isLong ? (mark - entry) * size : (entry - mark) * size;
  const notional = entry * size;
  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;
  return { pnl, pnlPct };
}

/**
 * Maps the trader's open positions into trading-v2 `Position` shapes, with PnL
 * recomputed against the current per-market mark price (positions span markets,
 * so we look the mark up by marketId via `marksBySymbol`).
 *
 * `leverage` is derived (notional / margin) since the on-chain Position stores
 * margin, not leverage. `liquidationPrice` is a display estimate using a flat
 * maintenance-margin assumption — it is NOT the chain's exact liq price.
 */
export function usePositionsBridge(
  trader: PublicKey | undefined,
  markets: Market[],
): PositionsBridge {
  const { positions: onChain, loading, refetch } = useOpenPositions(trader);

  const markBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of markets) map.set(m.symbol, m.markPrice);
    return map;
  }, [markets]);

  const bridged = useMemo(() => {
    const pdaById = new Map<string, PublicKey>();
    const marketIdById = new Map<string, Uint8Array>();

    const positions: Position[] = onChain.map((p: OpenPosition) => {
      const symbol = symbolFromBytes(p.marketId);
      const id = p.pda.toBase58();
      pdaById.set(id, p.pda);
      marketIdById.set(id, p.marketId);

      // size is a signed BN (negative = short); magnitude in SIZE_DECIMALS.
      const sizeAbs = bnToNumber(p.size.abs(), SIZE_DECIMALS);
      const entry = bnToNumber(p.entryPrice, PRICE_DECIMALS);
      const margin = bnToNumber(p.margin, PRICE_DECIMALS); // margin stored in quote units
      const mark = markBySymbol.get(symbol) ?? entry;
      const { pnl, pnlPct } = computePnl(p.isLong, sizeAbs, entry, mark);

      const notional = entry * sizeAbs;
      const leverage = margin > 0 ? Math.max(1, Math.round(notional / margin)) : 1;

      // Display-only liq estimate (flat 2.5% maintenance margin). Not exact.
      const mmRatio = 0.975;
      const liquidationPrice =
        sizeAbs > 0
          ? p.isLong
            ? entry - (margin * mmRatio) / sizeAbs
            : entry + (margin * mmRatio) / sizeAbs
          : 0;

      return {
        id,
        symbol,
        side: p.isLong ? "long" : "short",
        size: sizeAbs,
        entryPrice: entry,
        markPrice: mark,
        liquidationPrice: Math.max(0, liquidationPrice),
        margin,
        leverage,
        unrealizedPnl: pnl,
        unrealizedPnlPercentage: pnlPct,
        realizedPnl: 0,
      } satisfies Position;
    });

    return { positions, pdaById, marketIdById };
  }, [onChain, markBySymbol]);

  return { ...bridged, loading, refetch };
}

/** Decode the trailing zero-padded ASCII symbol from a 32-byte market id. */
function symbolFromBytes(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

// ------------------------------------------------------------
// Simulated order book — SIMULATED / OFF-CHAIN (no on-chain CLOB)
// ------------------------------------------------------------

export interface SimOrderBookResult {
  orderBook: OrderBook;
  recentTrades: Trade[];
}

const EMPTY_BOOK: OrderBook = {
  bids: [],
  asks: [],
  spread: 0,
  spreadPercentage: 0,
};

/**
 * SIMULATED off-chain order book + trade tape. SUR's order_settlement is a
 * commit/settle flow — there is no live CLOB to read. This generator seeds a
 * plausible book around the live on-chain mark price purely so the panel has
 * motion in the demo. Every surface that renders it is labeled "simulated".
 *
 * When the market has no on-chain price yet (mark <= 0) it returns an EMPTY
 * book so the panel shows its built-in loading/empty affordance rather than
 * inventing numbers around a zero price.
 */
export function useSimOrderBook(
  markPrice: number,
  symbol: string,
): SimOrderBookResult {
  const bookRef = useRef(createDemoOrderbook());
  const [tick, setTick] = useState<{
    bids: OrderBook["bids"];
    asks: OrderBook["asks"];
    spread: number;
    markPrice: number;
  } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Reset the generated tape when switching markets.
  useEffect(() => {
    bookRef.current = createDemoOrderbook();
    setTick(null);
    setTrades([]);
  }, [symbol]);

  useEffect(() => {
    if (markPrice <= 0) return;
    const id = window.setInterval(() => {
      const out = bookRef.current.tick(markPrice);
      const bestBid = out.bids[0]?.price ?? 0;
      const bestAsk = out.asks[0]?.price ?? 0;
      const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
      setTick({
        bids: out.bids.map((b) => ({
          price: b.price,
          size: b.size,
          total: b.total,
          percentage: b.percentage,
        })),
        asks: out.asks.map((a) => ({
          price: a.price,
          size: a.size,
          total: a.total,
          percentage: a.percentage,
        })),
        spread,
        markPrice: out.markPrice,
      });
      if (out.trade) {
        const t: Trade = {
          id: out.trade.id,
          price: out.trade.price,
          size: out.trade.size,
          side: out.trade.side,
          timestamp: out.trade.timestamp,
        };
        setTrades((prev) => [t, ...prev].slice(0, 50));
      }
    }, 900);
    return () => window.clearInterval(id);
  }, [markPrice, symbol]);

  const orderBook: OrderBook = useMemo(() => {
    if (!tick) return EMPTY_BOOK;
    return {
      bids: tick.bids,
      asks: tick.asks,
      spread: tick.spread,
      spreadPercentage:
        markPrice > 0 ? (tick.spread / markPrice) * 100 : 0,
    };
  }, [tick, markPrice]);

  return { orderBook, recentTrades: trades };
}
