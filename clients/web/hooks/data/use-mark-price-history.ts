"use client";

import { useEffect, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";

import { bnToNumber, PRICE_DECIMALS } from "@/lib/formatters";

/** One mark-price observation. `t` is UNIX milliseconds. */
export interface PriceSample {
  t: number;
  price: number;
}

/** Max samples retained in the ring buffer (~5 min at 2.5s sampling). */
export const MARK_PRICE_HISTORY_CAP = 120;

interface UseMarkPriceHistoryOptions {
  /** Override the ring-buffer cap. */
  cap?: number;
}

/**
 * Client-side ring-buffer sampler for a single market's mark price.
 *
 * The chain exposes only the *current* mark price (a BN with
 * PRICE_DECIMALS), not a series — so we accumulate samples in the browser
 * as the live price updates. Each distinct `(price, lastUpdate)` pair the
 * caller feeds in is appended as a `{ t, price }` sample, oldest dropped
 * past `cap`.
 *
 * Graceful by design: while no price has arrived the returned array is
 * empty, so consumers (e.g. MarketCard sparkline) can render an
 * "awaiting on-chain data" flatline.
 *
 * @param symbol      market symbol — resetting it clears the buffer
 * @param markPrice   live mark price as a BN (PRICE_DECIMALS), or undefined
 * @param lastUpdate  on-chain last-update slot/timestamp; dedups samples
 */
export function useMarkPriceHistory(
  symbol: string,
  markPrice: BN | undefined | null,
  lastUpdate?: BN | undefined | null,
  options: UseMarkPriceHistoryOptions = {},
): PriceSample[] {
  const cap = options.cap ?? MARK_PRICE_HISTORY_CAP;
  const [samples, setSamples] = useState<PriceSample[]>([]);

  // Track the last value we committed so we only append on real changes.
  const lastKeyRef = useRef<string | null>(null);

  // Reset the buffer whenever the market changes.
  useEffect(() => {
    setSamples([]);
    lastKeyRef.current = null;
  }, [symbol]);

  useEffect(() => {
    if (!markPrice) return;

    const price = bnToNumber(markPrice, PRICE_DECIMALS);
    if (!Number.isFinite(price) || price <= 0) return;

    // Dedup on (price, lastUpdate) so polling the same value is a no-op.
    const key = `${markPrice.toString()}:${lastUpdate?.toString() ?? ""}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setSamples((prev) => {
      const next = [...prev, { t: Date.now(), price }];
      return next.length > cap ? next.slice(next.length - cap) : next;
    });
  }, [markPrice, lastUpdate, cap]);

  return samples;
}
