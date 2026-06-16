"use client";

/**
 * Order book — ported from the original SUR trading UI (kept the flash
 * mechanism, bid/ask green/red, precision + view modes). Chrome restyled to
 * the dossier theme. Data comes from useBinanceOrderbook (real live feed).
 */

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import type { OB, OBTrade } from "@/hooks/data/use-binance-orderbook";

interface Props {
  orderBook: OB;
  recentTrades: OBTrade[];
  currentPrice: number;
  priceChange24h?: number;
}

type ViewMode = "book" | "trades" | "both";
type BookMode = "both" | "bids" | "asks";

interface FlashState {
  [key: string]: { type: "new" | "increase" | "decrease"; timestamp: number };
}

export function OrderBook({ orderBook, recentTrades, currentPrice, priceChange24h = 0 }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [bookMode, setBookMode] = useState<BookMode>("both");
  const [precision, setPrecision] = useState(2);
  const [flashStates, setFlashStates] = useState<FlashState>({});
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());

  const isLoading = orderBook.bids.length === 0 && orderBook.asks.length === 0;

  const prevBidsRef = useRef<Map<number, number>>(new Map());
  const prevAsksRef = useRef<Map<number, number>>(new Map());
  const prevTradeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newFlashStates: FlashState = {};
    const now = Date.now();

    orderBook.bids.forEach((bid) => {
      const prevSize = prevBidsRef.current.get(bid.price);
      const key = `bid-${bid.price}`;
      if (prevSize === undefined) newFlashStates[key] = { type: "new", timestamp: now };
      else if (bid.size > prevSize) newFlashStates[key] = { type: "increase", timestamp: now };
      else if (bid.size < prevSize) newFlashStates[key] = { type: "decrease", timestamp: now };
    });

    orderBook.asks.forEach((ask) => {
      const prevSize = prevAsksRef.current.get(ask.price);
      const key = `ask-${ask.price}`;
      if (prevSize === undefined) newFlashStates[key] = { type: "new", timestamp: now };
      else if (ask.size > prevSize) newFlashStates[key] = { type: "increase", timestamp: now };
      else if (ask.size < prevSize) newFlashStates[key] = { type: "decrease", timestamp: now };
    });

    if (Object.keys(newFlashStates).length > 0) {
      setFlashStates((prev) => ({ ...prev, ...newFlashStates }));
      setTimeout(() => {
        setFlashStates((prev) => {
          const updated = { ...prev };
          Object.keys(newFlashStates).forEach((key) => {
            if (updated[key]?.timestamp === now) delete updated[key];
          });
          return updated;
        });
      }, 600);
    }

    prevBidsRef.current = new Map(orderBook.bids.map((b) => [b.price, b.size]));
    prevAsksRef.current = new Map(orderBook.asks.map((a) => [a.price, a.size]));
  }, [orderBook.bids, orderBook.asks]);

  useEffect(() => {
    const currentTradeIds = new Set(recentTrades.map((t) => t.id));
    const newTrades = recentTrades.filter((t) => !prevTradeIdsRef.current.has(t.id));
    if (newTrades.length > 0) {
      setNewTradeIds(new Set(newTrades.map((t) => t.id)));
      setTimeout(() => setNewTradeIds(new Set()), 500);
    }
    prevTradeIdsRef.current = currentTradeIds;
  }, [recentTrades]);

  const formattedPrice = useMemo(
    () => currentPrice.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision }),
    [currentPrice, precision],
  );

  const isPositive = priceChange24h >= 0;
  const maxAskTotal = useMemo(() => Math.max(1, ...orderBook.asks.map((a) => a.total)), [orderBook.asks]);
  const maxBidTotal = useMemo(() => Math.max(1, ...orderBook.bids.map((b) => b.total)), [orderBook.bids]);
  const visibleRows = bookMode === "both" ? 12 : 24;

  const getFlashClass = useCallback(
    (side: "bid" | "ask", price: number) => {
      const flash = flashStates[`${side}-${price}`];
      if (!flash) return "";
      if (side === "bid") return flash.type === "increase" ? "animate-flash-bid-increase" : "animate-flash-bid";
      return flash.type === "increase" ? "animate-flash-ask-increase" : "animate-flash-ask";
    },
    [flashStates],
  );

  const tabBtn = (on: boolean) =>
    cn(
      "px-2 py-1 text-[10px] uppercase tracking-[0.14em] rounded-none transition-colors",
      on ? "bg-gold/15 text-gold" : "text-sur-muted hover:text-bone",
    );

  return (
    <div className="flex h-full flex-col bg-ink font-mono">
      <div className="flex items-center justify-between border-b border-dashed border-ash px-3 py-1.5">
        <div className="flex items-center gap-1">
          {(["book", "trades", "both"] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={tabBtn(viewMode === mode)}>
              {mode === "book" ? "Book" : mode === "trades" ? "Trades" : "Both"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {viewMode !== "trades" && (
            <div className="mr-1 flex items-center gap-0.5 border-r border-dashed border-ash pr-1.5">
              {(["both", "bids", "asks"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setBookMode(m)}
                  aria-label={`Show ${m}`}
                  className={tabBtn(bookMode === m)}
                >
                  {m === "both" ? "⇅" : m === "bids" ? "Bids" : "Asks"}
                </button>
              ))}
            </div>
          )}
          {[0, 1, 2].map((p) => (
            <button
              key={p}
              onClick={() => setPrecision(p)}
              className={cn(
                "h-5 w-6 rounded-none text-[10px] transition-colors",
                precision === p ? "bg-smoke text-bone" : "text-sur-muted hover:text-bone",
              )}
            >
              .{p === 0 ? "0" : p === 1 ? "1" : "01"}
            </button>
          ))}
        </div>
      </div>

      {viewMode !== "trades" && (
        <div className="grid grid-cols-3 gap-1 border-b border-dashed border-ash px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-sur-muted">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>
      )}

      {isLoading && viewMode !== "trades" && (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-[11px] text-sur-muted">
          connecting to live feed…
        </div>
      )}

      {!isLoading && viewMode !== "trades" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {bookMode !== "bids" && (
            <div className="flex flex-1 flex-col-reverse overflow-hidden">
              {orderBook.asks.slice(0, visibleRows).map((ask, i) => (
                <OrderRow key={`ask-${ask.price}-${i}`} price={ask.price} size={ask.size} total={ask.total} maxTotal={maxAskTotal} side="ask" precision={precision} flashClass={getFlashClass("ask", ask.price)} />
              ))}
            </div>
          )}

          {bookMode === "both" && (
            <div className="flex items-center justify-between border-y border-dashed border-ash bg-smoke/50 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className={cn("font-mono text-sm font-semibold tabular-nums", isPositive ? "text-sur-green" : "text-sur-red")}>
                  {formattedPrice}
                </span>
                <span className={cn("text-[10px] tabular-nums", isPositive ? "text-sur-green" : "text-sur-red")}>
                  {isPositive ? "+" : ""}{priceChange24h.toFixed(2)}%
                </span>
              </div>
              <span className="text-[10px] text-sur-muted tabular-nums">
                spread {orderBook.spread.toFixed(precision)} ({orderBook.spreadPercentage.toFixed(3)}%)
              </span>
            </div>
          )}

          {bookMode !== "asks" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {orderBook.bids.slice(0, visibleRows).map((bid, i) => (
                <OrderRow key={`bid-${bid.price}-${i}`} price={bid.price} size={bid.size} total={bid.total} maxTotal={maxBidTotal} side="bid" precision={precision} flashClass={getFlashClass("bid", bid.price)} />
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode !== "book" && (
        <div className={cn("flex flex-col border-t border-dashed border-ash", viewMode === "trades" ? "flex-1" : "h-[180px]")}>
          <div className="grid grid-cols-3 gap-1 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-sur-muted">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Time</span>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {recentTrades.slice(0, viewMode === "trades" ? 50 : 15).map((trade) => (
              <div
                key={trade.id}
                className={cn(
                  "grid grid-cols-3 gap-1 px-3 py-0.5 text-[11px] transition-colors hover:bg-smoke/40",
                  newTradeIds.has(trade.id) && "animate-flash-new-trade",
                )}
              >
                <span className={cn("font-mono tabular-nums", trade.side === "buy" ? "text-sur-green" : "text-sur-red")}>
                  {trade.price.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}
                </span>
                <span className="text-right font-mono tabular-nums text-bone/90">{trade.size.toFixed(4)}</span>
                <span className="text-right font-mono tabular-nums text-sur-muted">
                  {new Date(trade.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
            {recentTrades.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-sur-muted">waiting for trades…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface OrderRowProps {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  side: "bid" | "ask";
  precision: number;
  flashClass?: string;
}

function OrderRow({ price, size, total, maxTotal, side, precision, flashClass }: OrderRowProps) {
  const percentage = (total / maxTotal) * 100;
  const isBid = side === "bid";

  return (
    <div className={cn("group relative grid cursor-default grid-cols-3 gap-1 px-3 py-[3px] text-[11px] transition-colors hover:bg-smoke/40", flashClass)}>
      <div
        className={cn(
          "absolute top-0 h-full transition-all duration-150",
          isBid
            ? "left-0 bg-[rgba(14,203,129,0.08)] group-hover:bg-[rgba(14,203,129,0.16)]"
            : "right-0 bg-[rgba(246,70,93,0.08)] group-hover:bg-[rgba(246,70,93,0.16)]",
        )}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
      <span className={cn("relative z-10 font-mono font-medium tabular-nums", isBid ? "text-sur-green" : "text-sur-red")}>
        {price.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}
      </span>
      <span className={cn("relative z-10 text-right font-mono tabular-nums text-bone/90", flashClass && "animate-pulse-size")}>
        {size.toFixed(4)}
      </span>
      <span className="relative z-10 text-right font-mono tabular-nums text-sur-muted">{total.toFixed(4)}</span>
    </div>
  );
}
