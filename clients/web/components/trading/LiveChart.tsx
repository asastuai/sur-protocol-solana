"use client";

// ============================================================
//        LIVE CHART — lightweight-charts + Binance feed
// ============================================================
// Full programmatic control of styling (green dotted crosshair, #191919 bg,
// green dotted price line, SUR candle colors) with real-time Binance candles
// (REST history + WS live) and timeframe switching. Display only; on-chain
// settlement reads the oracle.
//
// On top of the candles this renders several overlays, all sharing the candle
// time grid so the crosshair stays aligned:
//   1. VOLUME histogram docked into the bottom ~20% (overlay price scale).
//   2. OHLC legend (hovered candle, or latest) + symbol / 24h change / last.
//   3. ON-CHAIN POSITION LINES (entry / estimated-liq) for the open position
//      on the selected market — only for the 3 real on-chain markets.
//   4. A generic, extensible INDICATOR ENGINE: pick any indicator from the
//      "Indicadores" menu; overlays (EMA/SMA/Bollinger/BMSB/VWAP) draw on the
//      price pane, oscillators (RSI/Stoch/MACD) each get their own pane below.
//      The math lives in lib/indicators.ts; the registry in lib/chart-indicators.ts
//      decouples this UI from it. Active indicators persist to localStorage.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type BarData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/cn";
import { Settings2, X } from "lucide-react";
import { findCatalogMarket } from "@/lib/market-catalog";
import {
  INDICATORS,
  defaultParams,
  type IndicatorCandle,
  type IndicatorDef,
} from "@/lib/chart-indicators";
import { IndicatorMenu } from "@/components/trading/IndicatorMenu";
import { IndicatorSettings } from "@/components/trading/IndicatorSettings";
import { useBinanceTicker } from "@/hooks/data/use-binance-prices";
import { useChartPosition } from "@/hooks/data/use-chart-position";

const GREEN = "#0ECB81";
const RED = "#F6465D";
const BG = "#191919";
// Position-line accent (entry).
const ENTRY_GRAY = "#B7BDC6";

// Per-bar volume fill (subordinate to the candles — low alpha).
const VOL_UP = "rgba(14,203,129,0.45)";
const VOL_DOWN = "rgba(246,69,93,0.45)";

// MACD histogram fill, colored per sign (translucent so the lines stay legible).
const MACD_HIST_UP = "rgba(14,241,149,0.5)";
const MACD_HIST_DOWN = "rgba(246,69,93,0.5)";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

// How many candles of each timeframe make up one calendar week (24/7 markets).
// Used as the BMSB context so the 20W/21W band scales to the active timeframe.
const CANDLES_PER_WEEK: Record<Timeframe, number> = {
  "1m": 10080,
  "5m": 2016,
  "15m": 672,
  "1h": 168,
  "4h": 42,
  "1d": 7,
};

// localStorage key for the persisted active-indicator list ([{ type, params }]).
const STORAGE_KEY = "sur.chart.indicators";

// A candle plus its base-asset volume (parallel to CandlestickData[]).
interface Candle extends CandlestickData {
  volume: number;
}

// One live indicator instance: a registry `type` + its current params, keyed by
// a stable monotonic id so its series survive param edits / re-renders.
interface ActiveIndicator {
  id: string;
  type: string;
  params: Record<string, number>;
}

// The chart-side handle for one drawn indicator: its plot series (by plot key),
// the pane it lives in, and any guide price lines we must remove on teardown.
interface IndicatorHandle {
  plots: Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>;
  guides: IPriceLine[];
  paneIndex: number;
  category: "overlay" | "oscillator";
}

interface HoverOhlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

function binanceSymbol(symbol: string): string {
  return findCatalogMarket(symbol)?.binanceSymbol.toUpperCase() ?? "BTCUSDT";
}

async function fetchKlines(
  sym: string,
  interval: string,
): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const arr = (await res.json()) as unknown[][];
  return arr.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000) as UTCTimestamp,
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]), // index 5 = base-asset volume
  }));
}

// The candle cache already carries close/high/low/volume in the exact shape the
// registry consumes, so this is a zero-copy reinterpret (Candle ⊇ IndicatorCandle).
function asIndicatorCandles(candles: Candle[]): IndicatorCandle[] {
  return candles as unknown as IndicatorCandle[];
}

/** Build line points from a computed array, skipping warm-up (undefined). */
function lineData(candles: Candle[], values: (number | undefined)[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const v = values[i];
    if (v === undefined) continue; // warm-up — no point yet
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

/** Build histogram points from a computed array; color MACD-style per sign. */
function histData(candles: Candle[], values: (number | undefined)[]): HistogramData[] {
  const out: HistogramData[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const v = values[i];
    if (v === undefined) continue;
    out.push({ time: candles[i].time, value: v, color: v >= 0 ? MACD_HIST_UP : MACD_HIST_DOWN });
  }
  return out;
}

/** Compact param summary for the active-indicator legend (e.g. "21", "20 / 2"). */
function paramSummary(def: IndicatorDef, params: Record<string, number>): string {
  return def.params.map((p) => params[p.key]).join(" / ");
}

/** Load persisted indicators from localStorage (guarded, drops unknown types). */
function loadIndicators(nextId: () => string): ActiveIndicator[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { type: string; params: Record<string, number> }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.type === "string" && INDICATORS[p.type])
      .map((p) => ({
        id: nextId(),
        type: p.type,
        // Merge over defaults so a saved partial / extended param set stays valid.
        params: { ...defaultParams(INDICATORS[p.type]), ...(p.params ?? {}) },
      }));
  } catch {
    return []; // corrupt storage — start clean
  }
}

/** Persist the active indicators (only type + params; ids are runtime-only). */
function saveIndicators(list: ActiveIndicator[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.map(({ type, params }) => ({ type, params }))),
    );
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

function fmtPx(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LiveChart({ symbol }: { symbol: string }) {
  const [tf, setTf] = useState<Timeframe>("15m");
  // Hovered candle for the legend; null => fall back to the latest candle.
  const [hover, setHover] = useState<HoverOhlc | null>(null);

  // Monotonic counter for indicator instance ids (NOT time/random based) — a
  // ref so it survives re-renders without re-seeding from a clock.
  const idCounter = useRef(0);
  const nextId = () => {
    idCounter.current += 1;
    return `ind-${idCounter.current}`;
  };

  // Active indicator instances. Restored from localStorage on first mount.
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>(() =>
    loadIndicators(nextId),
  );
  // Which active indicator's settings popover is open (instance id, or null).
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // Drawn indicator series + guides + pane, keyed by instance id. The single
  // source of truth for what is currently on the chart (add/remove/recompute).
  const indicatorsRef = useRef<Map<string, IndicatorHandle>>(new Map());
  // Mirror of activeIndicators for use inside the WS/seed closures (which only
  // re-bind on sym/tf change) so per-tick updates see the live set.
  const activeRef = useRef<ActiveIndicator[]>(activeIndicators);
  // On-chain position price lines (entry / liq), torn down on every change.
  const posLinesRef = useRef<IPriceLine[]>([]);
  // Latest loaded candles — for legend fallback + indicator (re)compute.
  const candlesRef = useRef<Candle[]>([]);
  const [latest, setLatest] = useState<HoverOhlc | null>(null);

  const sym = useMemo(() => binanceSymbol(symbol), [symbol]);

  // Reuse the shared ticker WS for the legend's 24h change / last price.
  const ticker = useBinanceTicker(symbol);
  // The connected wallet's open position for THIS market (null when none /
  // display-only symbol). liquidationPrice is a client estimate — see hook.
  const { position, isTradeable } = useChartPosition(symbol);

  // Persist + mirror the active set on every change. activeRef lets the
  // WS/seed closures (bound only on sym/tf) read the current list per tick.
  useEffect(() => {
    activeRef.current = activeIndicators;
    saveIndicators(activeIndicators);
  }, [activeIndicators]);

  // ----- indicator engine (imperative; closes over refs, never stale) -----

  // Compute one indicator's plot arrays from the candle cache (+ BMSB ctx).
  const computeIndicator = (
    inst: ActiveIndicator,
    candles: Candle[],
  ): Record<string, (number | undefined)[]> | null => {
    const def = INDICATORS[inst.type];
    if (!def) return null;
    try {
      return def.compute(asIndicatorCandles(candles), inst.params, {
        candlesPerWeek: CANDLES_PER_WEEK[tf],
      });
    } catch {
      return null; // never let a bad recompute break the tick / seed
    }
  };

  // (Re)seed every plot of one indicator with a full setData from `candles`.
  const seedIndicator = (inst: ActiveIndicator, candles: Candle[]) => {
    const def = INDICATORS[inst.type];
    const handle = indicatorsRef.current.get(inst.id);
    if (!def || !handle) return;
    const result = computeIndicator(inst, candles);
    if (!result) return;
    for (const plot of def.plots) {
      const series = handle.plots.get(plot.key);
      const values = result[plot.key];
      if (!series || !values) continue;
      if (plot.kind === "histogram") {
        (series as ISeriesApi<"Histogram">).setData(histData(candles, values));
      } else {
        (series as ISeriesApi<"Line">).setData(lineData(candles, values));
      }
    }
  };

  // Reseed ALL active indicators (history (re)seed on sym/tf change).
  const reseedAll = (candles: Candle[]) => {
    for (const inst of activeRef.current) seedIndicator(inst, candles);
  };

  // Per-tick: recompute each indicator and update() only the LAST point. The
  // close/typical columns are derived once per tick inside computeIndicator.
  const tickIndicators = (candles: Candle[], time: UTCTimestamp) => {
    for (const inst of activeRef.current) {
      const def = INDICATORS[inst.type];
      const handle = indicatorsRef.current.get(inst.id);
      if (!def || !handle) continue;
      const result = computeIndicator(inst, candles);
      if (!result) continue;
      for (const plot of def.plots) {
        const series = handle.plots.get(plot.key);
        const values = result[plot.key];
        if (!series || !values) continue;
        const v = values[values.length - 1];
        if (v === undefined) continue; // still warming up — no point yet
        if (plot.kind === "histogram") {
          (series as ISeriesApi<"Histogram">).update({
            time,
            value: v,
            color: v >= 0 ? MACD_HIST_UP : MACD_HIST_DOWN,
          });
        } else {
          (series as ISeriesApi<"Line">).update({ time, value: v });
        }
      }
    }
  };

  // Create every plot series (+ guides) for one indicator and register its
  // handle. Overlays go on pane 0; each oscillator gets its OWN new pane below
  // (auto-created by passing a fresh paneIndex). Seeds from the current cache.
  const addDrawnIndicator = (chart: IChartApi, inst: ActiveIndicator) => {
    const def = INDICATORS[inst.type];
    if (!def) return;

    // Overlays live on the price pane. Each oscillator gets a brand-new pane:
    // index = current pane count (panes() length) so it never collides.
    const paneIndex = def.category === "overlay" ? 0 : chart.panes().length;

    const plots = new Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>();
    for (const plot of def.plots) {
      if (plot.kind === "histogram") {
        const s = chart.addSeries(
          HistogramSeries,
          { base: 0, priceLineVisible: false, lastValueVisible: false },
          paneIndex,
        );
        plots.set(plot.key, s);
      } else {
        const s = chart.addSeries(
          LineSeries,
          {
            color: plot.color,
            lineWidth: (plot.lineWidth ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: plot.lineStyle === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          paneIndex,
        );
        plots.set(plot.key, s);
      }
    }

    // Guide lines + fixed scale for oscillators (drawn on the primary series).
    const guides: IPriceLine[] = [];
    const primary = plots.get(def.plots[0].key);
    if (primary && def.category === "oscillator") {
      primary.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } });
      if (def.scaleRange) {
        primary.priceScale().setAutoScale(false);
        primary.priceScale().setVisibleRange({ from: def.scaleRange.min, to: def.scaleRange.max });
      }
      for (const level of def.guides ?? []) {
        guides.push(
          primary.createPriceLine({
            price: level,
            color: "rgba(255,255,255,0.18)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: String(level),
          }),
        );
      }
    }

    indicatorsRef.current.set(inst.id, {
      plots,
      guides,
      paneIndex,
      category: def.category,
    });
    seedIndicator(inst, candlesRef.current);
  };

  // Tear down one drawn indicator: remove guide lines, remove every plot series,
  // then collapse the oscillator's now-empty pane if it survived auto-collapse.
  const removeDrawnIndicator = (
    chart: IChartApi,
    id: string,
    handle: IndicatorHandle,
  ) => {
    const primary = handle.plots.values().next().value as
      | ISeriesApi<"Line">
      | ISeriesApi<"Histogram">
      | undefined;
    // Read the live pane index BEFORE removing series (cached index can be stale
    // after earlier removals reindexed the panes below it).
    let pane = primary ? primary.getPane() : null;
    const paneIdx = pane ? pane.paneIndex() : handle.paneIndex;

    for (const line of handle.guides) {
      try {
        primary?.removePriceLine(line);
      } catch {
        /* series may be mid-teardown */
      }
    }
    for (const series of handle.plots.values()) {
      try {
        chart.removeSeries(series);
      } catch {
        /* already gone */
      }
    }
    indicatorsRef.current.delete(id);

    // Oscillator panes auto-collapse when emptied; only call removePane if the
    // pane somehow survived (e.g. preserveEmptyPane) and is now empty. Never
    // remove the price pane (index 0).
    if (handle.category === "oscillator" && paneIdx > 0) {
      pane = chart.panes().find((p) => p.paneIndex() === paneIdx) ?? null;
      if (pane && pane.getSeries().length === 0) {
        try {
          chart.removePane(paneIdx);
        } catch {
          /* already collapsed */
        }
      }
    }
  };

  // Keep the price pane ~3x each oscillator pane via RELATIVE stretch factors.
  // Re-read indices live (panes reindex on add/remove). Pane 0 is always price.
  const rebalancePanes = (chart: IChartApi) => {
    const panes = chart.panes();
    for (const pane of panes) {
      pane.setStretchFactor(pane.paneIndex() === 0 ? 3 : 1);
    }
  };

  // Create the chart once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: "#848E9C",
        fontFamily:
          "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace",
        // Fixed price/oscillator proportions — disable the user pane-drag handle.
        panes: { enableResize: false },
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: GREEN,
          style: LineStyle.Dotted,
          width: 1,
          labelBackgroundColor: GREEN,
        },
        horzLine: {
          color: GREEN,
          style: LineStyle.Dotted,
          width: 1,
          labelBackgroundColor: GREEN,
        },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceLineVisible: true,
      priceLineColor: GREEN,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
    });

    // Volume histogram → its own overlay scale docked to the bottom 20%.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume", // any non left/right id => overlay scale
      color: VOL_UP,
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    // Keep the candles off the very bottom so they don't sit on the volume band.
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.2 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    // Crosshair → legend. Guard the mouse-leave case (time/point undefined).
    const handler = (param: MouseEventParams<Time>) => {
      if (param.time === undefined || !param.point || param.seriesData.size === 0) {
        setHover(null);
        return;
      }
      const s = seriesRef.current;
      const bar = s ? (param.seriesData.get(s) as BarData | undefined) : undefined;
      if (bar) {
        setHover({
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        });
      }
    };
    chart.subscribeCrosshairMove(handler);

    return () => {
      // Detach listeners first, then dispose the chart (which frees every
      // series, scale and price line it owns). Null all refs so nothing can
      // touch a disposed chart afterward.
      chart.unsubscribeCrosshairMove(handler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      indicatorsRef.current.clear();
      posLinesRef.current = [];
      candlesRef.current = [];
    };
  }, []);

  // Load history + live WS on symbol / timeframe change.
  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series || !volume) return;
    let cancelled = false;
    // Gate live WS updates until REST history is in place. Frames that arrive
    // before the first setData would otherwise feed the series out of order
    // (older time than the seeded tail) and trip "Cannot update oldest data",
    // silently freezing the live candle.
    let seeded = false;

    series.setData([]);
    volume.setData([]);
    candlesRef.current = [];
    setLatest(null);

    void fetchKlines(sym, tf).then((data) => {
      if (cancelled || !seriesRef.current || !volumeRef.current) return;
      candlesRef.current = data;
      seriesRef.current.setData(data);
      volumeRef.current.setData(
        data.map<HistogramData>((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? VOL_UP : VOL_DOWN,
        })),
      );
      seeded = true; // history is in place — live frames may now apply
      // (Re)seed every active indicator from the freshly fetched history, then
      // re-assert pane proportions so the price pane stays ~3x regardless of how
      // the oscillator panes came to exist (idempotent).
      reseedAll(data);
      if (chartRef.current) rebalancePanes(chartRef.current);
      const last = data[data.length - 1];
      if (last) {
        setLatest({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        });
      }
      chartRef.current?.timeScale().fitContent();
    });

    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`,
    );
    ws.onmessage = (ev) => {
      try {
        const k = JSON.parse(ev.data as string).k;
        const time = Math.floor(Number(k.t) / 1000) as UTCTimestamp;
        const open = Number(k.o);
        const high = Number(k.h);
        const low = Number(k.l);
        const close = Number(k.c);
        const vol = Number(k.v); // base-asset volume
        if (cancelled || !seeded || !seriesRef.current || !volumeRef.current)
          return;

        seriesRef.current.update({ time, open, high, low, close });
        volumeRef.current.update({
          time,
          value: vol,
          color: close >= open ? VOL_UP : VOL_DOWN,
        });

        // Keep the candle cache in sync (upsert by time) for indicators + legend.
        const cache = candlesRef.current;
        const next: Candle = { time, open, high, low, close, volume: vol };
        if (cache.length && cache[cache.length - 1].time === time) {
          cache[cache.length - 1] = next;
        } else {
          cache.push(next);
        }
        setLatest({ open, high, low, close });

        // Recompute every active indicator from the fresh cache and upsert the
        // last point of each plot (close/typical columns built once per tick).
        tickIndicators(cache, time);
      } catch {
        /* ignore malformed frame */
      }
    };

    return () => {
      cancelled = true;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, [sym, tf]);

  // Indicator engine — reconcile drawn series (indicatorsRef) against the
  // desired active set. Adds create series (+ guides), removes tear them down
  // and collapse empty oscillator panes; param edits are handled below (no
  // recreate). Rebalances pane stretch so the price pane stays ~3x. Never
  // touches a disposed chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const drawn = indicatorsRef.current;
    const desired = new Map(activeIndicators.map((i) => [i.id, i]));

    // 1) Remove indicators no longer in the active set.
    for (const [id, handle] of [...drawn.entries()]) {
      if (desired.has(id)) continue;
      removeDrawnIndicator(chart, id, handle);
    }

    // 2) Add indicators that are active but not yet drawn.
    for (const inst of activeIndicators) {
      if (drawn.has(inst.id)) continue;
      addDrawnIndicator(chart, inst);
    }

    // 3) Rebalance pane stretch (price ~3x each oscillator pane).
    rebalancePanes(chart);
  }, [activeIndicators]);

  // Param edits — recompute + setData a plot in place (no series recreate; a
  // type's category/pane never changes). Re-seed ONLY instances whose params
  // actually changed: freshly-added ones were already seeded by the reconcile
  // effect above (we just record their signature), and untouched indicators are
  // left alone so an edit to one never re-renders all the others.
  const appliedParamsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const applied = appliedParamsRef.current;
    const seen = new Set<string>();
    for (const inst of activeIndicators) {
      seen.add(inst.id);
      if (!indicatorsRef.current.has(inst.id)) continue; // not drawn yet
      const sig = JSON.stringify(inst.params);
      const prev = applied.get(inst.id);
      if (prev === undefined) {
        applied.set(inst.id, sig); // just added — reconcile already seeded it
      } else if (prev !== sig) {
        seedIndicator(inst, candlesRef.current);
        applied.set(inst.id, sig);
      }
    }
    // Drop signatures for indicators that were removed.
    for (const id of [...applied.keys()]) {
      if (!seen.has(id)) applied.delete(id);
    }
    // activeIndicators identity already covers param changes (new array on every
    // setActiveIndicators); seedIndicator is a stable closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators]);

  // On-chain position lines — entry + estimated liq. Remove and recreate on any
  // position / symbol change so lines never leak across markets. Nothing is
  // drawn for display-only symbols or when there is no open position.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Single source of truth for teardown: the cleanup below closes over the
    // exact `lines` this run created and removes them before the next run (or
    // on unmount). We intentionally do NOT also clear posLinesRef at the top of
    // the body — React always runs the previous cleanup first, so a top clear
    // would be redundant double-bookkeeping over the same ref.
    if (!isTradeable || !position) return;

    const lines: IPriceLine[] = [];
    if (position.entryPrice > 0) {
      lines.push(
        series.createPriceLine({
          price: position.entryPrice,
          color: ENTRY_GRAY,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "Entry",
        }),
      );
    }
    // liquidationPrice is a DISPLAY-ONLY client estimate (maintenance margin as
    // a fraction of notional, mirroring the SDK view) — the on-chain Position
    // has no liq field. Labeled "Liq (est)" so it doesn't read as chain-exact.
    if (position.liquidationPrice > 0) {
      lines.push(
        series.createPriceLine({
          price: position.liquidationPrice,
          color: RED,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Liq (est)",
        }),
      );
    }
    // NOTE: the on-chain Position account has NO take-profit / stop-loss fields
    // (the TP/SL UI is a non-wired stub), so there are no real TP/SL lines to
    // draw. The TP #0ECB81 / SL #F0B90B styling is reserved for when chain TP/SL
    // lands; until then we honestly draw nothing for them.

    posLinesRef.current = lines;

    return () => {
      const s = seriesRef.current;
      if (!s) return; // chart disposed — remove() already freed the lines
      for (const l of lines) {
        try {
          s.removePriceLine(l);
        } catch {
          /* series may be mid-teardown */
        }
      }
      posLinesRef.current = [];
    };
  }, [position, isTradeable, sym]);

  // ----- public indicator handlers (menu / legend / settings) -----

  // Add a fresh instance of `type` with its default params (menu stays open).
  const addIndicator = (type: string) => {
    const def = INDICATORS[type];
    if (!def) return;
    setActiveIndicators((prev) => [
      ...prev,
      { id: nextId(), type, params: defaultParams(def) },
    ]);
  };

  // Remove one instance by id (closes its settings popover if it was open).
  const removeIndicator = (id: string) => {
    setActiveIndicators((prev) => prev.filter((i) => i.id !== id));
    setSettingsOpen((cur) => (cur === id ? null : cur));
  };

  // Live param edit for one instance (the param-change effect re-seeds it).
  const updateIndicatorParams = (id: string, params: Record<string, number>) => {
    setActiveIndicators((prev) =>
      prev.map((i) => (i.id === id ? { ...i, params } : i)),
    );
  };

  // Legend values: hovered candle when hovering, else the latest candle.
  const ohlc = hover ?? latest;
  const ohlcUp = ohlc ? ohlc.close >= ohlc.open : true;
  const ohlcColor = ohlcUp ? GREEN : RED;
  // 24h change / last from the shared ticker; fall back to loaded candles.
  // Until the ticker arrives, show "—" rather than a fabricated +0.00% that
  // would read as a real flat day.
  const change24h = ticker?.change24h;
  const changeKnown = change24h !== undefined && Number.isFinite(change24h);
  const last = ticker?.price ?? latest?.close;
  const changeUp = (change24h ?? 0) >= 0;
  const changeColor = changeKnown ? (changeUp ? GREEN : RED) : "#848E9C";

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: BG }}>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-sur-border flex-shrink-0">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              "px-2 py-0.5 text-[11px] rounded font-medium transition-colors",
              tf === t
                ? "bg-sur-accent/15 text-sur-accent"
                : "text-sur-muted hover:text-sur-text",
            )}
          >
            {t}
          </button>
        ))}

        {/* divider between timeframe pills and the indicator menu */}
        <span className="mx-1 h-3 w-px bg-sur-border" aria-hidden />

        {/* Generic indicator picker — overlays + oscillators. */}
        <IndicatorMenu onAdd={addIndicator} />
      </div>

      <div ref={hostRef} className="relative flex-1 min-h-0">
        {/* OHLC legend — does not block pointer events on the chart. */}
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 select-none rounded bg-black/40 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur-sm"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sur-text">{symbol}</span>
            <span style={{ color: changeColor }}>
              {last !== undefined ? `$${fmtPx(last)}` : "—"}
            </span>
            <span style={{ color: changeColor }}>
              {changeKnown
                ? `${changeUp ? "+" : ""}${(change24h ?? 0).toFixed(2)}%`
                : "—"}
            </span>
          </div>
          <div className="mt-0.5 flex gap-2" style={{ color: ohlcColor }}>
            <span>O {fmtPx(ohlc?.open)}</span>
            <span>H {fmtPx(ohlc?.high)}</span>
            <span>L {fmtPx(ohlc?.low)}</span>
            <span>C {fmtPx(ohlc?.close)}</span>
          </div>
        </div>

        {/* Active indicators — stacked, compact, below the OHLC legend. The
            wrapper is pointer-events-none so it never blocks the chart, but each
            row re-enables pointer events for its own gear / remove controls. */}
        {activeIndicators.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-[52px] z-10 flex flex-col gap-0.5 font-mono text-[10px]">
            {activeIndicators.map((inst) => {
              const def = INDICATORS[inst.type];
              if (!def) return null;
              const summary = paramSummary(def, inst.params);
              return (
                <div key={inst.id} className="relative">
                  <div className="pointer-events-auto flex items-center gap-1.5 rounded bg-black/40 px-1.5 py-0.5 backdrop-blur-sm">
                    {/* colored dot per plot (skip the histogram fallback color) */}
                    <span className="flex items-center gap-0.5">
                      {def.plots
                        .filter((p) => p.kind === "line")
                        .map((p) => (
                          <span
                            key={p.key}
                            aria-hidden
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                        ))}
                    </span>
                    <span className="font-medium text-sur-text">{def.label}</span>
                    {summary && <span className="text-sur-muted">{summary}</span>}
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsOpen((cur) => (cur === inst.id ? null : inst.id))
                      }
                      aria-label={`${def.label} settings`}
                      className="ml-0.5 text-sur-muted hover:text-sur-text transition-colors"
                    >
                      <Settings2 size={11} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeIndicator(inst.id)}
                      aria-label={`Remove ${def.label}`}
                      className="text-sur-muted hover:text-sur-text transition-colors"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </div>

                  {settingsOpen === inst.id && (
                    <div className="pointer-events-auto">
                      <IndicatorSettings
                        def={def}
                        params={inst.params}
                        onChange={(params) => updateIndicatorParams(inst.id, params)}
                        onClose={() => setSettingsOpen(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveChart;
