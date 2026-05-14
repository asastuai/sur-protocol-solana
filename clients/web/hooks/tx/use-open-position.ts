"use client";

import { useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { SurPdas } from "@/lib/pdas";

// ============================================================
// useOpenPosition
// ============================================================
// Builds + signs + sends perp_engine.open_position(size_delta, fill_price).
//
// The connected wallet acts as BOTH:
//   - trader (UncheckedAccount, identity only — position PDA derived from this)
//   - operator (signer — must be registered as engine operator in Phase 9)
//
// Args from the caller-facing API:
//   marketId  : 32-byte market identifier (e.g. MARKET_IDS.BTC_USD)
//   isLong    : true => +size, false => -size
//   size      : BN, magnitude in SIZE_PRECISION units (1e8 — 0.1 BTC = 10_000_000)
//   fillPrice : BN, in PRICE_PRECISION units (1e6 — 50_000 USD = 50_000_000_000)
//
//  is documented in the prompt but is NOT a program arg in v0.3.
// The engine computes required margin from market.initial_margin_bps. We
// accept it to keep the call-site UX intent visible in the demo, but it
// is unused inside the ix. Margin lock fires when remaining_accounts.len >= 6.
//
// Vault remaining_accounts (order per programs/perp_engine/src/instructions/open_position.rs):
//   0. engine_authority PDA
//   1. perp_vault program id
//   2. vault_config PDA
//   3. vault_operator PDA (derived from engine_authority)
//   4. trader_balance PDA (seeded by trader)
//   5. engine_pool_balance PDA (seeded by engine_authority)

export interface OpenPositionArgs {
  marketId: Uint8Array;
  isLong: boolean;
  size: BN;
  fillPrice: BN;
  /** Not consumed by the program — kept for UX traceability. */
  leverage?: number;
}

export function useOpenPosition() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = usePerpEngine();

  return useCallback(
    async (args: OpenPositionArgs): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const trader = wallet.publicKey;
      const operator = wallet.publicKey;

      const sizeDelta = args.isLong ? args.size : args.size.neg();

      const [engineConfigPda] = SurPdas.engineConfig();
      const [marketPda] = SurPdas.market(args.marketId);
      const [positionPda] = SurPdas.position(args.marketId, trader);
      const [engineAuthorityPda] = SurPdas.engineAuthority();
      const [operatorPda] = SurPdas.engineOperator(operator);

      // Vault-side accounts for the v0.3 margin-lock CPI.
      const vaultProgramId = PROGRAM_IDS.perp_vault;
      const [vaultConfigPda] = SurPdas.vaultConfig();
      const [vaultOperatorPda] = SurPdas.vaultOperator(engineAuthorityPda);
      const [traderBalancePda] = SurPdas.accountBalance(trader);
      const [enginePoolBalancePda] = SurPdas.accountBalance(engineAuthorityPda);

      const remainingAccounts: Array<{
        pubkey: PublicKey;
        isSigner: boolean;
        isWritable: boolean;
      }> = [
        { pubkey: engineAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: vaultProgramId,     isSigner: false, isWritable: false },
        { pubkey: vaultConfigPda,     isSigner: false, isWritable: false },
        { pubkey: vaultOperatorPda,   isSigner: false, isWritable: false },
        { pubkey: traderBalancePda,   isSigner: false, isWritable: true  },
        { pubkey: enginePoolBalancePda, isSigner: false, isWritable: true },
      ];

      const ix = await program.methods
        .openPosition(sizeDelta, args.fillPrice)
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          position: positionPda,
          trader,
          operatorAccount: operatorPda,
          operator,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = operator;
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
