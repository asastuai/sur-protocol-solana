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
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

import { usePerpVault } from "@/hooks/programs/use-perp-vault";
import { DEVNET_USDC_MINT } from "@/lib/devnet-constants";
import { SurPdas } from "@/lib/pdas";

// ============================================================
// useWithdrawUSDC
// ============================================================
// Builds + signs + sends perp_vault.withdraw(amount) from the connected
// wallet. amount is u64 USDC base units (6 decimals).
//
// Required PDAs / accounts:
//   - vault_config    = SurPdas.vaultConfig()
//   - vault_authority = SurPdas.vaultAuthority() (signs the SPL transfer out)
//   - usdc_vault      = SurPdas.usdcVault()
//   - user_usdc       = withdrawer ATA for DEVNET_USDC_MINT (created if missing)
//   - account_balance = SurPdas.accountBalance(withdrawer)

export function useWithdrawUSDC() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = usePerpVault();

  return useCallback(
    async (amount: BN): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const withdrawer = wallet.publicKey;

      const [vaultConfigPda] = SurPdas.vaultConfig();
      const [vaultAuthorityPda] = SurPdas.vaultAuthority();
      const [usdcVaultPda] = SurPdas.usdcVault();
      const [accountBalancePda] = SurPdas.accountBalance(withdrawer);

      const userUsdcAta = await getAssociatedTokenAddress(
        DEVNET_USDC_MINT,
        withdrawer,
      );

      const tx = new Transaction();

      // Ensure ATA exists — first withdraw on a fresh wallet would fail
      // otherwise. SPL transfer destination must exist.
      const ataInfo = await connection.getAccountInfo(userUsdcAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            withdrawer,
            userUsdcAta,
            withdrawer,
            DEVNET_USDC_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      const ix = await program.methods
        .withdraw(amount)
        .accounts({
          vaultConfig: vaultConfigPda,
          vaultAuthority: vaultAuthorityPda,
          usdcVault: usdcVaultPda,
          userUsdc: userUsdcAta,
          accountBalance: accountBalancePda,
          withdrawer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      tx.add(ix);
      tx.feePayer = withdrawer;
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
