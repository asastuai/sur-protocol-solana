"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";
import { usePerpVault } from "@/hooks/programs/use-perp-vault";
import {
  PerpEngineView,
  type AccountDetails,
} from "@/lib/views/perp-engine-view";

export interface EngineViewResult {
  view: PerpEngineView;
  details: AccountDetails | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  /**
   * Liquidation price for a given market. Returns BN(0) when the
   * position is empty / not yet on-chain.
   */
  getLiquidationPrice: (
    marketId: PublicKey | Buffer | Uint8Array,
  ) => Promise<BN>;
}

/**
 * Wraps the SDK's PerpEngineView class. Memoized on the engine + vault
 * program identities so the view object is stable across renders.
 *
 * `details` runs `getAccountDetails` for `trader` and is cached by
 * react-query. Returns `undefined` (not zero) until the wallet connects.
 *
 * On uninitialized markets / empty position sets the math degenerates
 * cleanly to zeros — no error is raised. Only real RPC failures surface
 * in `error`.
 */
export function useEngineView(
  trader: PublicKey | undefined,
): EngineViewResult {
  const { program: engineProgram } = usePerpEngine();
  const { program: vaultProgram } = usePerpVault();

  const view = useMemo(
    () => new PerpEngineView(engineProgram, vaultProgram),
    [engineProgram, vaultProgram],
  );

  const query = useQuery({
    queryKey: ["engine-view", "account-details", trader?.toBase58() ?? null],
    enabled: !!trader,
    queryFn: async (): Promise<AccountDetails | null> => {
      if (!trader) return null;
      return view.getAccountDetails(trader);
    },
  });

  return {
    view,
    details: query.data ?? undefined,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
    getLiquidationPrice: (marketId) => view.getLiquidationPrice(marketId, trader!),
  };
}
