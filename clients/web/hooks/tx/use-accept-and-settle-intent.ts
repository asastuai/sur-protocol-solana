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
import type { OpenIntent } from "@/hooks/data/use-open-intents";

// ============================================================
// useAcceptAndSettleIntent
// ============================================================
// IMPLEMENTATION NOTE — IDL vs Solidity divergence
// ============================================================
// In Solidity's A2ADarkPool the responder's "respond" call and the creator's
// "accept" call were two steps. The Solana port preserves that split:
//
//   1) responder calls `post_response(price, duration)`        — this hook
//   2) intent creator calls `accept_and_settle()` (multi-CPI)  — separate flow
//
// `accept_and_settle` is constrained to `intent.agent == intent_creator`
// (signer) and validates a pre-existing Response PDA, so a non-creator
// cannot drive it in one tx. From the responder's UI perspective, posting
// a response AT THE INTENT'S MAX PRICE is the closest single-button
// "accept the terms" action — that's what this hook does.
//
// The full settlement (multi-CPI into perp_engine + perp_vault) fires when
// the intent creator picks up the response in their own flow. Wire that
// settle button into the creator's intent dashboard once Phase 9 init is
// live.
//
// Pre-init failure mode: config PDA missing → fetch throws, bubbled up.

const DEFAULT_RESPONSE_DURATION_SECS = new BN(300); // 5 min

interface DarkPoolConfigSnapshot {
  bump: number;
  nextResponseId: BN;
}

export function useAcceptAndSettleIntent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = useA2aDarkpool();

  return useCallback(
    async (intent: OpenIntent): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const responder = wallet.publicKey;

      if (intent.agent.equals(responder)) {
        throw new Error("Cannot respond to your own intent");
      }

      const [configPda] = SurPdas.darkpoolConfig();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (await (program.account as any).darkPoolConfig.fetch(
        configPda,
      )) as DarkPoolConfigSnapshot;

      const [intentPda] = SurPdas.intent(BigInt(intent.id.toString()));
      const [responsePda] = SurPdas.response(
        BigInt(cfg.nextResponseId.toString()),
      );
      const [reputationPda] = SurPdas.agentReputation(responder);

      const ix = await program.methods
        .postResponse(intent.maxPrice, DEFAULT_RESPONSE_DURATION_SECS)
        .accounts({
          config: configPda,
          intent: intentPda,
          response: responsePda,
          reputation: reputationPda,
          responder,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = responder;
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
