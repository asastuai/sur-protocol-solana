"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";
import { SurPdas } from "@/lib/pdas";

export interface MarketState {
  marketId: Uint8Array;
  symbol: string;
  pda: PublicKey;
  active: boolean;
  initialMarginBps: BN;
  maintenanceMarginBps: BN;
  maxPositionSize: BN;
  markPrice: BN;
  indexPrice: BN;
  lastPriceUpdate: BN;
  openInterestLong: BN;
  openInterestShort: BN;
}

interface MarketAccount {
  bump: number;
  marketId: number[] | Uint8Array;
  active: boolean;
  initialMarginBps: BN;
  maintenanceMarginBps: BN;
  maxPositionSize: BN;
  markPrice: BN;
  indexPrice: BN;
  lastPriceUpdate: BN;
  openInterestLong: BN;
  openInterestShort: BN;
}

// Decode the trailing zero-padded ASCII symbol from a 32-byte market id.
function symbolFromMarketId(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

function toBytes(marketId: Uint8Array | PublicKey): Uint8Array {
  if (marketId instanceof PublicKey) return marketId.toBytes();
  return marketId;
}

export interface MarketStateResult {
  market: MarketState | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Reads a single Market PDA from perp_engine. More efficient than
 * `useMarkets()` when only one market is needed. If the PDA doesn't exist
 * on-chain (market never initialized) the hook returns `market: undefined`
 * with no error — uninitialized programs are the v0.3 devnet state.
 */
export function useMarketState(
  marketId: Uint8Array | PublicKey,
): MarketStateResult {
  const { program } = usePerpEngine();
  const idBytes = toBytes(marketId);

  const query = useQuery({
    queryKey: ["market-state", Buffer.from(idBytes).toString("hex")],
    queryFn: async (): Promise<MarketState | null> => {
      const [pda] = SurPdas.market(idBytes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = (await (program.account as any).market.fetchNullable(
        pda,
      )) as MarketAccount | null;
      if (!acc) return null;
      return {
        marketId: Uint8Array.from(acc.marketId as ArrayLike<number>),
        symbol: symbolFromMarketId(
          Uint8Array.from(acc.marketId as ArrayLike<number>),
        ),
        pda,
        active: acc.active,
        initialMarginBps: acc.initialMarginBps,
        maintenanceMarginBps: acc.maintenanceMarginBps,
        maxPositionSize: acc.maxPositionSize,
        markPrice: acc.markPrice,
        indexPrice: acc.indexPrice,
        lastPriceUpdate: acc.lastPriceUpdate,
        openInterestLong: acc.openInterestLong,
        openInterestShort: acc.openInterestShort,
      };
    },
  });

  return {
    market: query.data ?? undefined,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export { symbolFromMarketId };
