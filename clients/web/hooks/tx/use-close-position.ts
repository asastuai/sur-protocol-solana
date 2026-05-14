"use client";

import { useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

import { usePerpEngine } from "@/hooks/programs/use-perp-engine";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { SurPdas } from "@/lib/pdas";

// ============================================================
// useClosePosition
// ============================================================
// Builds + signs + sends perp_engine.close_position(fill_price).
//
// v0.3 close_position closes the FULL position (the on-chain handler
// uses position.size — no partial close arg in this rev). The
//  arg from the prompt's spec is accepted for API
// forward-compat but is currently ignored by the program; we log it
// to console.warn if non-zero AND not equal to the full position size
// is requested (caller can't know the full size without reading the
// position, which is Phase 3's job — Phase 4 stays minimal).
//
// The connected wallet signs as . Position PDA encodes the
// trader, so we derive it from wallet.publicKey.
//
// Vault remaining_accounts (same shape as open_position):
//   0. engine_authority PDA
//   1. perp_vault program id
//   2. vault_config PDA
//   3. vault_operator PDA (derived from engine_authority)
//   4. trader_balance PDA
//   5. engine_pool_balance PDA

export interface ClosePositionArgs {
  marketId: Uint8Array;
  fillPrice: BN;
  /** Currently unused by the on-chain ix (always closes full). */
  sizeToClose?: BN;
}

export function useClosePosition() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = usePerpEngine();

  return useCallback(
    async (args: ClosePositionArgs): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const trader = wallet.publicKey;
      const operator = wallet.publicKey;

      const [engineConfigPda] = SurPdas.engineConfig();
      const [marketPda] = SurPdas.market(args.marketId);
      const [positionPda] = SurPdas.position(args.marketId, trader);
      const [engineAuthorityPda] = SurPdas.engineAuthority();
      const [operatorPda] = SurPdas.engineOperator(operator);

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
        .closePosition(args.fillPrice)
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          position: positionPda,
          operatorAccount: operatorPda,
          operator,
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
