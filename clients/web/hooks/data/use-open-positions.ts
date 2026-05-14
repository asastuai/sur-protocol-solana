"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";

// Position layout: 8 (disc) + 1 (bump) + 32 (market_id) = 41 bytes before
// the `trader` pubkey. Mirrors POSITION_TRADER_OFFSET in
// clients/sdk/src/views/perp_engine_view.ts.
const POSITION_TRADER_OFFSET = 41;

export interface OpenPosition {
  pda: PublicKey;
  marketId: Uint8Array;
  trader: PublicKey;
  size: BN;
  entryPrice: BN;
  margin: BN;
  lastUpdated: BN;
  isLong: boolean;
}

interface PositionAccount {
  bump: number;
  marketId: number[] | Uint8Array;
  trader: PublicKey;
  size: BN;
  entryPrice: BN;
  margin: BN;
  lastUpdated: BN;
}

export interface OpenPositionsResult {
  positions: OpenPosition[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Returns the trader's open positions across ALL markets. Uses
 * `program.account.position.all([memcmp])` with the memcmp offset
 * documented in the SDK's PerpEngineView.
 *
 * Positions with `size == 0` are filtered out (stale / closed).
 *
 * When the perp_engine has no positions at all on-chain yet
 * (current devnet state) the array is empty — no error.
 */
export function useOpenPositions(
  trader: PublicKey | undefined,
): OpenPositionsResult {
  const { program } = usePerpEngine();

  const query = useQuery({
    queryKey: ["open-positions", trader?.toBase58() ?? null],
    enabled: !!trader,
    queryFn: async (): Promise<OpenPosition[]> => {
      if (!trader) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (await (program.account as any).position.all([
        {
          memcmp: {
            offset: POSITION_TRADER_OFFSET,
            bytes: trader.toBase58(),
          },
        },
      ])) as Array<{ publicKey: PublicKey; account: PositionAccount }>;

      return all
        .filter((entry) => !entry.account.size.isZero())
        .map((entry) => {
          const marketId = Uint8Array.from(
            entry.account.marketId as ArrayLike<number>,
          );
          return {
            pda: entry.publicKey,
            marketId,
            trader: entry.account.trader,
            size: entry.account.size,
            entryPrice: entry.account.entryPrice,
            margin: entry.account.margin,
            lastUpdated: entry.account.lastUpdated,
            isLong: !entry.account.size.isNeg(),
          } satisfies OpenPosition;
        });
    },
  });

  return {
    positions: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
