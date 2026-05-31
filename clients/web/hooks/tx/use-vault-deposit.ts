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
// useVaultDeposit
// ============================================================
// Builds + signs + sends trading_vault.deposit(amount) from the connected
// wallet (the depositor signs). amount is u64 USDC base units (6 decimals).
//
// The trading_vault.deposit ix wraps a CPI into perp_vault to move the
// depositor's collateral into the vault's pooled balance and mint shares
// pro-rata. The PDA accounts (config / vault / depositor_account / authority)
// are auto-resolved by Anchor from the IDL seeds; the perp_vault CPI
// accounts are NOT auto-resolvable, so we read them from TradingVaultConfig
// and derive the three perp_vault AccountBalance PDAs explicitly:
//   - depositor_balance = perp_vault.AccountBalance(depositor)
//   - vault_balance     = perp_vault.AccountBalance(vaultPda)
//   - manager_balance   = perp_vault.AccountBalance(vault.manager)
//
// Pre-init failure mode (vault not created / programs not initialized):
// Anchor returns AccountNotInitialized — the hook bubbles it up for the
// caller's formatError() toast.

export interface VaultDepositArgs {
  /** 32-byte vault id (TradingVault.id). */
  vaultId: Uint8Array;
  /** Vault manager pubkey (for manager_balance PDA). */
  manager: PublicKey;
  /** Deposit amount in USDC base units (u64). */
  amount: BN;
}

interface TradingVaultConfigAccount {
  perpVaultProgram: PublicKey;
  perpVaultConfig: PublicKey;
  vaultOperatorAccount: PublicKey;
}

export function useVaultDeposit() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program } = useTradingVault();

  return useCallback(
    async (args: VaultDepositArgs): Promise<TransactionSignature> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }
      const depositor = wallet.publicKey;

      if (args.vaultId.length !== 32) {
        throw new Error("vaultId must be 32 bytes");
      }

      const [configPda] = tradingVaultConfigPda();
      const [vaultPubkey] = vaultPda(args.vaultId);
      const [depositorAccountPda] = depositorPda(args.vaultId, depositor);
      const [authorityPda] = tradingVaultAuthorityPda();

      // Read CPI target addresses from the program config.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (await (program.account as any).tradingVaultConfig.fetch(
        configPda,
      )) as TradingVaultConfigAccount;

      // perp_vault AccountBalance PDAs (seed: ["balance", trader]).
      const [depositorBalancePda] = SurPdas.accountBalance(depositor);
      const [vaultBalancePda] = SurPdas.accountBalance(vaultPubkey);
      const [managerBalancePda] = SurPdas.accountBalance(args.manager);

      // `vault` and `depositor_account` use self-referential seeds Anchor
      // cannot resolve from the signer alone, so we supply them explicitly.
      // `config`, `authority` are deterministic and Anchor resolves them;
      // we pass them too for robustness.
      const ix = await program.methods
        .deposit(args.amount)
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
