"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { useA2aDarkpool } from "@/hooks/programs/use-a2a-darkpool";

// Intent.status enum index (matches programs/a2a_darkpool/src/state.rs:IntentStatus)
// Anchor serializes Rust enums as `{ open: {} } | { filled: {} } | ...`,
// so we discriminate on the property name.
export type IntentStatusName =
  | "open"
  | "filled"
  | "cancelled"
  | "expired";

export interface OpenIntent {
  pda: PublicKey;
  id: BN;
  agent: PublicKey;
  marketId: Uint8Array;
  isBuy: boolean;
  size: BN;
  minPrice: BN;
  maxPrice: BN;
  createdAt: BN;
  expiresAt: BN;
  feeBpsAtPost: BN;
}

interface IntentAccount {
  bump: number;
  id: BN;
  agent: PublicKey;
  marketId: number[] | Uint8Array;
  isBuy: boolean;
  size: BN;
  minPrice: BN;
  maxPrice: BN;
  createdAt: BN;
  expiresAt: BN;
  status: Record<IntentStatusName, Record<string, never>>;
  filledResponseId: BN;
  feeBpsAtPost: BN;
}

export interface OpenIntentsResult {
  intents: OpenIntent[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Returns every Intent PDA with status = Open and expires_at > now. No memcmp
// filter — intent set will be small on devnet. Real production would seed
// memcmp on the status byte offset for efficiency.
export function useOpenIntents(): OpenIntentsResult {
  const { program } = useA2aDarkpool();

  const query = useQuery({
    queryKey: ["a2a-open-intents"],
    staleTime: 5_000,
    // Poll so newly posted intents from other agents appear and expired ones
    // drop out of the list without requiring a manual reload. The queryFn
    // already filters out intents whose expires_at has passed.
    refetchInterval: 5_000,
    queryFn: async (): Promise<OpenIntent[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (await (program.account as any).intent.all()) as Array<{
        publicKey: PublicKey;
        account: IntentAccount;
      }>;

      const now = Math.floor(Date.now() / 1000);

      return all
        .filter(
          (entry) =>
            "open" in entry.account.status &&
            entry.account.expiresAt.toNumber() > now,
        )
        .map((entry) => ({
          pda: entry.publicKey,
          id: entry.account.id,
          agent: entry.account.agent,
          marketId: Uint8Array.from(
            entry.account.marketId as ArrayLike<number>,
          ),
          isBuy: entry.account.isBuy,
          size: entry.account.size,
          minPrice: entry.account.minPrice,
          maxPrice: entry.account.maxPrice,
          createdAt: entry.account.createdAt,
          expiresAt: entry.account.expiresAt,
          feeBpsAtPost: entry.account.feeBpsAtPost,
        }));
    },
  });

  return {
    intents: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
