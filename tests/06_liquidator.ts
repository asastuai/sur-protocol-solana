import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Liquidator } from "../target/types/liquidator";
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
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// liquidator — permissionless liquidation via CPI to perp_engine
// ============================================================
// v0.3 wiring #2: liquidator forwards vault remainingAccounts so the
// engine's internal vault CPI fires (keeper reward + insurance routing).
//
// Depends on 02_perp_engine.ts having initialized the engine, registered
// engine_authority as vault operator, and bootstrapped the engine pool.
// We open a fresh SHORT position here (with margin lock via vault),
// move the mark up, liquidate, and assert keeper + insurance vault deltas.

describe("liquidator", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Liquidator as Program<Liquidator>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;

  const owner = (provider.wallet as anchor.Wallet).payer;
  const keeper = Keypair.generate();

  // Re-register a fresh engine operator so we can move mark price.
  const engineOperatorKp = Keypair.generate();

  // Insurance fund authority is the vault account that receives the
  // remaining-margin payout on solvent liquidations and pays out keepers
  // on bad-debt liquidations. We use a fresh keypair as a stand-in for
  // the insurance_fund program's PDA — engine doesn't validate identity,
  // only that the vault accounts wire up.
  const insuranceFundAuthority = Keypair.generate();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("liquidator_config")],
    program.programId,
  );
  const [liquidatorAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("liquidator_authority")],
    program.programId,
  );
  const keeperStatsPda = (k: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("keeper"), k.toBuffer()],
      program.programId,
    )[0];

  // Engine PDAs (shared with 02_perp_engine)
  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);
  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    engine.programId,
  );
  const [engineAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_authority")],
    engine.programId,
  );
  const [engineMarketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBtc],
    engine.programId,
  );
  const positionPda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketIdBtc, trader.toBuffer()],
      engine.programId,
    )[0];
  const engineOperatorPda = (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), operator.toBuffer()],
      engine.programId,
    )[0];

  // Vault PDAs
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

  // Fresh trader for SHORT-then-liquidate scenario.
  const liquidatable_trader = Keypair.generate();

  // Fresh trader for bad-debt scenario (liquidated with effective_margin <= 0).
  const bad_debt_trader = Keypair.generate();

  let usdcMint: PublicKey;

  // remainingAccounts builders.
  const openCloseRA = (trader: PublicKey) => [
    { pubkey: engineAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: vault.programId, isSigner: false, isWritable: false },
    { pubkey: vaultConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultOperatorPda(engineAuthorityPda), isSigner: false, isWritable: false },
    { pubkey: balancePda(trader), isSigner: false, isWritable: true },
    { pubkey: balancePda(engineAuthorityPda), isSigner: false, isWritable: true },
  ];

  const liquidateRA = () => [
    { pubkey: engineAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: vault.programId, isSigner: false, isWritable: false },
    { pubkey: vaultConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultOperatorPda(engineAuthorityPda), isSigner: false, isWritable: false },
    { pubkey: balancePda(keeper.publicKey), isSigner: false, isWritable: true },
    { pubkey: balancePda(engineAuthorityPda), isSigner: false, isWritable: true },
    { pubkey: balancePda(insuranceFundAuthority.publicKey), isSigner: false, isWritable: true },
  ];

  before(async () => {
    for (const target of [
      keeper.publicKey,
      engineOperatorKp.publicKey,
      liquidatable_trader.publicKey,
      bad_debt_trader.publicKey,
      insuranceFundAuthority.publicKey,
      liquidatorAuthorityPda,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    const vc = await vault.account.vaultConfig.fetch(vaultConfigPda);
    usdcMint = vc.usdcMint;

    // Fund vault balances for trader, keeper, insurance fund.
    const SEED = 10_000 * 1_000_000;
    for (const kp of [
      liquidatable_trader,
      bad_debt_trader,
      keeper,
      insuranceFundAuthority,
    ]) {
      const ata = await createAccount(provider.connection, kp, usdcMint, kp.publicKey);
      await mintTo(provider.connection, owner, usdcMint, ata, owner, SEED);
      await vault.methods
        .deposit(new anchor.BN(SEED))
        .accounts({
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          userUsdc: ata,
          accountBalance: balancePda(kp.publicKey),
          depositor: kp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();
    }

    // Authorize a fresh engine operator (used to open + price-update).
    await engine.methods
      .setOperator(engineOperatorKp.publicKey, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Authorize liquidator_authority PDA as engine operator.
    await engine.methods
      .setOperator(liquidatorAuthorityPda, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(liquidatorAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Reset mark price to $50K (02_perp_engine left it at $45K via close).
    await engine.methods
      .updateMarkPrice(
        new anchor.BN(50_000 * 1_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
      })
      .signers([engineOperatorKp])
      .rpc();

    // Open SHORT position for liquidatable_trader at $50K (with vault wiring).
    await engine.methods
      .openPosition(
        new anchor.BN(-1 * 100_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        position: positionPda(liquidatable_trader.publicKey),
        trader: liquidatable_trader.publicKey,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(liquidatable_trader.publicKey))
      .signers([engineOperatorKp])
      .rpc();
  });

  it("initializes liquidator config", async () => {
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        perpEngine: engine.programId,
        insuranceFund: insuranceFundAuthority.publicKey,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.liquidatorConfig.fetch(configPda);
    assert.equal(cfg.totalLiquidations.toNumber(), 0);
    assert.isFalse(cfg.paused);
  });

  it("rejects liquidate when position is healthy ($50K mark, $50K entry)", async () => {
    let threw = false;
    try {
      await program.methods
        .liquidate(Array.from(marketIdBtc))
        .accounts({
          config: configPda,
          keeperStats: keeperStatsPda(keeper.publicKey),
          liquidatorAuthority: liquidatorAuthorityPda,
          keeper: keeper.publicKey,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          enginePosition: positionPda(liquidatable_trader.publicKey),
          engineOperatorAccount: engineOperatorPda(liquidatorAuthorityPda),
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(liquidateRA())
        .signers([keeper])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PositionNotLiquidatable|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected reject for healthy position");
  });

  it("liquidates SHORT (solvent path) — keeper credited + insurance credited", async () => {
    // Update mark to $52K — short trader's PnL = -$2K, equity = $500,
    // maintenance = $52K * 2.5% = $1,300 → liquidatable.
    // notional at liquidation = $52K * 1 BTC = $52,000
    // remaining margin after pnl = 2500 - 2000 = $500
    // keeper_reward = min(remaining/2, notional * 5%) = min($250, $2600) = $250
    // insurance_payout = $500 - $250 = $250
    await engine.methods
      .updateMarkPrice(
        new anchor.BN(52_000 * 1_000_000),
        new anchor.BN(52_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
      })
      .signers([engineOperatorKp])
      .rpc();

    const keeperBalBefore = (await vault.account.accountBalance.fetch(balancePda(keeper.publicKey))).balance.toNumber();
    const insuranceBalBefore = (await vault.account.accountBalance.fetch(balancePda(insuranceFundAuthority.publicKey))).balance.toNumber();
    const poolBalBefore = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();

    await program.methods
      .liquidate(Array.from(marketIdBtc))
      .accounts({
        config: configPda,
        keeperStats: keeperStatsPda(keeper.publicKey),
        liquidatorAuthority: liquidatorAuthorityPda,
        keeper: keeper.publicKey,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        enginePosition: positionPda(liquidatable_trader.publicKey),
        engineOperatorAccount: engineOperatorPda(liquidatorAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(liquidateRA())
      .signers([keeper])
      .rpc();

    // Verify position closed in engine.
    const pos = await engine.account.position.fetch(
      positionPda(liquidatable_trader.publicKey),
    );
    assert.equal(pos.size.toNumber(), 0, "position size should be 0 after liquidation");
    assert.equal(pos.margin.toNumber(), 0);

    // Verify vault deltas: keeper +$250, insurance +$250, pool -$500.
    const keeperBalAfter = (await vault.account.accountBalance.fetch(balancePda(keeper.publicKey))).balance.toNumber();
    const insuranceBalAfter = (await vault.account.accountBalance.fetch(balancePda(insuranceFundAuthority.publicKey))).balance.toNumber();
    const poolBalAfter = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();
    assert.equal(keeperBalAfter - keeperBalBefore, 250_000_000, "keeper +$250");
    assert.equal(insuranceBalAfter - insuranceBalBefore, 250_000_000, "insurance +$250");
    assert.equal(poolBalBefore - poolBalAfter, 500_000_000, "pool -$500");

    // Verify liquidator stats.
    const cfg = await program.account.liquidatorConfig.fetch(configPda);
    assert.equal(cfg.totalLiquidations.toNumber(), 1);

    const stats = await program.account.keeperStats.fetch(
      keeperStatsPda(keeper.publicKey),
    );
    assert.equal(stats.liquidations.toNumber(), 1);
    assert.equal(stats.keeper.toBase58(), keeper.publicKey.toBase58());
  });

  it("liquidates LONG (bad-debt path) — keeper credited from insurance, BadDebt event", async () => {
    // Reset mark to $50K so we can open a fresh LONG.
    await engine.methods
      .updateMarkPrice(
        new anchor.BN(50_000 * 1_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
      })
      .signers([engineOperatorKp])
      .rpc();

    // Open LONG 1 BTC at $50K. margin = $2,500.
    await engine.methods
      .openPosition(
        new anchor.BN(1 * 100_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        position: positionPda(bad_debt_trader.publicKey),
        trader: bad_debt_trader.publicKey,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(bad_debt_trader.publicKey))
      .signers([engineOperatorKp])
      .rpc();

    // Drop mark to $45K — long PnL = -$5K, equity = -$2,500 (bad debt).
    // keeper reward = notional * 5bps = $45K * 0.05% = $22.50
    // BadDebt event: amount = $2,500 absorbed by insurance.
    await engine.methods
      .updateMarkPrice(
        new anchor.BN(45_000 * 1_000_000),
        new anchor.BN(45_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
      })
      .signers([engineOperatorKp])
      .rpc();

    let badDebtEvent: any = null;
    const listener = engine.addEventListener("badDebt", (ev: any) => {
      badDebtEvent = ev;
    });

    const keeperBalBefore = (await vault.account.accountBalance.fetch(balancePda(keeper.publicKey))).balance.toNumber();
    const insuranceBalBefore = (await vault.account.accountBalance.fetch(balancePda(insuranceFundAuthority.publicKey))).balance.toNumber();

    await program.methods
      .liquidate(Array.from(marketIdBtc))
      .accounts({
        config: configPda,
        keeperStats: keeperStatsPda(keeper.publicKey),
        liquidatorAuthority: liquidatorAuthorityPda,
        keeper: keeper.publicKey,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        enginePosition: positionPda(bad_debt_trader.publicKey),
        engineOperatorAccount: engineOperatorPda(liquidatorAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(liquidateRA())
      .signers([keeper])
      .rpc();

    await new Promise((r) => setTimeout(r, 1500));
    await engine.removeEventListener(listener);

    // Verify keeper +$22.50, insurance -$22.50.
    const keeperBalAfter = (await vault.account.accountBalance.fetch(balancePda(keeper.publicKey))).balance.toNumber();
    const insuranceBalAfter = (await vault.account.accountBalance.fetch(balancePda(insuranceFundAuthority.publicKey))).balance.toNumber();
    assert.equal(keeperBalAfter - keeperBalBefore, 22_500_000, "keeper +$22.50");
    assert.equal(insuranceBalBefore - insuranceBalAfter, 22_500_000, "insurance -$22.50");

    assert.isNotNull(badDebtEvent, "BadDebt event should have fired");
    assert.equal(badDebtEvent.amount.toString(), "2500000000", "bad debt = $2,500");
    assert.isTrue(badDebtEvent.viaLiquidation, "via_liquidation=true");

    const cfg = await program.account.liquidatorConfig.fetch(configPda);
    assert.equal(cfg.totalLiquidations.toNumber(), 2);
  });

  it("rejects liquidate when paused", async () => {
    await program.methods
      .pause()
      .accounts({
        config: configPda,
        owner: owner.publicKey,
      })
      .rpc();

    let threw = false;
    try {
      await program.methods
        .liquidate(Array.from(marketIdBtc))
        .accounts({
          config: configPda,
          keeperStats: keeperStatsPda(keeper.publicKey),
          liquidatorAuthority: liquidatorAuthorityPda,
          keeper: keeper.publicKey,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          enginePosition: positionPda(liquidatable_trader.publicKey),
          engineOperatorAccount: engineOperatorPda(liquidatorAuthorityPda),
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(liquidateRA())
        .signers([keeper])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PausedError|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);

    await program.methods
      .unpause()
      .accounts({
        config: configPda,
        owner: owner.publicKey,
      })
      .rpc();
  });
});
