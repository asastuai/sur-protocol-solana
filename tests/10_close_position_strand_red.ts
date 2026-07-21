import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerpEngine } from "../target/types/perp_engine";
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
  createInitializeAccountInstruction,
  ACCOUNT_SIZE,
  getMinimumBalanceForRentExemptAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// close_position — RED test: strands trader payout when vault
// settlement accounts are omitted from remaining_accounts.
// ============================================================
//
// FINDING (see programs/perp_engine/src/instructions/close_position.rs
// around line 119): the winner payout path is gated behind
//   `has_vault_accounts && total_return > 0`
// where `has_vault_accounts = ctx.remaining_accounts.len() >= 6`.
//
// Unlike reduce_position (see tests/02_perp_engine.ts, "reduce_position
// reverts when vault accounts are missing"), close_position does NOT
// `require!` the vault accounts to be present. If an operator calls
// close_position with an empty (or short) remaining_accounts list for a
// WINNING position:
//   - position.size / entry_price / margin are unconditionally zeroed
//   - PositionClosed is emitted (looks like a normal, successful close)
//   - but the CPI that would pay released_margin + PnL to the trader is
//     silently skipped
//
// The funds (margin + profit) remain stuck in engine_pool with no
// position left to reopen/reclaim them via — a permanent strand.
//
// This test mirrors the harness/fixtures established in
// tests/02_perp_engine.ts (Anchor TS, mocha, same PDA/account helpers,
// same fundTrader/openPos/bal helper pattern) but drives its own local
// setup (own engine_config/market/operator) so it does not depend on
// execution order against 02_perp_engine.ts.
//
// REGRESSION: after the HIGH fix (require!(remaining_accounts.len() >= 6) in
// close_position), calling close_position without the vault settlement accounts
// REVERTS. This test asserts the guard holds — the position is not zeroed and no
// funds are stranded.

describe("close_position — reverts when vault accounts omitted (regression)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const trader1 = Keypair.generate();
  const oracleRouterPlaceholder = Keypair.generate().publicKey;

  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    program.programId,
  );
  const [engineAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_authority")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );

  // Distinct market id from 02_perp_engine.ts's BTC-USD to keep this file
  // independent of that suite's state/order.
  const marketIdEth = Buffer.alloc(32);
  Buffer.from("ETH-USD-RED").copy(marketIdEth);
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdEth],
    program.programId,
  );
  const positionPda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketIdEth, trader.toBuffer()],
      program.programId,
    )[0];

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    vault.programId,
  );
  const [usdcVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault")],
    vault.programId,
  );
  const balancePda = (who: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), who.toBuffer()],
      vault.programId,
    )[0];
  const vaultOperatorPda = (op: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), op.toBuffer()],
      vault.programId,
    )[0];

  let usdcMint: PublicKey;
  let engineAuthorityUsdc: PublicKey;

  const openCloseRA = (trader: PublicKey) => [
    { pubkey: engineAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: vault.programId, isSigner: false, isWritable: false },
    { pubkey: vaultConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultOperatorPda(engineAuthorityPda), isSigner: false, isWritable: false },
    { pubkey: balancePda(trader), isSigner: false, isWritable: true },
    { pubkey: balancePda(engineAuthorityPda), isSigner: false, isWritable: true },
  ];

  const bal = async (pk: PublicKey) =>
    (await vault.account.accountBalance.fetch(balancePda(pk))).balance.toNumber();

  before(async () => {
    for (const target of [
      operatorKp.publicKey,
      trader1.publicKey,
      engineAuthorityPda,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    const vc = await vault.account.vaultConfig.fetch(vaultConfigPda);
    usdcMint = vc.usdcMint;

    // engine_config: reuse if already initialized by 02_perp_engine.ts
    // running in the same test session, otherwise initialize fresh.
    const existingCfg = await program.account.engineConfig.fetchNullable(
      engineConfigPda,
    );
    if (!existingCfg) {
      await program.methods
        .initialize()
        .accounts({
          engineConfig: engineConfigPda,
          authority: engineAuthorityPda,
          perpVault: vault.programId,
          oracleRouter: oracleRouterPlaceholder,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await vault.methods
        .setOperator(engineAuthorityPda, true)
        .accounts({
          vaultConfig: vaultConfigPda,
          operatorAccount: vaultOperatorPda(engineAuthorityPda),
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Bootstrap engine_pool balance so the CPI destination exists.
      const tokenAccountKp = Keypair.generate();
      const rent = await getMinimumBalanceForRentExemptAccount(provider.connection);
      const createIx = SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: tokenAccountKp.publicKey,
        lamports: rent,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      const initIx = createInitializeAccountInstruction(
        tokenAccountKp.publicKey,
        usdcMint,
        engineAuthorityPda,
      );
      const tx = new anchor.web3.Transaction().add(createIx).add(initIx);
      await provider.sendAndConfirm(tx, [tokenAccountKp]);
      engineAuthorityUsdc = tokenAccountKp.publicKey;

      const POOL_SEED = 50_000 * 1_000_000;
      await mintTo(provider.connection, owner, usdcMint, engineAuthorityUsdc, owner, POOL_SEED);

      await program.methods
        .bootstrapEnginePool(new anchor.BN(POOL_SEED))
        .accounts({
          engineConfig: engineConfigPda,
          authority: engineAuthorityPda,
          perpVaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          authorityUsdc: engineAuthorityUsdc,
          enginePoolBalance: balancePda(engineAuthorityPda),
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // operator authorization on engine_config (idempotent-ish: ignore if
    // already set by another suite run in the same session).
    try {
      await program.methods
        .setOperator(operatorKp.publicKey, true)
        .accounts({
          engineConfig: engineConfigPda,
          operatorAccount: operatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (_e) {
      // already authorized from a prior run in this session — fine.
    }

    await program.methods
      .addMarket(
        Array.from(marketIdEth),
        new anchor.BN(500),
        new anchor.BN(250),
        new anchor.BN(1000 * 100_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateMarkPrice(
        new anchor.BN(3_000 * 1_000_000),
        new anchor.BN(3_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    // Fund trader1's vault balance.
    const SEED = 10_000 * 1_000_000;
    const ata = await createAccount(provider.connection, trader1, usdcMint, trader1.publicKey);
    await mintTo(provider.connection, owner, usdcMint, ata, owner, SEED);
    await vault.methods
      .deposit(new anchor.BN(SEED))
      .accounts({
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        userUsdc: ata,
        accountBalance: balancePda(trader1.publicKey),
        depositor: trader1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();
  });

  it(
    "test_close_position_reverts_when_accounts_omitted: " +
      "close_position with empty remaining_accounts reverts (mandatory settlement); " +
      "position stays open and no funds are stranded",
    async () => {
      // Open LONG 1 ETH @ 3000 -> margin = 1 * 3000 * 5% = 150 USDC.
      await program.methods
        .openPosition(new anchor.BN(1 * 100_000_000), new anchor.BN(3_000 * 1_000_000))
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          position: positionPda(trader1.publicKey),
          trader: trader1.publicKey,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(openCloseRA(trader1.publicKey))
        .signers([operatorKp])
        .rpc();

      const posOpen = await program.account.position.fetch(positionPda(trader1.publicKey));
      assert.equal(posOpen.size.toString(), (1 * 100_000_000).toString());
      assert.equal(posOpen.margin.toString(), "150000000"); // 150 USDC

      const traderBalBefore = await bal(trader1.publicKey);
      const poolBalBefore = await bal(engineAuthorityPda);

      // Close at 3300 (winning: +300/unit -> PnL +300 USDC). Expected
      // (correct) payout = released_margin(150) + pnl(300) = 450 USDC.
      // Call close_position WITHOUT remaining_accounts (len 0 < 6) —
      // this is the exploit precondition: has_vault_accounts is false,
      // so the payout branch at close_position.rs:119 is never entered.
      let threw = false;
      let errMsg = "";
      try {
        await program.methods
          .closePosition(new anchor.BN(3_300 * 1_000_000))
          .accounts({
            engineConfig: engineConfigPda,
            market: marketPda,
            position: positionPda(trader1.publicKey),
            operatorAccount: operatorPda,
            operator: operatorKp.publicKey,
          })
          // Empty remaining_accounts — the missing guard.
          .remainingAccounts([])
          .signers([operatorKp])
          .rpc();
      } catch (e: any) {
        threw = true;
        errMsg = e.toString();
      }

      // FIX assertion: the mandatory-settlement guard (require!(len >= 6)) now makes
      // close_position REVERT when the vault accounts are omitted.
      assert.isTrue(
        threw,
        `expected close_position to REVERT after the mandatory-settlement guard; ` +
          `it did not revert: ${errMsg}`,
      );

      // Position is NOT zeroed — the revert rolled the close back; it stays open.
      const posClosed = await program.account.position.fetch(positionPda(trader1.publicKey));
      assert.equal(
        posClosed.size.toString(),
        (1 * 100_000_000).toString(),
        "position still open (close reverted)",
      );
      assert.equal(posClosed.margin.toString(), "150000000", "margin intact (close reverted)");

      // No stranded funds: balances unchanged because the whole tx reverted.
      const traderBalAfter = await bal(trader1.publicKey);
      const poolBalAfter = await bal(engineAuthorityPda);

      assert.equal(
        traderBalAfter,
        traderBalBefore,
        "FIX CONFIRMED: trader balance unchanged (no strand)",
      );
      assert.equal(
        poolBalAfter,
        poolBalBefore,
        "FIX CONFIRMED: engine_pool unchanged (nothing stranded)",
      );
    },
  );
});
