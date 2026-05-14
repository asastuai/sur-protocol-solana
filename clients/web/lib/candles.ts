import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

export interface PriceSample {
  /** UNIX seconds */
  ts: number;
  /** Price as a JS number (already divided by PRICE_PRECISION) */
  price: number;
}

/**
 * Aggregate raw price samples into fixed-width OHLC candles.
 *
 * Pure function — no React state, no side effects. Each candle covers a
 * `windowSec`-wide bucket aligned to the unix epoch:
 *   bucketStart = floor(sample.ts / windowSec) * windowSec
 *
 *   - open  = first sample in the bucket
 *   - high  = max sample in the bucket
 *   - low   = min sample in the bucket
 *   - close = last sample in the bucket
 *
 * Samples are assumed to be roughly time-ordered but the function tolerates
 * out-of-order input (it folds them into the matching bucket regardless).
 *
 * Returns candles sorted ascending by time, which is what lightweight-charts
 * requires when calling `series.setData(...)`.
 */
export function aggregateCandles(
  samples: ReadonlyArray<PriceSample>,
  windowSec: number,
): CandlestickData[] {
  if (!Number.isFinite(windowSec) || windowSec <= 0) return [];
  if (samples.length === 0) return [];

  // Bucket index -> partially-built OHLC.
  const buckets = new Map<
    number,
    { open: number; high: number; low: number; close: number; lastTs: number; firstTs: number }
  >();

  for (const s of samples) {
    if (!Number.isFinite(s.price) || !Number.isFinite(s.ts)) continue;
    const bucketStart = Math.floor(s.ts / windowSec) * windowSec;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        open: s.price,
        high: s.price,
        low: s.price,
        close: s.price,
        firstTs: s.ts,
        lastTs: s.ts,
      });
      continue;
    }
    if (s.price > existing.high) existing.high = s.price;
    if (s.price < existing.low) existing.low = s.price;
    if (s.ts < existing.firstTs) {
      existing.firstTs = s.ts;
      existing.open = s.price;
    }
    if (s.ts >= existing.lastTs) {
      existing.lastTs = s.ts;
      existing.close = s.price;
    }
  }

  const out: CandlestickData[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const k of sortedKeys) {
    const b = buckets.get(k)!;
    out.push({
      time: k as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    });
  }
  return out;
}

/** Default candle window for the trading chart (1-minute candles). */
export const DEFAULT_CANDLE_WINDOW_SEC = 60;

/** Default polling interval for mark price samples (2.5 seconds). */
export const DEFAULT_SAMPLE_INTERVAL_MS = 2500;
