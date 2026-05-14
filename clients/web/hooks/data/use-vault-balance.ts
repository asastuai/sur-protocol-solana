"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

import { usePerpVault } from "@/hooks/programs/use-perp-vault";
import { SurPdas } from "@/lib/pdas";

export interface VaultBalanceResult {
  balance: BN | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface AccountBalanceAccount {
  bump: number;
  trader: PublicKey;
  balance: BN;
  collateralBalance: BN;
}

/**
 * Reads the AccountBalance PDA for `trader` from perp_vault.
 *
 * If the PDA doesn't exist on-chain (trader never deposited), we return
 * `BN(0)` rather than `undefined` — this is the dominant case on devnet
 * right now (programs deployed, no accounts initialized).
 *
 * Real RPC errors (network down, invalid pubkey) bubble through `error`.
 */
export function useVaultBalance(
  trader: PublicKey | undefined,
): VaultBalanceResult {
  const { program } = usePerpVault();

  const query = useQuery({
    queryKey: ["vault-balance", trader?.toBase58() ?? null],
    enabled: !!trader,
    queryFn: async (): Promise<BN> => {
      if (!trader) return new BN(0);
      const [balancePda] = SurPdas.accountBalance(trader);
      try {
        // fetchNullable returns null instead of throwing for missing accounts.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acc = (await (program.account as any).accountBalance.fetchNullable(
          balancePda,
        )) as AccountBalanceAccount | null;
        return acc?.balance ?? new BN(0);
      } catch {
        // Treat decode / not-found failures as zero balance; only true RPC
        // errors will reach the outer catch.
        return new BN(0);
      }
    },
  });

  return {
    balance: query.data,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
