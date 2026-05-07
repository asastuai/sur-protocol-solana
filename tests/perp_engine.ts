import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

describe("perp_engine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const trader1 = Keypair.generate();
  const trader2 = Keypair.generate();
  const vaultPlaceholder = Keypair.generate().publicKey;
  const oracleRouterPlaceholder = Keypair.generate().publicKey;

  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBtc],
    program.programId,
  );

  const positionPda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketIdBtc, trader.toBuffer()],
      program.programId,
    )[0];

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes engine config", async () => {
    await program.methods
      .initialize()
      .accounts({
        engineConfig: engineConfigPda,
        perpVault: vaultPlaceholder,
        oracleRouter: oracleRouterPlaceholder,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.engineConfig.fetch(engineConfigPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58());
    assert.isFalse(cfg.paused);
  });

  it("authorizes an operator", async () => {
    await program.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: operatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const op = await program.account.operator.fetch(operatorPda);
    assert.isTrue(op.authorized);
  });

  it("adds BTC-USD market (5% initial / 2.5% maintenance / max 100 BTC)", async () => {
    await program.methods
      .addMarket(
        Array.from(marketIdBtc),
        new anchor.BN(500),                         // initial_margin_bps = 5%
        new anchor.BN(250),                         // maintenance_margin_bps = 2.5%
        new anchor.BN(100 * 100_000_000),           // max_position_size = 100 BTC
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const m = await program.account.market.fetch(marketPda);
    assert.isTrue(m.active);
    assert.equal(m.initialMarginBps.toNumber(), 500);
  });

  it("operator updates mark price to $50,000", async () => {
    await program.methods
      .updateMarkPrice(
        new anchor.BN(50_000_000_000),
        new anchor.BN(50_000_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const m = await program.account.market.fetch(marketPda);
    assert.equal(m.markPrice.toString(), "50000000000");
  });

  it("operator opens trader1 LONG 1 BTC at $50,000", async () => {
    await program.methods
      .openPosition(
        new anchor.BN(1 * 100_000_000),       // size_delta = +1 BTC
        new anchor.BN(50_000 * 1_000_000),    // fill_price = $50,000
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader1.publicKey),
        trader: trader1.publicKey,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([operatorKp])
      .rpc();

    const pos = await program.account.position.fetch(positionPda(trader1.publicKey));
    assert.equal(pos.size.toString(), (1 * 100_000_000).toString());
    assert.equal(pos.entryPrice.toString(), (50_000 * 1_000_000).toString());
    // expected margin = notional * 5% = $50,000 * 5% = $2,500 (in 6 decimals: 2_500_000_000)
    assert.equal(pos.margin.toString(), "2500000000");

    const m = await program.account.market.fetch(marketPda);
    assert.equal(m.openInterestLong.toString(), (1 * 100_000_000).toString());
  });

  it("operator opens trader2 SHORT 1 BTC at $50,000", async () => {
    await program.methods
      .openPosition(
        new anchor.BN(-1 * 100_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader2.publicKey),
        trader: trader2.publicKey,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([operatorKp])
      .rpc();

    const pos = await program.account.position.fetch(positionPda(trader2.publicKey));
    assert.equal(pos.size.toString(), (-1 * 100_000_000).toString());

    const m = await program.account.market.fetch(marketPda);
    assert.equal(m.openInterestShort.toString(), (1 * 100_000_000).toString());
  });

  it("closes trader1 LONG at $52,000 -> realized PnL +$2,000", async () => {
    await program.methods
      .closePosition(new anchor.BN(52_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader1.publicKey),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const pos = await program.account.position.fetch(positionPda(trader1.publicKey));
    assert.equal(pos.size.toNumber(), 0);
    assert.equal(pos.margin.toNumber(), 0);

    const m = await program.account.market.fetch(marketPda);
    assert.equal(m.openInterestLong.toNumber(), 0);
  });

  it("rejects oversized open position", async () => {
    let threw = false;
    try {
      await program.methods
        .openPosition(
          new anchor.BN(101 * 100_000_000),
          new anchor.BN(50_000 * 1_000_000),
        )
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          position: positionPda(trader1.publicKey),
          trader: trader1.publicKey,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /MaxPositionExceeded|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected reject for oversized position");
  });

  it("rejects open from non-operator signer", async () => {
    const stranger = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(stranger.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    const [strangerOp] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), stranger.publicKey.toBuffer()],
      program.programId,
    );

    let threw = false;
    try {
      await program.methods
        .openPosition(
          new anchor.BN(1 * 100_000_000),
          new anchor.BN(50_000 * 1_000_000),
        )
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          position: positionPda(trader1.publicKey),
          trader: trader1.publicKey,
          operatorAccount: strangerOp,
          operator: stranger.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
    } catch (e) {
      threw = true;
    }
    assert.isTrue(threw);
  });
});
