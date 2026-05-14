"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";
import { MARKET_IDS } from "@/lib/devnet-constants";
import { SurPdas } from "@/lib/pdas";
import {
  symbolFromMarketId,
  type MarketState,
} from "./use-market-state";

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

export interface MarketsResult {
  markets: MarketState[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches all configured markets (BTC, SOL, ETH) from perp_engine.
 *
 * Markets that don't exist on-chain yet are silently skipped — this is
 * the current devnet state until Phase 9 runs init. The hook returns
 * an empty array, not an error, in that case.
 */
export function useMarkets(): MarketsResult {
  const { program } = usePerpEngine();

  const query = useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<MarketState[]> => {
      const ids = Object.values(MARKET_IDS);

      const results = await Promise.all(
        ids.map(async (idBytes): Promise<MarketState | null> => {
          const [pda] = SurPdas.market(idBytes);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const acc = (await (program.account as any).market.fetchNullable(
            pda,
          )) as MarketAccount | null;
          if (!acc) return null;
          const marketId: Uint8Array = Uint8Array.from(
            acc.marketId as ArrayLike<number>,
          );
          return {
            marketId,
            symbol: symbolFromMarketId(marketId),
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
        }),
      );

      return results.filter((m): m is MarketState => m !== null);
    },
  });

  return {
    markets: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
