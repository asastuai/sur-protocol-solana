"use client";

import { useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

import { usePerpVault } from "@/hooks/programs/use-perp-vault";
import { DEVNET_USDC_MINT } from "@/lib/devnet-constants";
import { SurPdas } from "@/lib/pdas";

// ============================================================
// useDepositUSDC
// ============================================================
// Builds + signs + sends perp_vault.deposit(amount) from the connected
// wallet. amount is u64 USDC base units (6 decimals).
//
// Required PDAs / accounts:
//   - vault_config    = SurPdas.vaultConfig()
//   - usdc_vault      = SurPdas.usdcVault()  (TokenAccount owned by vault_authority)
//   - user_usdc       = depositor ATA for DEVNET_USDC_MINT (created if missing)
//   - account_balance = SurPdas.accountBalance(depositor)  (init_if_needed)
//
// Pre-init failure mode (Phase 9 has not run yet): the program will
// return AccountNotInitialized / ConstraintRaw on vault_config — that
// is expected. The hook just bubbles the RPC error up.

export function useDepositUSDC() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = usePerpVault();

  return useCallback(
    async (amount: BN): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const depositor = wallet.publicKey;

      const [vaultConfigPda] = SurPdas.vaultConfig();
      const [usdcVaultPda] = SurPdas.usdcVault();
      const [accountBalancePda] = SurPdas.accountBalance(depositor);

      const userUsdcAta = await getAssociatedTokenAddress(
        DEVNET_USDC_MINT,
        depositor,
      );

      const tx = new Transaction();

      // Create the depositor ATA inline if it doesn't exist yet.
      const ataInfo = await connection.getAccountInfo(userUsdcAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            depositor,
            userUsdcAta,
            depositor,
            DEVNET_USDC_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      const ix = await program.methods
        .deposit(amount)
        .accounts({
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          userUsdc: userUsdcAta,
          accountBalance: accountBalancePda,
          depositor,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      tx.add(ix);
      tx.feePayer = depositor;
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
