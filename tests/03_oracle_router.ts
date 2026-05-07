import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OracleRouter } from "../target/types/oracle_router";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// oracle_router — happy-path + circuit-breaker + CPI to perp_engine
// ============================================================
// Depends on 02_perp_engine.ts having initialized engine_config and added
// the BTC-USD market. Authorizes oracle_authority PDA as operator on
// perp_engine, then exercises push_price end-to-end (oracle-side validation
// + CPI that mutates engine.market.mark_price).

describe("oracle_router", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OracleRouter as Program<OracleRouter>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();

  const [oracleConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_config")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );
  const [oracleAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_authority")],
    program.programId,
  );

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  const [feedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feed"), marketIdBtc],
    program.programId,
  );

  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    engine.programId,
  );
  const [engineMarketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBtc],
    engine.programId,
  );
  const [engineOracleAuthorityOp] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), oracleAuthorityPda.toBuffer()],
    engine.programId,
  );

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    await engine.methods
      .setOperator(oracleAuthorityPda, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOracleAuthorityOp,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("initializes the oracle config", async () => {
    await program.methods
      .initialize(
        new anchor.BN(180),
        new anchor.BN(1000),
        new anchor.BN(3),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
    assert.equal(cfg.maxPriceChangeBps.toNumber(), 1000);
    assert.isFalse(cfg.circuitBreakerActive);
  });

  it("authorizes the oracle's keeper operator", async () => {
    await program.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        oracleConfig: oracleConfigPda,
        operatorAccount: operatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const op = await program.account.operator.fetch(operatorPda);
    assert.isTrue(op.authorized);
  });

  it("configures BTC-USD feed", async () => {
    const pythFeedPlaceholder = Keypair.generate().publicKey;
    await program.methods
      .configureFeed(
        Array.from(marketIdBtc),
        pythFeedPlaceholder,
        new anchor.BN(60),
        new anchor.BN(500),
        new anchor.BN(200),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const feed = await program.account.feedConfig.fetch(feedPda);
    assert.isTrue(feed.active);
  });

  it("pushes price -> CPI updates engine.market.mark_price", async () => {
    const slot = await provider.connection.getSlot();
    const ts = (await provider.connection.getBlockTime(slot)) || Math.floor(Date.now() / 1000);

    await program.methods
      .pushPrice(
        new anchor.BN(50_000_000_000),
        new anchor.BN(50_000_000_000),
        0,
        new anchor.BN(ts - 1),
        new anchor.BN(50),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        oracleAuthority: oracleAuthorityPda,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        engineOperatorAccount: engineOracleAuthorityOp,
      })
      .signers([operatorKp])
      .rpc();

    const feed = await program.account.feedConfig.fetch(feedPda);
    assert.equal(feed.lastPrice.toString(), "50000000000");

    const market = await engine.account.market.fetch(engineMarketPda);
    assert.equal(market.markPrice.toString(), "50000000000",
      "engine mark_price should reflect oracle CPI");
  });

  it("pushes price within max change ($51,000 = 2%) -> engine reflects update", async () => {
    const slot = await provider.connection.getSlot();
    const ts = (await provider.connection.getBlockTime(slot)) || Math.floor(Date.now() / 1000);

    await program.methods
      .pushPrice(
        new anchor.BN(51_000_000_000),
        new anchor.BN(51_000_000_000),
        0,
        new anchor.BN(ts - 1),
        new anchor.BN(50),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        oracleAuthority: oracleAuthorityPda,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        engineOperatorAccount: engineOracleAuthorityOp,
      })
      .signers([operatorKp])
      .rpc();

    const market = await engine.account.market.fetch(engineMarketPda);
    assert.equal(market.markPrice.toString(), "51000000000");
  });

  it("triggers circuit breaker on >10% move; engine NOT updated", async () => {
    const slot = await provider.connection.getSlot();
    const ts = (await provider.connection.getBlockTime(slot)) || Math.floor(Date.now() / 1000);

    const beforeMark = (await engine.account.market.fetch(engineMarketPda)).markPrice.toString();

    await program.methods
      .pushPrice(
        new anchor.BN(60_000_000_000),
        new anchor.BN(60_000_000_000),
        0,
        new anchor.BN(ts - 1),
        new anchor.BN(50),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        oracleAuthority: oracleAuthorityPda,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        engineOperatorAccount: engineOracleAuthorityOp,
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
    assert.isTrue(cfg.circuitBreakerActive);

    const market = await engine.account.market.fetch(engineMarketPda);
    assert.equal(market.markPrice.toString(), beforeMark,
      "engine mark_price should NOT advance when CB triggers");
  });

  it("admin resets circuit breaker", async () => {
    await program.methods
      .resetCircuitBreaker()
      .accounts({
        oracleConfig: oracleConfigPda,
        owner: owner.publicKey,
      })
      .rpc();
    const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
    assert.isFalse(cfg.circuitBreakerActive);
  });
});
