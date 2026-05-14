"use client";

import { useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

import { useA2aDarkpool } from "@/hooks/programs/use-a2a-darkpool";
import { SurPdas } from "@/lib/pdas";

// ============================================================
// usePostIntent
// ============================================================
// Builds + signs + sends a2a_darkpool.post_intent.
//
// The intent PDA is seeded by ["intent", config.next_intent_id] — we read
// next_intent_id from on-chain config first, then derive the PDA. This is
// inherently racy under concurrent posts; the program will reject with
// already-in-use if another agent's post lands first. The caller retries.
//
// The reputation PDA is init_if_needed at the program; we just derive it.
//
// Pre-init failure mode (Phase 9 hasn't run yet): config PDA doesn't exist,
// fetch throws — bubbled up to caller.

export interface PostIntentArgs {
  marketId: Uint8Array;
  /** true = buy / long; false = sell / short. */
  isBuy: boolean;
  /** Magnitude in SIZE_PRECISION (1e8) units. */
  size: BN;
  /** PRICE_PRECISION (1e6) units. */
  minPrice: BN;
  /** PRICE_PRECISION (1e6) units. Slippage cap. */
  maxPrice: BN;
  /** Seconds until intent expires. */
  durationSecs: BN;
}

interface DarkPoolConfigSnapshot {
  bump: number;
  nextIntentId: BN;
}

export function usePostIntent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = useA2aDarkpool();

  return useCallback(
    async (args: PostIntentArgs): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const agent = wallet.publicKey;

      const [configPda] = SurPdas.darkpoolConfig();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (await (program.account as any).darkPoolConfig.fetch(
        configPda,
      )) as DarkPoolConfigSnapshot;

      const [intentPda] = SurPdas.intent(BigInt(cfg.nextIntentId.toString()));
      const [reputationPda] = SurPdas.agentReputation(agent);

      const ix = await program.methods
        .postIntent(
          Array.from(args.marketId),
          args.isBuy,
          args.size,
          args.minPrice,
          args.maxPrice,
          args.durationSecs,
        )
        .accounts({
          config: configPda,
          intent: intentPda,
          reputation: reputationPda,
          agent,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = agent;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return sig;
    },
    [connection, wallet, program],
  );
}
