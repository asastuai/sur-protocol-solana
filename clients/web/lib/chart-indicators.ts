// ============================================================
//        CHART INDICATOR REGISTRY — UI ⇄ math decoupling
// ============================================================
// One declarative registry describing every indicator the live chart can draw.
// The UI (menu / settings / LiveChart) knows NOTHING about the underlying math:
// it reads `IndicatorDef` metadata (params, plots, guides, scale) and calls
// `compute()` to get index-aligned arrays back. The math itself lives in
// lib/indicators.ts; this file only adapts it to the chart's needs.
//
// Adding a new indicator is purely additive: write the math in lib/indicators.ts,
// add one `IndicatorDef` here, register it in INDICATORS. No LiveChart edits.

import {
  ema,
  sma,
  bollingerBands,
  rsi,
  stochastic,
  macd,
  bullMarketSupportBand,
  vwap,
} from "@/lib/indicators";

// A candle as the registry consumes it (closes/highs/lows + volume for VWAP).
export interface IndicatorCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Overlays live on the price pane; oscillators each get their own pane below.
export type IndicatorCategory = "overlay" | "oscillator";

// One tunable numeric parameter (rendered as a numeric input in settings).
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

// One drawn series produced by an indicator (a line or a histogram).
export interface PlotSpec {
  key: string;
  label: string;
  kind: "line" | "histogram";
  color: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed";
}

// Full declarative description of an indicator.
export interface IndicatorDef {
  type: string;
  label: string;
  category: IndicatorCategory;
  params: ParamSpec[];
  plots: PlotSpec[];
  /** Fixed guide lines, e.g. RSI 70/30 or Stoch 80/20. */
  guides?: number[];
  /** Fix the pane scale, e.g. RSI / Stoch 0..100. */
  scaleRange?: { min: number; max: number };
  /** Pure compute: registry candles + params → index-aligned plot arrays. */
  compute(
    candles: IndicatorCandle[],
    params: Record<string, number>,
    ctx: { candlesPerWeek: number },
  ): Record<string, (number | undefined)[]>;
}

// On-brand palette — deliberately AVOIDS pure blue (Solana rebrand).
const C_EMA = "#F0B90B";
const C_SMA = "#A78BFA";
const C_BB_BASIS = "#B7BDC6";
const C_BB_BAND = "#787B86";
const C_BMSB_SMA = "#14F195";
const C_BMSB_EMA = "#F6465D";
const C_VWAP = "#9945FF";
const C_RSI = "#9945FF";
const C_STOCH_K = "#14F195";
const C_STOCH_D = "#F0B90B";
const C_MACD = "#14F195";
const C_MACD_SIGNAL = "#F6465D";
// MACD histogram is colored per-bar (green/red) by LiveChart; this is a
// neutral fallback for the PlotSpec contract.
const C_MACD_HIST = "#787B86";

// --- column extractors (built once per compute call) ---------------------
const closesOf = (c: IndicatorCandle[]) => c.map((x) => x.close);
const highsOf = (c: IndicatorCandle[]) => c.map((x) => x.high);
const lowsOf = (c: IndicatorCandle[]) => c.map((x) => x.low);
const volsOf = (c: IndicatorCandle[]) => c.map((x) => x.volume);

// ---------------------------------------------------------------------------
//  Indicator definitions
// ---------------------------------------------------------------------------

const emaDef: IndicatorDef = {
  type: "ema",
  label: "EMA",
  category: "overlay",
  params: [{ key: "period", label: "Period", min: 1, max: 400, step: 1, default: 21 }],
  plots: [{ key: "line", label: "EMA", kind: "line", color: C_EMA, lineWidth: 2 }],
  compute(candles, params) {
    return { line: ema(closesOf(candles), params.period) };
  },
};

const smaDef: IndicatorDef = {
  type: "sma",
  label: "SMA",
  category: "overlay",
  params: [{ key: "period", label: "Period", min: 1, max: 400, step: 1, default: 50 }],
  plots: [{ key: "line", label: "SMA", kind: "line", color: C_SMA, lineWidth: 2 }],
  compute(candles, params) {
    return { line: sma(closesOf(candles), params.period) };
  },
};

const bbDef: IndicatorDef = {
  type: "bb",
  label: "Bollinger",
  category: "overlay",
  params: [
    { key: "period", label: "Period", min: 2, max: 200, step: 1, default: 20 },
    { key: "mult", label: "StdDev", min: 0.5, max: 5, step: 0.1, default: 2 },
  ],
  plots: [
    { key: "basis", label: "Basis", kind: "line", color: C_BB_BASIS, lineWidth: 1 },
    { key: "upper", label: "Upper", kind: "line", color: C_BB_BAND, lineWidth: 1, lineStyle: "dashed" },
    { key: "lower", label: "Lower", kind: "line", color: C_BB_BAND, lineWidth: 1, lineStyle: "dashed" },
  ],
  compute(candles, params) {
    const { basis, upper, lower } = bollingerBands(closesOf(candles), params.period, params.mult);
    return { basis, upper, lower };
  },
};

const bmsbDef: IndicatorDef = {
  type: "bmsb",
  label: "BMSB",
  category: "overlay",
  params: [
    { key: "smaWeeks", label: "SMA weeks", min: 1, max: 60, step: 1, default: 20 },
    { key: "emaWeeks", label: "EMA weeks", min: 1, max: 60, step: 1, default: 21 },
  ],
  plots: [
    { key: "sma", label: "20W SMA", kind: "line", color: C_BMSB_SMA, lineWidth: 2 },
    { key: "ema", label: "21W EMA", kind: "line", color: C_BMSB_EMA, lineWidth: 2 },
  ],
  compute(candles, params, ctx) {
    const band = bullMarketSupportBand(
      closesOf(candles),
      ctx.candlesPerWeek,
      params.smaWeeks,
      params.emaWeeks,
    );
    return { sma: band.sma, ema: band.ema };
  },
};

const vwapDef: IndicatorDef = {
  type: "vwap",
  label: "VWAP",
  category: "overlay",
  params: [],
  plots: [{ key: "line", label: "VWAP", kind: "line", color: C_VWAP, lineWidth: 2 }],
  compute(candles) {
    return {
      line: vwap(highsOf(candles), lowsOf(candles), closesOf(candles), volsOf(candles)),
    };
  },
};

const rsiDef: IndicatorDef = {
  type: "rsi",
  label: "RSI",
  category: "oscillator",
  params: [{ key: "period", label: "Period", min: 2, max: 100, step: 1, default: 14 }],
  plots: [{ key: "line", label: "RSI", kind: "line", color: C_RSI, lineWidth: 2 }],
  guides: [70, 30],
  scaleRange: { min: 0, max: 100 },
  compute(candles, params) {
    return { line: rsi(closesOf(candles), params.period) };
  },
};

const stochDef: IndicatorDef = {
  type: "stoch",
  label: "Stoch",
  category: "oscillator",
  params: [
    { key: "kLength", label: "K length", min: 1, max: 100, step: 1, default: 14 },
    { key: "kSmooth", label: "K smooth", min: 1, max: 20, step: 1, default: 3 },
    { key: "dSmooth", label: "D smooth", min: 1, max: 20, step: 1, default: 3 },
  ],
  plots: [
    { key: "k", label: "%K", kind: "line", color: C_STOCH_K, lineWidth: 2 },
    { key: "d", label: "%D", kind: "line", color: C_STOCH_D, lineWidth: 1 },
  ],
  guides: [80, 20],
  scaleRange: { min: 0, max: 100 },
  compute(candles, params) {
    const { k, d } = stochastic(
      highsOf(candles),
      lowsOf(candles),
      closesOf(candles),
      params.kLength,
      params.kSmooth,
      params.dSmooth,
    );
    return { k, d };
  },
};

const macdDef: IndicatorDef = {
  type: "macd",
  label: "MACD",
  category: "oscillator",
  params: [
    { key: "fast", label: "Fast", min: 1, max: 100, step: 1, default: 12 },
    { key: "slow", label: "Slow", min: 1, max: 200, step: 1, default: 26 },
    { key: "signal", label: "Signal", min: 1, max: 100, step: 1, default: 9 },
  ],
  // hist FIRST so it draws behind the two lines.
  plots: [
    { key: "hist", label: "Hist", kind: "histogram", color: C_MACD_HIST },
    { key: "macd", label: "MACD", kind: "line", color: C_MACD, lineWidth: 2 },
    { key: "signal", label: "Signal", kind: "line", color: C_MACD_SIGNAL, lineWidth: 1 },
  ],
  compute(candles, params) {
    const r = macd(closesOf(candles), params.fast, params.slow, params.signal);
    return { hist: r.hist, macd: r.macd, signal: r.signal };
  },
};

// Registry — keyed by type for O(1) lookup from a stored instance.
export const INDICATORS: Record<string, IndicatorDef> = {
  ema: emaDef,
  sma: smaDef,
  bb: bbDef,
  bmsb: bmsbDef,
  vwap: vwapDef,
  rsi: rsiDef,
  stoch: stochDef,
  macd: macdDef,
};

// Ordered for the menu: overlays first, then oscillators.
export const INDICATOR_LIST: IndicatorDef[] = [
  emaDef,
  smaDef,
  bbDef,
  bmsbDef,
  vwapDef,
  rsiDef,
  stochDef,
  macdDef,
];

/** Build the default param map for an indicator from its ParamSpec defaults. */
export function defaultParams(def: IndicatorDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}
