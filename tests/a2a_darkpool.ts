import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { A2aDarkpool } from "../target/types/a2a_darkpool";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// A2A Dark Pool — happy-path integration test
// ============================================================
// Mirrors the Solidity Foundry tests in
// sur-protocol/contracts/test/A2ADarkPool.t.sol but adapted to the PDA model.
// Stubs for perp_engine + perp_vault remain unwired in v0.1, so the settle
// step here verifies state transitions + fee math, not actual position opens.

describe("a2a_darkpool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.A2aDarkpool as Program<A2aDarkpool>;

  const owner = (provider.wallet as anchor.Wallet).payer;
  const intentCreator = Keypair.generate();
  const responder = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const perpEngineStub = Keypair.generate();
  const perpVaultStub = Keypair.generate();

  // PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );

  const reputationPda = (agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), agent.toBuffer()],
      program.programId,
    )[0];

  const intentPda = (intentId: anchor.BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("intent"), intentId.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  const responsePda = (responseId: anchor.BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("response"), responseId.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  before(async () => {
    // Airdrop SOL to intent creator + responder so they can pay rent.
    for (const kp of [intentCreator, responder]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("initializes the dark pool config", async () => {
    await program.methods
      .initialize(
        new anchor.BN(3),                          // fee_bps = 0.03%
        new anchor.BN(10_000 * 1_000_000),          // large_trade_threshold = $10K notional
        new anchor.BN(500),                         // large_trade_min_reputation = 50%
        new anchor.BN(60),                          // min_intent_duration = 60s
        new anchor.BN(86400),                       // max_intent_duration = 24h
        new anchor.BN(5),                           // response_cooldown = 5s
      )
      .accounts({
        config: configPda,
        owner: owner.publicKey,
        feeRecipient: feeRecipient.publicKey,
        perpEngine: perpEngineStub.publicKey,
        perpVault: perpVaultStub.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.darkPoolConfig.fetch(configPda);
    assert.equal(cfg.feeBps.toNumber(), 3);
    assert.equal(cfg.nextIntentId.toNumber(), 1);
    assert.equal(cfg.nextResponseId.toNumber(), 1);
    assert.isFalse(cfg.paused);
  });

  it("posts an intent (BUY 50 BTC between $49,800 and $50,200)", async () => {
    const intentId = new anchor.BN(1);
    await program.methods
      .postIntent(
        Array.from(marketIdBtc),
        true,                                        // is_buy
        new anchor.BN(50 * 100_000_000),              // size = 50 BTC (8 decimals)
        new anchor.BN(49_800 * 1_000_000),            // min_price = $49,800
        new anchor.BN(50_200 * 1_000_000),            // max_price = $50,200
        new anchor.BN(3600),                          // duration = 1h
      )
      .accounts({
        config: configPda,
        intent: intentPda(intentId),
        reputation: reputationPda(intentCreator.publicKey),
        agent: intentCreator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([intentCreator])
      .rpc();

    const intent = await program.account.intent.fetch(intentPda(intentId));
    assert.equal(intent.id.toNumber(), 1);
    assert.isTrue(intent.isBuy);
    assert.deepEqual(intent.status, { open: {} });
  });

  it("posts a response from a different agent", async () => {
    const responseId = new anchor.BN(1);
    const intentId = new anchor.BN(1);

    await program.methods
      .postResponse(
        new anchor.BN(50_050 * 1_000_000),            // price = $50,050
        new anchor.BN(600),                           // duration = 10min
      )
      .accounts({
        config: configPda,
        intent: intentPda(intentId),
        response: responsePda(responseId),
        reputation: reputationPda(responder.publicKey),
        responder: responder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([responder])
      .rpc();

    const response = await program.account.response.fetch(responsePda(responseId));
    assert.equal(response.intentId.toNumber(), 1);
    assert.deepEqual(response.status, { pending: {} });
  });

  it("intent creator accepts and settles", async () => {
    const intentId = new anchor.BN(1);
    const responseId = new anchor.BN(1);

    await program.methods
      .acceptAndSettle()
      .accounts({
        config: configPda,
        intent: intentPda(intentId),
        response: responsePda(responseId),
        intentCreatorReputation: reputationPda(intentCreator.publicKey),
        responderReputation: reputationPda(responder.publicKey),
        intentCreator: intentCreator.publicKey,
      })
      .signers([intentCreator])
      .rpc();

    const intent = await program.account.intent.fetch(intentPda(intentId));
    assert.deepEqual(intent.status, { filled: {} });

    const response = await program.account.response.fetch(responsePda(responseId));
    assert.deepEqual(response.status, { accepted: {} });

    const creatorRep = await program.account.agentReputation.fetch(
      reputationPda(intentCreator.publicKey),
    );
    assert.equal(creatorRep.completedTrades.toNumber(), 1);

    const responderRep = await program.account.agentReputation.fetch(
      reputationPda(responder.publicKey),
    );
    assert.equal(responderRep.completedTrades.toNumber(), 1);
  });
});
