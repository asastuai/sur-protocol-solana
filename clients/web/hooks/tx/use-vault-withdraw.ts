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

import { useTradingVault } from "@/hooks/programs/use-trading-vault";
import {
  SurPdas,
  depositorPda,
  tradingVaultAuthorityPda,
  tradingVaultConfigPda,
  vaultPda,
} from "@/lib/pdas";

// ============================================================
// useVaultWithdraw
// ============================================================
// Builds + signs + sends trading_vault.withdraw(shares) from the connected
// wallet (the depositor signs). `shares` is u128 — ALWAYS pass a BN.
//
// withdraw burns `shares` from the caller's Depositor PDA and returns the
// pro-rata USDC into their perp_vault balance via a CPI. Same CPI-account
// resolution as deposit: PDAs auto-resolve from the IDL, the perp_vault
// program/config/operator come from TradingVaultConfig, and the three
// AccountBalance PDAs are derived explicitly.
//
// NOTE: there is NO ATA / system_program-created-account inline here —
// withdraw settles into the depositor's existing perp_vault AccountBalance,
// not their token wallet. To pull USDC to the wallet, the user subsequently
// withdraws from perp_vault (the trade page's Funds → Withdraw flow).

export interface VaultWithdrawArgs {
  /** 32-byte vault id (TradingVault.id). */
  vaultId: Uint8Array;
  /** Vault manager pubkey (for manager_balance PDA). */
  manager: PublicKey;
  /** Shares to burn (u128). MUST be a BN. */
  shares: BN;
}

interface TradingVaultConfigAccount {
  perpVaultProgram: PublicKey;
  perpVaultConfig: PublicKey;
  vaultOperatorAccount: PublicKey;
}

export function useVaultWithdraw() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = useTradingVault();

  return useCallback(
    async (args: VaultWithdrawArgs): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const depositor = wallet.publicKey;

      if (args.vaultId.length !== 32) {
        throw new Error("vaultId must be 32 bytes");
      }
      if (args.shares.isZero() || args.shares.isNeg()) {
        throw new Error("shares must be a positive u128");
      }

      const [configPda] = tradingVaultConfigPda();
      const [vaultPubkey] = vaultPda(args.vaultId);
      const [depositorAccountPda] = depositorPda(args.vaultId, depositor);
      const [authorityPda] = tradingVaultAuthorityPda();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (await (program.account as any).tradingVaultConfig.fetch(
        configPda,
      )) as TradingVaultConfigAccount;

      const [depositorBalancePda] = SurPdas.accountBalance(depositor);
      const [vaultBalancePda] = SurPdas.accountBalance(vaultPubkey);
      const [managerBalancePda] = SurPdas.accountBalance(args.manager);

      const ix = await program.methods
        // u128 arg — Anchor serializes from the BN.
        .withdraw(args.shares)
        .accounts({
          config: configPda,
          vault: vaultPubkey,
          depositorAccount: depositorAccountPda,
          depositor,
          authority: authorityPda,
          perpVaultProgram: cfg.perpVaultProgram,
          perpVaultConfig: cfg.perpVaultConfig,
          vaultOperatorAccount: cfg.vaultOperatorAccount,
          depositorBalance: depositorBalancePda,
          vaultBalance: vaultBalancePda,
          managerBalance: managerBalancePda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
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
