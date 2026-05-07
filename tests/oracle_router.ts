import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OracleRouter } from "../target/types/oracle_router";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// oracle_router — happy-path + circuit-breaker integration tests
// ============================================================

describe("oracle_router", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OracleRouter as Program<OracleRouter>;
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

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  const [feedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feed"), marketIdBtc],
    program.programId,
  );

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes the oracle config", async () => {
    await program.methods
      .initialize(
        new anchor.BN(180),    // cooldown_secs
        new anchor.BN(1000),   // max_price_change_bps = 10%
        new anchor.BN(3),      // required_good_prices_for_reset
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

  it("authorizes an operator", async () => {
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
        new anchor.BN(60),     // max_staleness 60s
        new anchor.BN(500),    // max_deviation 5%
        new anchor.BN(200),    // max_confidence 2%
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
    assert.equal(feed.maxStalenessSeconds.toNumber(), 60);
  });

  it("pushes initial price ($50,000)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .pushPrice(
        new anchor.BN(50_000_000_000), // mark_price
        new anchor.BN(50_000_000_000), // index_price
        0,                              // source = Pyth
        new anchor.BN(now),             // publish_timestamp
        new anchor.BN(50),              // confidence_bps = 0.5%
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const feed = await program.account.feedConfig.fetch(feedPda);
    assert.equal(feed.lastPrice.toString(), "50000000000");
  });

  it("pushes price within max change ($51,000 = 2%)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .pushPrice(
        new anchor.BN(51_000_000_000),
        new anchor.BN(51_000_000_000),
        0,
        new anchor.BN(now),
        new anchor.BN(50),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const feed = await program.account.feedConfig.fetch(feedPda);
    assert.equal(feed.lastPrice.toString(), "51000000000");
  });

  it("triggers circuit breaker on >10% price move", async () => {
    const now = Math.floor(Date.now() / 1000);
    // 51000 -> 60000 = ~16% change, exceeds max_price_change_bps=1000 (10%)
    await program.methods
      .pushPrice(
        new anchor.BN(60_000_000_000),
        new anchor.BN(60_000_000_000),
        0,
        new anchor.BN(now),
        new anchor.BN(50),
      )
      .accounts({
        oracleConfig: oracleConfigPda,
        feed: feedPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.oracleConfig.fetch(oracleConfigPda);
    assert.isTrue(cfg.circuitBreakerActive);

    // Last price should NOT have updated (CB triggered before push)
    const feed = await program.account.feedConfig.fetch(feedPda);
    assert.equal(
      feed.lastPrice.toString(),
      "51000000000",
      "last_price should not advance when CB triggers",
    );
  });

  it("rejects price push from non-operator", async () => {
    const stranger = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      stranger.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    const [strangerOpPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), stranger.publicKey.toBuffer()],
      program.programId,
    );

    let threw = false;
    try {
      const now = Math.floor(Date.now() / 1000);
      await program.methods
        .pushPrice(
          new anchor.BN(51_500_000_000),
          new anchor.BN(51_500_000_000),
          0,
          new anchor.BN(now),
          new anchor.BN(50),
        )
        .accounts({
          oracleConfig: oracleConfigPda,
          feed: feedPda,
          operatorAccount: strangerOpPda,
          operator: stranger.publicKey,
        })
        .signers([stranger])
        .rpc();
    } catch (e) {
      threw = true;
    }
    assert.isTrue(threw, "expected reject for non-operator");
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

  it("rejects stale price (publish_timestamp older than max)", async () => {
    const old = Math.floor(Date.now() / 1000) - 120; // 120s old, max=60
    let threw = false;
    try {
      await program.methods
        .pushPrice(
          new anchor.BN(51_500_000_000),
          new anchor.BN(51_500_000_000),
          0,
          new anchor.BN(old),
          new anchor.BN(50),
        )
        .accounts({
          oracleConfig: oracleConfigPda,
          feed: feedPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PriceStale|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected reject for stale price");
  });
});
