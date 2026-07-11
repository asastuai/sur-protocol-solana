// ============================================================
//              INDICATORS — pure client-side math
// ============================================================
// Small, dependency-free technical-indicator helpers used by the live chart.
// Everything here is a PURE function of the input values (no chart, no state),
// so it is trivially testable and reusable. Display only; on-chain settlement
// reads the oracle, never these.
//
// CONTRACT shared by every function below: the returned series is ALWAYS
// index-aligned with the input — same length, `undefined` during warm-up (not
// enough data yet to produce a value). Callers feeding a line/histogram series
// skip the `undefined` points. Indicators that emit several lines return an
// object whose every field obeys the same length/alignment contract.

/**
 * Exponential Moving Average.
 *
 * Standard EMA seeded with the SMA of the first `period` values, then rolled
 * forward with the usual smoothing factor k = 2 / (period + 1):
 *
 *   ema[i] = value[i] * k + ema[i - 1] * (1 - k)
 *
 * The returned array is index-aligned with `values`: the first `period - 1`
 * entries are `undefined` (warm-up — not enough data to seed the average) and
 * every entry from index `period - 1` onward is a finite number. Callers
 * should skip the `undefined` warm-up points when feeding a line series.
 *
 * @param values  Series of inputs (e.g. candle closes), oldest → newest.
 * @param period  EMA window (e.g. 9 / 21 / 50). Must be >= 1.
 * @returns       Array of the same length as `values`; `undefined` during warm-up.
 */
export function ema(values: number[], period: number): (number | undefined)[] {
  const n = values.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  if (period < 1 || n < period) return out;

  const k = 2 / (period + 1);

  // Seed with the simple moving average of the first `period` values.
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;

  // Roll forward.
  for (let i = period; i < n; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }

  return out;
}

/**
 * Simple Moving Average — unweighted mean of the trailing `period` values.
 *
 * Computed with a rolling window sum (O(n)). Index-aligned with `values`: the
 * first `period - 1` entries are `undefined` (warm-up) and every entry from
 * index `period - 1` onward is the mean of values[i - period + 1 .. i].
 *
 * @param values  Series of inputs, oldest → newest.
 * @param period  SMA window. Must be >= 1.
 * @returns       Array of the same length as `values`; `undefined` during warm-up.
 */
export function sma(values: number[], period: number): (number | undefined)[] {
  const n = values.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  if (period < 1 || n < period) return out;

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period]; // drop the value leaving the window
    if (i >= period - 1) out[i] = sum / period;
  }

  return out;
}

/**
 * Bollinger Bands — an SMA basis with a band at ±`mult` POPULATION standard
 * deviations of the trailing `period` closes.
 *
 *   basis = SMA(closes, period)
 *   dev   = population stddev of the last `period` closes
 *   upper = basis + mult * dev
 *   lower = basis - mult * dev
 *
 * All three returned series are index-aligned with `closes` and `undefined`
 * during the shared warm-up (the first `period - 1` bars).
 *
 * @param closes  Candle closes, oldest → newest.
 * @param period  Look-back window for the basis + deviation (default 20).
 * @param mult    Band width in standard deviations (default 2).
 */
export function bollingerBands(
  closes: number[],
  period = 20,
  mult = 2,
): {
  basis: (number | undefined)[];
  upper: (number | undefined)[];
  lower: (number | undefined)[];
} {
  const n = closes.length;
  const basis = sma(closes, period); // reuse the rolling-mean helper
  const upper: (number | undefined)[] = new Array(n).fill(undefined);
  const lower: (number | undefined)[] = new Array(n).fill(undefined);
  if (period < 1 || n < period) return { basis, upper, lower };

  for (let i = period - 1; i < n; i += 1) {
    const mean = basis[i];
    if (mean === undefined) continue;
    // Population variance over the same window the basis used.
    let acc = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = closes[j] - mean;
      acc += d * d;
    }
    const dev = Math.sqrt(acc / period);
    upper[i] = mean + mult * dev;
    lower[i] = mean - mult * dev;
  }

  return { basis, upper, lower };
}

/**
 * Relative Strength Index — Wilder's smoothing.
 *
 * delta[i] = close[i] - close[i - 1]; gain = max(delta, 0), loss = max(-delta, 0).
 * The first avgGain / avgLoss are the simple mean of the first `period` gains /
 * losses, so the FIRST RSI value lands at index `period`. Thereafter Wilder
 * smoothing rolls them forward:
 *
 *   avgGain = (avgGain * (period - 1) + gain) / period   (same for avgLoss)
 *   RS = avgGain / avgLoss;  RSI = 100 - 100 / (1 + RS)
 *
 * Degenerate cases: a flat market (no gains and no losses) → RSI 50 (neutral),
 * avgLoss === 0 → RSI 100 (only gains), avgGain === 0 → RSI 0 (only losses).
 *
 * @param closes  Candle closes, oldest → newest.
 * @param period  Look-back window (default 14).
 * @returns       Array of the same length as `closes`; `undefined` for the
 *                first `period` bars (warm-up).
 */
export function rsi(closes: number[], period = 14): (number | undefined)[] {
  const n = closes.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  if (period < 1 || n <= period) return out;

  // Seed: simple mean of the first `period` gains / losses (deltas 1..period).
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    avgGain += Math.max(delta, 0);
    avgLoss += Math.max(-delta, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  // Roll forward with Wilder smoothing.
  for (let i = period + 1; i < n; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }

  return out;
}

/** RSI value from smoothed averages, with the degenerate guards. */
function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) return 50; // flat market — no momentum
  if (avgLoss === 0) return 100; // only gains
  if (avgGain === 0) return 0; // only losses
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Stochastic oscillator (%K / %D).
 *
 * rawK[i] = 100 * (close - lowestLow) / (highestHigh - lowestLow) over the
 * trailing `kLength` window; a zero range (flat window) is guarded to 50.
 * %K is the `kSmooth`-SMA of rawK; %D is the `dSmooth`-SMA of %K. Both returned
 * series stay index-aligned with the inputs (warm-up stacks the three windows).
 *
 * @param high     Candle highs, oldest → newest.
 * @param low      Candle lows, oldest → newest.
 * @param close    Candle closes, oldest → newest.
 * @param kLength  Look-back for raw %K (default 14).
 * @param kSmooth  Smoothing applied to raw %K (default 3).
 * @param dSmooth  Smoothing applied to %K to get %D (default 3).
 */
export function stochastic(
  high: number[],
  low: number[],
  close: number[],
  kLength = 14,
  kSmooth = 3,
  dSmooth = 3,
): { k: (number | undefined)[]; d: (number | undefined)[] } {
  const n = close.length;
  const rawK: number[] = new Array(n).fill(NaN);
  // Raw %K needs a full kLength window of highs/lows.
  for (let i = kLength - 1; i < n; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kLength + 1; j <= i; j += 1) {
      if (high[j] > hh) hh = high[j];
      if (low[j] < ll) ll = low[j];
    }
    const range = hh - ll;
    rawK[i] = range === 0 ? 50 : (100 * (close[i] - ll)) / range; // guard flat window
  }

  // %K = SMA(rawK, kSmooth), but only over the bars where rawK is defined.
  // Run the SMA on the defined sub-series and realign so warm-up stays aligned.
  const start = kLength - 1;
  const defined = rawK.slice(start);
  const kSub = sma(defined, kSmooth);
  const k: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < kSub.length; i += 1) k[start + i] = kSub[i];

  // %D = SMA(%K, dSmooth) — only over the bars where %K is defined.
  const kStart = start + (kSmooth - 1);
  const d: (number | undefined)[] = new Array(n).fill(undefined);
  if (kStart < n) {
    const kDefined: number[] = [];
    for (let i = kStart; i < n; i += 1) kDefined.push(k[i] as number);
    const dSub = sma(kDefined, dSmooth);
    for (let i = 0; i < dSub.length; i += 1) d[kStart + i] = dSub[i];
  }

  return { k, d };
}

/**
 * MACD — Moving Average Convergence / Divergence.
 *
 *   macd   = EMA(closes, fast) - EMA(closes, slow), where both are defined
 *   signal = EMA(macd-defined-subseries, signal), realigned back to the index
 *   hist   = macd - signal
 *
 * The signal EMA is computed over only the bars where macd is defined (the
 * `slow` warm-up has elapsed) and then mapped back, so every returned series
 * stays index-aligned with `closes`.
 *
 * @param closes  Candle closes, oldest → newest.
 * @param fast    Fast EMA period (default 12).
 * @param slow    Slow EMA period (default 26).
 * @param signal  Signal EMA period (default 9).
 */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: (number | undefined)[];
  signal: (number | undefined)[];
  hist: (number | undefined)[];
} {
  const n = closes.length;
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdLine: (number | undefined)[] = new Array(n).fill(undefined);
  // Collect the defined macd values (and their indices) for the signal EMA.
  const defined: number[] = [];
  const definedIdx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f === undefined || s === undefined) continue;
    const m = f - s;
    macdLine[i] = m;
    defined.push(m);
    definedIdx.push(i);
  }

  // Signal = EMA of the macd sub-series, mapped back onto the original index.
  const signalSub = ema(defined, signal);
  const signalLine: (number | undefined)[] = new Array(n).fill(undefined);
  const hist: (number | undefined)[] = new Array(n).fill(undefined);
  for (let j = 0; j < signalSub.length; j += 1) {
    const v = signalSub[j];
    if (v === undefined) continue;
    const i = definedIdx[j];
    signalLine[i] = v;
    const m = macdLine[i];
    if (m !== undefined) hist[i] = m - v;
  }

  return { macd: macdLine, signal: signalLine, hist };
}

/**
 * Bull Market Support Band (BMSB) — the classic 20-week SMA + 21-week EMA pair,
 * expressed in candles of the current timeframe.
 *
 *   smaPeriod = round(smaWeeks * candlesPerWeek)
 *   emaPeriod = round(emaWeeks * candlesPerWeek)
 *   sma = SMA(closes, smaPeriod);  ema = EMA(closes, emaPeriod)
 *
 * Both series are index-aligned with `closes` (and `undefined` during their
 * respective — long — warm-ups; short history simply yields no points).
 *
 * @param closes          Candle closes, oldest → newest.
 * @param candlesPerWeek  How many candles of this timeframe make up one week.
 * @param smaWeeks        SMA span in weeks (default 20).
 * @param emaWeeks        EMA span in weeks (default 21).
 */
export function bullMarketSupportBand(
  closes: number[],
  candlesPerWeek: number,
  smaWeeks = 20,
  emaWeeks = 21,
): { sma: (number | undefined)[]; ema: (number | undefined)[] } {
  const smaPeriod = Math.max(1, Math.round(smaWeeks * candlesPerWeek));
  const emaPeriod = Math.max(1, Math.round(emaWeeks * candlesPerWeek));
  return { sma: sma(closes, smaPeriod), ema: ema(closes, emaPeriod) };
}

/**
 * Anchored VWAP — Volume Weighted Average Price, cumulative from index 0.
 *
 *   tp[i]    = (high + low + close) / 3          (typical price)
 *   cumPV   += tp[i] * volume[i]
 *   cumV    += volume[i]
 *   out[i]   = cumV > 0 ? cumPV / cumV : undefined
 *
 * Anchored at the first bar (no session resets here), so it is defined from the
 * first bar with non-zero cumulative volume onward and stays index-aligned.
 *
 * @param high    Candle highs, oldest → newest.
 * @param low     Candle lows, oldest → newest.
 * @param close   Candle closes, oldest → newest.
 * @param volume  Per-bar base-asset volume, oldest → newest.
 */
export function vwap(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
): (number | undefined)[] {
  const n = close.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i += 1) {
    const tp = (high[i] + low[i] + close[i]) / 3;
    cumPV += tp * volume[i];
    cumV += volume[i];
    out[i] = cumV > 0 ? cumPV / cumV : undefined;
  }
  return out;
}
