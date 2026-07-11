"use client";

// ============================================================
//        CHART POSITION — selected-symbol open position (read)
// ============================================================
// Read-only convenience hook for the live chart. The chart only receives a
// `symbol` prop, but to draw position overlay lines it needs the connected
// trader's OPEN position for THAT symbol. There is no per-symbol position
// hook on-chain — usePositionsBridge returns ALL markets' positions — so this
// wraps the existing bridges, applies the on-chain tradeable guard, and filters
// down to the single relevant position.
//
// Display only: the on-chain Position account has NO liquidation / TP / SL
// fields. `liquidationPrice` here is the bridge's flat-2.5%-MM client estimate
// (see TradeBridge), surfaced as an ESTIMATED line. Settlement reads the oracle.

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import {
  useMarketsBridge,
  usePositionsBridge,
} from "@/components/trade/TradeBridge";
import { MARKETS } from "@/lib/markets";
import type { Position } from "@/lib/front-types";

export interface ChartPosition {
  /** The trader's open position for `symbol`, or null when none / no wallet. */
  position: Position | null;
  /** True only for symbols with a real on-chain market (BTC/SOL/ETH). */
  isTradeable: boolean;
}

/**
 * The connected wallet's open position for `symbol` (catalog format, e.g.
 * "BTC-USD"), or null. `isTradeable` gates whether on-chain lines should be
 * drawn at all — only the 3 markets with real marketIds can hold a position.
 */
export function useChartPosition(symbol: string): ChartPosition {
  const { connected, publicKey } = useWallet();
  const trader = connected ? publicKey ?? undefined : undefined;

  // Reuse the same bridges the trade page uses. Positions are display-ready
  // plain JS numbers in USD / base units, already decimal-converted.
  const { markets } = useMarketsBridge(symbol);
  const { positions } = usePositionsBridge(trader, markets);

  const isTradeable = useMemo(
    () => MARKETS.some((m) => m.symbol === symbol),
    [symbol],
  );

  const position = useMemo<Position | null>(() => {
    if (!isTradeable) return null;
    return positions.find((p) => p.symbol === symbol) ?? null;
  }, [positions, symbol, isTradeable]);

  return { position, isTradeable };
}
