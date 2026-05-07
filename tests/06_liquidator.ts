import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Liquidator } from "../target/types/liquidator";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// liquidator — permissionless liquidation via CPI to perp_engine
// ============================================================
// Depends on 02_perp_engine.ts having opened a SHORT position for trader2
// at $50,000. We'll move mark price up to $52,000 (short loses), making
// the position liquidatable, then call liquidator.liquidate() permissionlessly.

describe("liquidator", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Liquidator as Program<Liquidator>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;

  const owner = (provider.wallet as anchor.Wallet).payer;
  const keeper = Keypair.generate();
  const insuranceFundPlaceholder = Keypair.generate().publicKey;

  // Re-register owner as a fresh engine operator so we can move mark price.
  const engineOperatorKp = Keypair.generate();

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

  // We need a trader who has an OPEN SHORT position. 02_perp_engine left
  // trader2 with -1 BTC @ $50K. But trader2's keypair is local to that test.
  // Instead, we open a FRESH position here for liquidation purposes.
  const liquidatable_trader = Keypair.generate();

  before(async () => {
    for (const target of [
      keeper.publicKey,
      engineOperatorKp.publicKey,
      liquidatable_trader.publicKey,
      liquidatorAuthorityPda,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Authorize a fresh engine operator (we'll use it to open + price-update).
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

    // Open a SHORT position for liquidatable_trader at $50,000.
    await engine.methods
      .openPosition(
        new anchor.BN(-1 * 100_000_000),     // -1 BTC short
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
      .signers([engineOperatorKp])
      .rpc();
  });

  it("initializes liquidator config", async () => {
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        perpEngine: engine.programId,
        insuranceFund: insuranceFundPlaceholder,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.liquidatorConfig.fetch(configPda);
    assert.equal(cfg.totalLiquidations.toNumber(), 0);
    assert.isFalse(cfg.paused);
  });

  it("rejects liquidate when position is healthy ($50K mark, $50K entry)", async () => {
    // mark_price was set to $50,000 in 02_perp_engine. Position equity == margin.
    // With margin = $2,500 and maintenance = $1,250 ($50K * 2.5%), position
    // is healthy (NOT liquidatable). Engine should reject.
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
        .signers([keeper])
        .rpc();
    } catch (e: any) {
      threw = true;
      // Engine returns PositionNotLiquidatable; bubbles up to caller.
      assert.match(e.toString(), /PositionNotLiquidatable|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected reject for healthy position");
  });

  it("liquidates after mark moves against the SHORT (mark $50K -> $52K)", async () => {
    // Update mark price to $52K — short trader's PnL = -$2K, equity = $500,
    // maintenance = $52K * 2.5% = $1,300 → liquidatable.
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
      .signers([keeper])
      .rpc();

    // Verify position closed
    const pos = await engine.account.position.fetch(
      positionPda(liquidatable_trader.publicKey),
    );
    assert.equal(pos.size.toNumber(), 0, "position size should be 0 after liquidation");
    assert.equal(pos.margin.toNumber(), 0);

    // Verify liquidator stats
    const cfg = await program.account.liquidatorConfig.fetch(configPda);
    assert.equal(cfg.totalLiquidations.toNumber(), 1);

    const stats = await program.account.keeperStats.fetch(
      keeperStatsPda(keeper.publicKey),
    );
    assert.equal(stats.liquidations.toNumber(), 1);
    assert.equal(stats.keeper.toBase58(), keeper.publicKey.toBase58());
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
