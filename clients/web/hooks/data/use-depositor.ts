"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

import { useTradingVault } from "@/hooks/programs/use-trading-vault";
import { depositorPda } from "@/lib/pdas";
import { USDC_DECIMALS } from "@/lib/formatters";

// ============================================================
// useDepositor
// ============================================================
// Reads the connected wallet's Depositor PDA for a given vault.
// Depositor seed: ["share", vault_id, depositor] (see lib/pdas.depositorPda).
//
// If the PDA doesn't exist (wallet never deposited into this vault) we
// return a zeroed Depositor with `exists: false` — NOT an error. This is
// the dominant case on devnet.

// Shares are minted at USDC precision in the Solidity port (1:1 at genesis).
const SHARE_DECIMALS = USDC_DECIMALS;

export interface DepositorPosition {
  /** True when the Depositor PDA exists on-chain. */
  exists: boolean;
  /** Depositor PDA address. */
  pda: PublicKey;
  /** Shares held (u128, carried as BN). */
  shares: BN;
  /** Shares as a JS float (6dp applied). */
  sharesUi: number;
  /** Lifetime USDC deposited by this wallet into the vault (u64). */
  totalDeposited: BN;
  /** Lifetime USDC withdrawn by this wallet from the vault (u64). */
  totalWithdrawn: BN;
  /** Unix seconds of the last deposit (for lockup checks). */
  depositTimestamp: BN;
  /**
   * Approximate current value of the held shares in USDC, given the
   * vault's estimated share price. Display-only estimate.
   */
  estValueUi: number;
}

interface DepositorAccount {
  bump: number;
  vaultId: number[] | Uint8Array;
  depositor: PublicKey;
  shares: BN;
  depositTimestamp: BN;
  totalDeposited: BN;
  totalWithdrawn: BN;
}

export interface DepositorResult {
  depositor: DepositorPosition | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function sharesToUi(shares: BN): number {
  if (shares.isZero()) return 0;
  const divisor = new BN(10).pow(new BN(SHARE_DECIMALS));
  const whole = shares.div(divisor).toString();
  const frac = shares.mod(divisor).toString().padStart(SHARE_DECIMALS, "0");
  return parseFloat(`${whole}.${frac}`);
}

/**
 * Reads `owner`'s Depositor position in the vault identified by `vaultId`.
 *
 * @param vaultId       32-byte vault id (TradingVault.id).
 * @param owner         connected wallet, or undefined when disconnected.
 * @param estSharePrice the vault's approximate share price (USDC/share) so
 *                      we can show an estimated holdings value. Defaults 1.0.
 */
export function useDepositor(
  vaultId: Uint8Array | undefined,
  owner: PublicKey | undefined,
  estSharePrice = 1.0,
): DepositorResult {
  const { program } = useTradingVault();

  const enabled = !!vaultId && !!owner;

  const query = useQuery({
    queryKey: [
      "depositor",
      vaultId ? Buffer.from(vaultId).toString("hex") : null,
      owner?.toBase58() ?? null,
    ],
    enabled,
    queryFn: async (): Promise<DepositorPosition | null> => {
      if (!vaultId || !owner) return null;
      const [pda] = depositorPda(vaultId, owner);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acc = (await (program.account as any).depositor.fetchNullable(
          pda,
        )) as DepositorAccount | null;

        if (!acc) {
          return {
            exists: false,
            pda,
            shares: new BN(0),
            sharesUi: 0,
            totalDeposited: new BN(0),
            totalWithdrawn: new BN(0),
            depositTimestamp: new BN(0),
            estValueUi: 0,
          };
        }

        const sharesUi = sharesToUi(acc.shares);
        return {
          exists: true,
          pda,
          shares: acc.shares,
          sharesUi,
          totalDeposited: acc.totalDeposited,
          totalWithdrawn: acc.totalWithdrawn,
          depositTimestamp: acc.depositTimestamp,
          estValueUi: sharesUi * estSharePrice,
        };
      } catch {
        // Decode / not-found → treat as no position rather than an error.
        return {
          exists: false,
          pda,
          shares: new BN(0),
          sharesUi: 0,
          totalDeposited: new BN(0),
          totalWithdrawn: new BN(0),
          depositTimestamp: new BN(0),
          estValueUi: 0,
        };
      }
    },
  });

  return {
    depositor: query.data ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
