import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { A2aDarkpool } from "../target/types/a2a_darkpool";
import { PerpVault } from "../target/types/perp_vault";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// A2A Dark Pool — full integration test with manual invoke_signed CPIs
// ============================================================
// Depends on 01_perp_vault.ts (vault_config + USDC mint) and 02_perp_engine.ts
// (engine_config + BTC-USD market). Authorizes darkpool_authority PDA as
// operator on both, pre-funds it with SOL for position rent, deposits USDC
// for the 3 parties, then runs intent → response → settle and verifies
// positions + balances changed via the CPIs.

describe("a2a_darkpool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.A2aDarkpool as Program<A2aDarkpool>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;

  const owner = (provider.wallet as anchor.Wallet).payer;
  const intentCreator = Keypair.generate();
  const responder = Keypair.generate();
  const feeRecipient = Keypair.generate();

  // Darkpool PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const [darkpoolAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("darkpool_authority")],
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

  // Proof-of-context freshness sidecar PDA + a price operator the test uses to
  // push a fresh mark price (so the f_i gate has a recent last_price_update).
  const [freshnessConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("freshness_config")],
    program.programId,
  );
  const priceOperatorKp = Keypair.generate();
  const ctxCommitmentA = Array.from(Buffer.alloc(32, 0xa1)); // intent agent's context hash
  const ctxCommitmentB = Array.from(Buffer.alloc(32, 0xb2)); // responder's context hash

  // Vault PDAs
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    vault.programId,
  );
  const [usdcVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault")],
    vault.programId,
  );
  const balancePda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), trader.toBuffer()],
      vault.programId,
    )[0];
  const vaultOperatorPda = (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), operator.toBuffer()],
      vault.programId,
    )[0];

  // Engine PDAs
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

  let usdcMint: PublicKey;

  before(async () => {
    // Airdrop SOL to traders + fee_recipient + darkpool_authority.
    // darkpool_authority needs SOL because engine.open_position uses
    // init_if_needed with payer = operator, and the operator (=
    // darkpool_authority PDA) must hold lamports.
    for (const target of [
      intentCreator.publicKey,
      responder.publicKey,
      feeRecipient.publicKey,
      darkpoolAuthorityPda,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Pull canonical USDC mint from vault_config (set by 01_perp_vault).
    const vaultConfig = await vault.account.vaultConfig.fetch(vaultConfigPda);
    usdcMint = vaultConfig.usdcMint;

    // Authorize darkpool_authority on vault + engine.
    await vault.methods
      .setOperator(darkpoolAuthorityPda, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: vaultOperatorPda(darkpoolAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await engine.methods
      .setOperator(darkpoolAuthorityPda, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(darkpoolAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Provision USDC ATAs + mint USDC + deposit into vault for the 3 parties.
    // Each party needs enough USDC to cover margin lock ($2.5K @ 5% on $50K notional)
    // + fee ($15) per side after v0.3.1 wiring.
    const seed = 10_000 * 1_000_000; // $10,000 each (6 decimals)
    for (const kp of [intentCreator, responder, feeRecipient]) {
      const ata = await createAccount(
        provider.connection,
        kp,
        usdcMint,
        kp.publicKey,
      );
      await mintTo(
        provider.connection,
        owner,
        usdcMint,
        ata,
        owner,
        seed,
      );
      await vault.methods
        .deposit(new anchor.BN(seed))
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
  });

  it("initializes the dark pool config", async () => {
    await program.methods
      .initialize(
        new anchor.BN(3),                  // fee_bps = 0.03%
        new anchor.BN(10_000 * 1_000_000), // large_trade_threshold = $10K
        new anchor.BN(500),                // large_trade_min_reputation = 50%
        new anchor.BN(60),                 // min_intent_duration
        new anchor.BN(86400),              // max_intent_duration
        new anchor.BN(5),                  // response_cooldown
      )
      .accounts({
        config: configPda,
        owner: owner.publicKey,
        feeRecipient: feeRecipient.publicKey,
        perpEngine: engine.programId,
        perpVault: vault.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.darkPoolConfig.fetch(configPda);
    assert.equal(cfg.feeBps.toNumber(), 3);
    assert.isFalse(cfg.paused);
  });

  it("initializes freshness config + pushes a fresh mark price", async () => {
    // Proof-of-context f_i budget (sidecar PDA, leaves DarkPoolConfig untouched).
    await program.methods
      .initFreshnessConfig(new anchor.BN(60)) // 60s budget to start
      .accounts({
        config: configPda,
        freshnessConfig: freshnessConfigPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fc = await program.account.freshnessConfig.fetch(freshnessConfigPda);
    assert.equal(fc.maxSettlementPriceAge.toNumber(), 60);

    // Register a price operator on the engine + push a fresh mark price so the
    // BTC market's last_price_update is recent for the settle tests below.
    const sig = await provider.connection.requestAirdrop(
      priceOperatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    await engine.methods
      .setOperator(priceOperatorKp.publicKey, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(priceOperatorKp.publicKey),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await engine.methods
      .updateMarkPrice(new anchor.BN(50_000_000_000), new anchor.BN(50_000_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        operatorAccount: engineOperatorPda(priceOperatorKp.publicKey),
        operator: priceOperatorKp.publicKey,
      })
      .signers([priceOperatorKp])
      .rpc();
  });

  it("posts an intent (BUY 1 BTC at $49,800-$50,200)", async () => {
    const intentId = new anchor.BN(1);
    await program.methods
      .postIntent(
        Array.from(marketIdBtc),
        true,
        new anchor.BN(1 * 100_000_000),      // size = 1 BTC
        new anchor.BN(49_800 * 1_000_000),
        new anchor.BN(50_200 * 1_000_000),
        new anchor.BN(3600),
        ctxCommitmentA,                       // proof-of-context commitment
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
    assert.deepEqual(Array.from(intent.contextCommitment), ctxCommitmentA);
  });

  it("posts a response", async () => {
    const responseId = new anchor.BN(1);
    const intentId = new anchor.BN(1);

    await program.methods
      .postResponse(
        new anchor.BN(50_000 * 1_000_000),
        new anchor.BN(600),
        ctxCommitmentB,                       // proof-of-context commitment
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
    assert.deepEqual(Array.from(response.contextCommitment), ctxCommitmentB);
  });

  it("rejects settlement when the market price is stale (f_i gate)", async () => {
    const intentId = new anchor.BN(1);
    const responseId = new anchor.BN(1);

    // Tighten the freshness budget to 1s, then let the pushed price age past it.
    await program.methods
      .setMaxSettlementPriceAge(new anchor.BN(1))
      .accounts({
        config: configPda,
        freshnessConfig: freshnessConfigPda,
        owner: owner.publicKey,
      })
      .rpc();
    await new Promise((r) => setTimeout(r, 2500)); // price now > 1s old

    let threw = false;
    try {
      await program.methods
        .acceptAndSettle()
        .accounts({
          config: configPda,
          freshnessConfig: freshnessConfigPda,
          intent: intentPda(intentId),
          response: responsePda(responseId),
          intentCreatorReputation: reputationPda(intentCreator.publicKey),
          responderReputation: reputationPda(responder.publicKey),
          intentCreator: intentCreator.publicKey,
          darkpoolAuthority: darkpoolAuthorityPda,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          buyerPosition: positionPda(intentCreator.publicKey),
          sellerPosition: positionPda(responder.publicKey),
          buyerTrader: intentCreator.publicKey,
          sellerTrader: responder.publicKey,
          engineOperatorAccount: engineOperatorPda(darkpoolAuthorityPda),
          engineAuthority: engineAuthorityPda,
          engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
          enginePoolBalance: balancePda(engineAuthorityPda),
          perpVaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(darkpoolAuthorityPda),
          buyerBalance: balancePda(intentCreator.publicKey),
          sellerBalance: balancePda(responder.publicKey),
          feeRecipientBalance: balancePda(feeRecipient.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .signers([intentCreator])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(JSON.stringify(e), "StalePrice", "must reject with StalePrice");
    }
    assert.isTrue(threw, "stale price must block settlement");

    // CEI: the failed settle ran before status flips, so the intent is still Open.
    const intent = await program.account.intent.fetch(intentPda(intentId));
    assert.deepEqual(intent.status, { open: {} });
  });

  it("settles via CPI: opens positions in engine + moves fee in vault", async () => {
    const intentId = new anchor.BN(1);
    const responseId = new anchor.BN(1);

    // Restore a generous freshness budget so the (slightly aged) price clears.
    await program.methods
      .setMaxSettlementPriceAge(new anchor.BN(86_400))
      .accounts({
        config: configPda,
        freshnessConfig: freshnessConfigPda,
        owner: owner.publicKey,
      })
      .rpc();

    const buyerBalanceBefore = (await vault.account.accountBalance.fetch(
      balancePda(intentCreator.publicKey),
    )).balance.toNumber();
    const sellerBalanceBefore = (await vault.account.accountBalance.fetch(
      balancePda(responder.publicKey),
    )).balance.toNumber();
    const feeRecipientBefore = (await vault.account.accountBalance.fetch(
      balancePda(feeRecipient.publicKey),
    )).balance.toNumber();

    const buyerPoolBefore = (await vault.account.accountBalance.fetch(
      balancePda(engineAuthorityPda),
    )).balance.toNumber();

    await program.methods
      .acceptAndSettle()
      .accounts({
        config: configPda,
        freshnessConfig: freshnessConfigPda,
        intent: intentPda(intentId),
        response: responsePda(responseId),
        intentCreatorReputation: reputationPda(intentCreator.publicKey),
        responderReputation: reputationPda(responder.publicKey),
        intentCreator: intentCreator.publicKey,
        darkpoolAuthority: darkpoolAuthorityPda,
        // engine
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        buyerPosition: positionPda(intentCreator.publicKey),
        sellerPosition: positionPda(responder.publicKey),
        buyerTrader: intentCreator.publicKey,
        sellerTrader: responder.publicKey,
        engineOperatorAccount: engineOperatorPda(darkpoolAuthorityPda),
        // engine_authority + its vault wiring (v0.3.1)
        engineAuthority: engineAuthorityPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        // vault
        perpVaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        vaultOperatorAccount: vaultOperatorPda(darkpoolAuthorityPda),
        buyerBalance: balancePda(intentCreator.publicKey),
        sellerBalance: balancePda(responder.publicKey),
        feeRecipientBalance: balancePda(feeRecipient.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([intentCreator])
      .rpc();

    // Intent + response status flipped
    const intent = await program.account.intent.fetch(intentPda(intentId));
    assert.deepEqual(intent.status, { filled: {} });
    const response = await program.account.response.fetch(responsePda(responseId));
    assert.deepEqual(response.status, { accepted: {} });

    // Positions opened in engine via CPI
    const buyerPos = await engine.account.position.fetch(positionPda(intentCreator.publicKey));
    assert.equal(buyerPos.size.toString(), (1 * 100_000_000).toString(),
      "buyer should hold +1 BTC long");
    assert.equal(buyerPos.entryPrice.toString(), (50_000 * 1_000_000).toString());

    const sellerPos = await engine.account.position.fetch(positionPda(responder.publicKey));
    assert.equal(sellerPos.size.toString(), (-1 * 100_000_000).toString(),
      "seller should hold -1 BTC short");

    // Fee moved in vault: notional 1 BTC * $50K = $50K -> fee = 50K * 3 / 10000 = $15
    // Margin lock (v0.3.1): notional $50K * 5% (initial_margin_bps=500) = $2500 per side.
    const expectedFee = 15_000_000;       // $15 in 6-decimal USDC
    const expectedMargin = 2_500_000_000; // $2500
    const buyerBalanceAfter = (await vault.account.accountBalance.fetch(
      balancePda(intentCreator.publicKey),
    )).balance.toNumber();
    const sellerBalanceAfter = (await vault.account.accountBalance.fetch(
      balancePda(responder.publicKey),
    )).balance.toNumber();
    const feeRecipientAfter = (await vault.account.accountBalance.fetch(
      balancePda(feeRecipient.publicKey),
    )).balance.toNumber();
    const buyerPoolAfter = (await vault.account.accountBalance.fetch(
      balancePda(engineAuthorityPda),
    )).balance.toNumber();

    assert.equal(buyerBalanceAfter, buyerBalanceBefore - expectedFee - expectedMargin,
      "buyer balance debited by fee + margin");
    assert.equal(sellerBalanceAfter, sellerBalanceBefore - expectedFee - expectedMargin,
      "seller balance debited by fee + margin");
    assert.equal(feeRecipientAfter, feeRecipientBefore + 2 * expectedFee,
      "fee recipient credited 2x fee");
    assert.equal(buyerPoolAfter - buyerPoolBefore, 2 * expectedMargin,
      "engine pool credited margin from both sides");

    // Reputation incremented for both
    const creatorRep = await program.account.agentReputation.fetch(
      reputationPda(intentCreator.publicKey),
    );
    assert.equal(creatorRep.completedTrades.toNumber(), 1);
  });
});
