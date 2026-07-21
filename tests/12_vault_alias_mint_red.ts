import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerpVault } from "../target/types/perp_vault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// perp_vault.internal_transfer — RED test: self-aliasing MINT
// ============================================================
//
// FINDING CRITICAL-1 (see docs/audit/2026-07-21-perp-vault-findings.md and
// programs/perp_vault/src/instructions/internal_transfer.rs:40-52):
//
// InternalTransfer declares `from_balance` and `to_balance` as two independent
// `#[account(mut, seeds = ["balance", *.trader], bump = *.bump)]` inputs with
// NO `constraint = from_balance.key() != to_balance.key()`. Anchor does NOT
// auto-reject two mut account inputs that resolve to the same pubkey. When the
// SAME AccountBalance PDA is passed for both sides, Anchor deserializes it into
// two independent owned copies:
//
//   let from = &mut ctx.accounts.from_balance;   // copy A: balance = B
//   let to   = &mut ctx.accounts.to_balance;     // copy B: balance = B
//   from.balance = from.balance - amount;        // A: B - X
//   to.balance   = to.balance + from_deposit;    // B: B + X
//
// At `exit`, Anchor serializes both copies back to the single underlying
// account in declaration order (from_balance, then to_balance). The `to` write
// happens LAST and wins, discarding copy A's deduction. Stored balance becomes
// B + X — `amount` USDC balance minted from nothing, then withdrawable as real
// USDC via withdraw(), draining honest depositors.
//
// This mirrors the vault harness in tests/01_perp_vault.ts (own vaultConfig is
// initialized there; we fetch it and reuse its usdc mint, mint authority =
// provider owner). It registers its own fresh operator and attacker balance so
// it does not depend on 01's per-test state beyond the one-time vault init.
//
// REGRESSION: after the CRITICAL-1 fix (require_keys_neq!(from, to,
// VaultError::SameAccount) in internal_transfer), passing the same balance PDA for
// both sides REVERTS. This test asserts the guard holds (no mint).

describe("perp_vault.internal_transfer — self-alias rejected by from!=to guard (regression)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const operatorKp = Keypair.generate();
  const attacker = Keypair.generate();

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    vault.programId,
  );
  const [usdcVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault")],
    vault.programId,
  );
  const operatorPda = (op: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), op.toBuffer()],
      vault.programId,
    )[0];
  const balancePda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), trader.toBuffer()],
      vault.programId,
    )[0];

  const bal = async (pk: PublicKey) =>
    (await vault.account.accountBalance.fetch(balancePda(pk))).balance.toNumber();

  let usdcMint: PublicKey;

  const SEED = 1_000_000_000; // 1000 USDC (6 decimals)
  const MINT_AMOUNT = 500_000_000; // 500 USDC to conjure via self-alias

  before(async () => {
    for (const target of [operatorKp.publicKey, attacker.publicKey]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Vault is initialized by 01_perp_vault.ts (runs first); reuse its config
    // + mint (mint authority is the provider owner, so we can mint freely).
    const cfg = await vault.account.vaultConfig.fetch(vaultConfigPda);
    usdcMint = cfg.usdcMint;

    // Register our own fresh operator (authorized global flag — this is HIGH-1,
    // but here we only need one authorized operator to reach the CRITICAL mint).
    await vault.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: operatorPda(operatorKp.publicKey),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fund the attacker's vault balance with a real deposit so its
    // AccountBalance PDA exists with balance = SEED.
    const ata = await createAccount(
      provider.connection,
      attacker,
      usdcMint,
      attacker.publicKey,
    );
    await mintTo(provider.connection, owner, usdcMint, ata, owner, SEED);
    await vault.methods
      .deposit(new anchor.BN(SEED))
      .accounts({
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        userUsdc: ata,
        accountBalance: balancePda(attacker.publicKey),
        depositor: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([attacker])
      .rpc();
  });

  it(
    "test_internal_transfer_self_alias_rejected: passing the same balance PDA as " +
      "from and to reverts (SameAccount); no unbacked mint",
    async () => {
      const before = await bal(attacker.publicKey);
      assert.equal(before, SEED, "precondition: attacker balance == SEED");

      // The exploit: from_balance == to_balance == attacker's own PDA.
      let threw = false;
      let errMsg = "";
      try {
        await vault.methods
          .internalTransfer(new anchor.BN(MINT_AMOUNT))
          .accounts({
            vaultConfig: vaultConfigPda,
            operatorAccount: operatorPda(operatorKp.publicKey),
            fromBalance: balancePda(attacker.publicKey),
            toBalance: balancePda(attacker.publicKey), // SAME account — no guard
            operator: operatorKp.publicKey,
          })
          .signers([operatorKp])
          .rpc();
      } catch (e: any) {
        threw = true;
        errMsg = e.toString();
      }

      // FIX assertion: the from!=to guard (VaultError::SameAccount) now rejects the
      // self-alias, so the call MUST revert and no mint occurs.
      assert.isTrue(
        threw,
        `expected internal_transfer(from==to) to REVERT after the from!=to guard; ` +
          `it did not revert: ${errMsg}`,
      );

      const after = await bal(attacker.publicKey);

      // No mint: balance unchanged because the aliased transfer was rejected.
      assert.equal(
        after,
        before,
        `FIX CONFIRMED: balance unchanged after rejected self-alias (before=${before}, after=${after})`,
      );
    },
  );
});
