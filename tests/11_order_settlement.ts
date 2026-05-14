import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrderSettlement } from "../target/types/order_settlement";
import { PerpVault } from "../target/types/perp_vault";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
  Ed25519Program,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { createHash } from "crypto";
import nacl from "tweetnacl";

// ============================================================
// order_settlement integration test
// ============================================================
//
// Verifies the off-chain matcher → on-chain executor bridge:
//   - initialize / set_fees / add operator
//   - happy-path settle_one with two ed25519-signed orders
//   - replay protection (nonce reuse)
//   - expired order, future-signed order
//   - self-trade, sides not opposite
//   - paused, non-operator
//   - batch counter increments across multiple settlements
//   - commit-reveal with min_settlement_delay (Mapping 3 prospective semantics)

const PRICE_PRECISION = 1_000_000n;
const SIZE_PRECISION = 100_000_000n;
const CLUSTER_ID = 1n; // localnet

describe("order_settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OrderSettlement as Program<OrderSettlement>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const operator = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const enginePriceOperator = Keypair.generate();
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const otherTaker = Keypair.generate();

  // order_settlement PDAs
  const [osConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const [osAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("order_settlement_authority")],
    program.programId,
  );
  const osOperatorPda = (op: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), op.toBuffer()],
      program.programId,
    )[0];
  const noncePagePda = (trader: PublicKey, pageIndex: bigint) => {
    const idx = Buffer.alloc(8);
    idx.writeBigUInt64LE(pageIndex, 0);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("nonce_page"), trader.toBuffer(), idx],
      program.programId,
    )[0];
  };
  const commitPda = (hash: Buffer) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("commit"), hash],
      program.programId,
    )[0];

  // perp_vault PDAs
  const [perpVaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    vault.programId,
  );
  const [perpVaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
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
  const vaultOperatorPda = (op: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), op.toBuffer()],
      vault.programId,
    )[0];

  // perp_engine PDAs
  const marketId = Buffer.alloc(32);
  Buffer.from("OS-BTC-USD").copy(marketId);
  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    engine.programId,
  );
  const [engineAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_authority")],
    engine.programId,
  );
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId],
    engine.programId,
  );
  const positionPda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketId, trader.toBuffer()],
      engine.programId,
    )[0];
  const engineOperatorPda = (op: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), op.toBuffer()],
      engine.programId,
    )[0];

  let usdcMint: PublicKey;
  let domainSep: Buffer;
  let lookupTable: AddressLookupTableAccount;

  // ---- helpers ----
  function computeDomainSep(): Buffer {
    const h = createHash("sha256");
    h.update(Buffer.from("SUR_OrderSettlement_v1"));
    h.update(program.programId.toBuffer());
    const cid = Buffer.alloc(8);
    cid.writeBigUInt64LE(CLUSTER_ID, 0);
    h.update(cid);
    return h.digest();
  }

  function buildOrderMessage(o: {
    trader: PublicKey;
    marketId: Uint8Array;
    isLong: boolean;
    size: bigint;
    price: bigint;
    nonce: bigint;
    expiry: bigint;
    signedAt: bigint;
  }): Buffer {
    const out = Buffer.alloc(137);
    let off = 0;
    domainSep.copy(out, off);
    off += 32;
    out.set(o.trader.toBytes(), off);
    off += 32;
    out.set(o.marketId, off);
    off += 32;
    out.writeUInt8(o.isLong ? 1 : 0, off);
    off += 1;
    out.writeBigUInt64LE(o.size, off);
    off += 8;
    out.writeBigUInt64LE(o.price, off);
    off += 8;
    out.writeBigUInt64LE(o.nonce, off);
    off += 8;
    out.writeBigInt64LE(o.expiry, off);
    off += 8;
    out.writeBigInt64LE(o.signedAt, off);
    off += 8;
    return out;
  }

  function digest(o: any): Buffer {
    const m = buildOrderMessage(o);
    return createHash("sha256").update(m).digest();
  }

  function makeSigned(
    kp: Keypair,
    base: {
      isLong: boolean;
      size: bigint;
      price: bigint;
      nonce: bigint;
      expiry: bigint;
      signedAt?: bigint;
    },
  ) {
    const signedAt = base.signedAt ?? BigInt(Math.floor(Date.now() / 1000) - 5);
    const o = {
      trader: kp.publicKey,
      marketId: marketId,
      isLong: base.isLong,
      size: base.size,
      price: base.price,
      nonce: base.nonce,
      expiry: base.expiry,
      signedAt,
    };
    const msg = buildOrderMessage(o);
    const sig = nacl.sign.detached(msg, kp.secretKey);
    return {
      order: o,
      signature: Buffer.from(sig),
      message: msg,
    };
  }

  // Anchor expects camelCase field names for instruction-arg structs.
  function toIxOrder(s: { order: any; signature: Buffer }) {
    return {
      trader: s.order.trader,
      marketId: Array.from(s.order.marketId as Uint8Array),
      isLong: s.order.isLong,
      size: new anchor.BN(s.order.size.toString()),
      price: new anchor.BN(s.order.price.toString()),
      nonce: new anchor.BN(s.order.nonce.toString()),
      expiry: new anchor.BN(s.order.expiry.toString()),
      signedAt: new anchor.BN(s.order.signedAt.toString()),
    };
  }

  function ed25519Ix(s: { order: any; signature: Buffer; message: Buffer }) {
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: s.order.trader.toBytes(),
      message: s.message,
      signature: s.signature,
    });
  }

  before(async () => {
    for (const kp of [
      operator,
      feeRecipient,
      enginePriceOperator,
      maker,
      taker,
      otherTaker,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        3 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }
    // Pre-fund order_settlement authority for rent on init_if_needed CPIs.
    const sig = await provider.connection.requestAirdrop(
      osAuthorityPda,
      3 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    // perp_vault: reuse if exists, else init.
    let vc = await vault.account.vaultConfig.fetchNullable(perpVaultConfigPda);
    if (vc) {
      usdcMint = vc.usdcMint;
    } else {
      usdcMint = await createMint(
        provider.connection,
        owner,
        owner.publicKey,
        null,
        6,
      );
      await vault.methods
        .initialize(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          vaultConfig: perpVaultConfigPda,
          vaultAuthority: perpVaultAuthorityPda,
          usdcMint,
          usdcVault: usdcVaultPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    }

    // Provision USDC for maker, taker, otherTaker, fee_recipient and deposit.
    for (const kp of [maker, taker, otherTaker, feeRecipient]) {
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
        100_000_000_000, // $100k
      );
      await vault.methods
        .deposit(new anchor.BN(50_000_000_000)) // $50k
        .accounts({
          vaultConfig: perpVaultConfigPda,
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

    // perp_engine: init if needed.
    let ec = await engine.account.engineConfig.fetchNullable(engineConfigPda);
    if (!ec) {
      await engine.methods
        .initialize()
        .accounts({
          engineConfig: engineConfigPda,
          perpVault: vault.programId,
          oracleRouter: enginePriceOperator.publicKey,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    // Register price operator + add market if needed.
    const priceOp = await engine.account.operator.fetchNullable(
      engineOperatorPda(enginePriceOperator.publicKey),
    );
    if (!priceOp || !priceOp.authorized) {
      await engine.methods
        .setOperator(enginePriceOperator.publicKey, true)
        .accounts({
          engineConfig: engineConfigPda,
          operatorAccount: engineOperatorPda(enginePriceOperator.publicKey),
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    const m = await engine.account.market.fetchNullable(marketPda);
    if (!m) {
      await engine.methods
        .addMarket(
          Array.from(marketId),
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
      await engine.methods
        .updateMarkPrice(
          new anchor.BN(50_000_000_000),
          new anchor.BN(50_000_000_000),
        )
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          operatorAccount: engineOperatorPda(enginePriceOperator.publicKey),
          operator: enginePriceOperator.publicKey,
        })
        .signers([enginePriceOperator])
        .rpc();
    }
  });

  it("initializes the order_settlement config", async () => {
    await program.methods
      .initialize(new anchor.BN(CLUSTER_ID.toString()))
      .accounts({
        config: osConfigPda,
        authority: osAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineOperatorAccount: engineOperatorPda(osAuthorityPda),
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: vaultOperatorPda(osAuthorityPda),
        feeRecipient: feeRecipient.publicKey,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.orderSettlementConfig.fetch(osConfigPda);
    assert.equal(cfg.clusterId.toString(), CLUSTER_ID.toString());
    assert.equal(cfg.makerFeeBps, 2);
    assert.equal(cfg.takerFeeBps, 6);
    assert.isFalse(cfg.paused);

    domainSep = Buffer.from(cfg.domainSeparator);
    // Sanity: same as our local computation.
    const local = computeDomainSep();
    assert.deepEqual([...domainSep], [...local]);
  });

  it("registers order_settlement authority as operator on perp_vault and perp_engine", async () => {
    await vault.methods
      .setOperator(osAuthorityPda, true)
      .accounts({
        vaultConfig: perpVaultConfigPda,
        operatorAccount: vaultOperatorPda(osAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await engine.methods
      .setOperator(osAuthorityPda, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(osAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Build a lookup table holding the static accounts referenced by every
    // settle_one tx. Without it, the tx exceeds the 1232-byte legacy limit.
    const slot = await provider.connection.getSlot();
    const [createIx, lutAddr] = AddressLookupTableProgram.createLookupTable({
      authority: owner.publicKey,
      payer: owner.publicKey,
      recentSlot: slot - 1,
    });
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: owner.publicKey,
      authority: owner.publicKey,
      lookupTable: lutAddr,
      addresses: [
        osConfigPda,
        osAuthorityPda,
        engine.programId,
        engineConfigPda,
        marketPda,
        engineOperatorPda(osAuthorityPda),
        vault.programId,
        perpVaultConfigPda,
        vaultOperatorPda(osAuthorityPda),
        balancePda(feeRecipient.publicKey),
        SYSVAR_INSTRUCTIONS_PUBKEY,
        SystemProgram.programId,
        osOperatorPda(operator.publicKey),
        maker.publicKey,
        taker.publicKey,
        otherTaker.publicKey,
        balancePda(maker.publicKey),
        balancePda(taker.publicKey),
        balancePda(otherTaker.publicKey),
        positionPda(maker.publicKey),
        positionPda(taker.publicKey),
        positionPda(otherTaker.publicKey),
        noncePagePda(maker.publicKey, 0n),
        noncePagePda(taker.publicKey, 0n),
        noncePagePda(otherTaker.publicKey, 0n),
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthorityPda,
        vaultOperatorPda(engineAuthorityPda),
        balancePda(engineAuthorityPda),
      ],
    });
    const tx = new Transaction().add(createIx).add(extendIx);
    await provider.sendAndConfirm(tx, []);
    // Wait one slot so LUT is queryable.
    await new Promise((r) => setTimeout(r, 1500));
    const fetched = await provider.connection.getAddressLookupTable(lutAddr);
    if (!fetched.value) throw new Error("LUT not found");
    lookupTable = fetched.value;
  });

  it("adds the test operator and disables MEV delay (no-commit path)", async () => {
    await program.methods
      .setOperator(operator.publicKey, true)
      .accounts({
        config: osConfigPda,
        operatorAccount: osOperatorPda(operator.publicKey),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Disable commit-reveal delay for the immediate-settle tests.
    await program.methods
      .setSettlementDelay(new anchor.BN(0), new anchor.BN(300))
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();
  });

  // ---- helper to build a settle_one tx with the ed25519 ixs prepended ----
  async function buildAndSendSettleOne(
    makerSigned: { order: any; signature: Buffer; message: Buffer },
    takerSigned: { order: any; signature: Buffer; message: Buffer },
    executionPrice: bigint,
    executionSize: bigint,
    extra: { makerSnapshot?: PublicKey; takerSnapshot?: PublicKey } = {},
  ) {
    const trade = {
      maker: toIxOrder(makerSigned),
      taker: toIxOrder(takerSigned),
      executionPrice: new anchor.BN(executionPrice.toString()),
      executionSize: new anchor.BN(executionSize.toString()),
    };

    const ix = await program.methods
      .settleOne(trade as any)
      .accounts({
        config: osConfigPda,
        operatorAccount: osOperatorPda(operator.publicKey),
        authority: osAuthorityPda,
        makerNoncePage: noncePagePda(
          makerSigned.order.trader,
          makerSigned.order.nonce / 256n,
        ),
        takerNoncePage: noncePagePda(
          takerSigned.order.trader,
          takerSigned.order.nonce / 256n,
        ),
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: marketPda,
        makerPosition: positionPda(makerSigned.order.trader),
        takerPosition: positionPda(takerSigned.order.trader),
        makerTrader: makerSigned.order.trader,
        takerTrader: takerSigned.order.trader,
        engineOperatorAccount: engineOperatorPda(osAuthorityPda),
        // v0.3.1 wiring: engine_authority + its vault accounts (forwarded into engine.open_position)
        engineAuthority: engineAuthorityPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        perpVaultProgram: vault.programId,
        vaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: vaultOperatorPda(osAuthorityPda),
        makerBalance: balancePda(makerSigned.order.trader),
        takerBalance: balancePda(takerSigned.order.trader),
        feeRecipientBalance: balancePda(feeRecipient.publicKey),
        makerSnapshot: extra.makerSnapshot ?? osAuthorityPda,
        takerSnapshot: extra.takerSnapshot ?? osAuthorityPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        operator: operator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    const msg = new TransactionMessage({
      payerKey: operator.publicKey,
      recentBlockhash,
      instructions: [
        ed25519Ix(makerSigned),
        ed25519Ix(takerSigned),
        ix,
      ],
    }).compileToV0Message([lookupTable]);
    const vtx = new VersionedTransaction(msg);
    vtx.sign([operator]);
    const sig = await provider.connection.sendTransaction(vtx, {
      skipPreflight: false,
    });
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  it("happy-path: settles a matched trade with two ed25519 sigs", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const makerSigned = makeSigned(maker, {
      isLong: false, // maker short
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 1n,
      expiry: now + 600n,
    });
    const takerSigned = makeSigned(taker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 1n,
      expiry: now + 600n,
    });

    const makerBalBefore = (
      await vault.account.accountBalance.fetch(balancePda(maker.publicKey))
    ).balance.toNumber();
    const feeBefore = (
      await vault.account.accountBalance.fetch(
        balancePda(feeRecipient.publicKey),
      )
    ).balance.toNumber();

    await buildAndSendSettleOne(
      makerSigned,
      takerSigned,
      50_000n * PRICE_PRECISION,
      1n * SIZE_PRECISION,
    );

    // Positions exist
    const mPos = await engine.account.position.fetch(positionPda(maker.publicKey));
    const tPos = await engine.account.position.fetch(positionPda(taker.publicKey));
    assert.equal(mPos.size.toString(), (-100_000_000).toString());
    assert.equal(tPos.size.toString(), (100_000_000).toString());

    // Fees moved: notional = 50_000 * 1 = $50_000 (in 6dp = 50e9). maker_fee = 50e9 * 2/10000 = 10e6
    // Margin lock (v0.3.1): notional $50K * 5% (initial_margin_bps=500) = $2500 per side.
    const expectedMakerFee = 10_000_000;
    const expectedMargin = 2_500_000_000;
    const makerBalAfter = (
      await vault.account.accountBalance.fetch(balancePda(maker.publicKey))
    ).balance.toNumber();
    const feeAfter = (
      await vault.account.accountBalance.fetch(
        balancePda(feeRecipient.publicKey),
      )
    ).balance.toNumber();
    assert.equal(makerBalBefore - makerBalAfter, expectedMakerFee + expectedMargin,
      "maker balance debited by fee + margin");
    // taker fee = 30e6 (6 bps), no spread (50/50 OI from this single trade is balanced after, before is 0/0).
    assert.isAtLeast(feeAfter - feeBefore, expectedMakerFee + 30_000_000);

    const cfg = await program.account.orderSettlementConfig.fetch(osConfigPda);
    assert.equal(cfg.batchCounter.toString(), "1");
  });

  it("rejects nonce replay", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    // Reuse maker.nonce=1 (already used) — should fail at nonce check.
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 1n,
      expiry: now + 600n,
    });
    const t = makeSigned(otherTaker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 1n,
      expiry: now + 600n,
    });

    let threw = false;
    try {
      await buildAndSendSettleOne(
        m,
        t,
        50_000n * PRICE_PRECISION,
        1n * SIZE_PRECISION,
      );
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /NonceAlreadyUsed/);
    }
    assert.isTrue(threw, "replay must be rejected");
  });

  it("rejects expired order", async () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 1000);
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 2n,
      expiry: past, // already expired
    });
    const t = makeSigned(taker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 2n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 600),
    });

    let threw = false;
    try {
      await buildAndSendSettleOne(
        m,
        t,
        50_000n * PRICE_PRECISION,
        1n * SIZE_PRECISION,
      );
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /OrderExpired/);
    }
    assert.isTrue(threw);
  });

  it("rejects order signed in the future", async () => {
    const future = BigInt(Math.floor(Date.now() / 1000) + 10_000);
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 3n,
      expiry: future + 600n,
      signedAt: future,
    });
    const t = makeSigned(taker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 3n,
      expiry: future + 600n,
    });

    let threw = false;
    try {
      await buildAndSendSettleOne(
        m,
        t,
        50_000n * PRICE_PRECISION,
        1n * SIZE_PRECISION,
      );
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /OrderSignedInFuture|OrderTooOld/);
    }
    assert.isTrue(threw);
  });

  it("rejects self-trade (same trader both sides)", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 4n,
      expiry: now + 600n,
    });
    const t = makeSigned(maker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 5n,
      expiry: now + 600n,
    });
    let threw = false;
    try {
      await buildAndSendSettleOne(m, t, 50_000n * PRICE_PRECISION, 1n * SIZE_PRECISION);
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /SelfTrade/);
    }
    assert.isTrue(threw);
  });

  it("rejects sides not opposite", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const m = makeSigned(maker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 6n,
      expiry: now + 600n,
    });
    const t = makeSigned(otherTaker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 1n,
      expiry: now + 600n,
    });
    let threw = false;
    try {
      await buildAndSendSettleOne(m, t, 50_000n * PRICE_PRECISION, 1n * SIZE_PRECISION);
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /SidesNotOpposite/);
    }
    assert.isTrue(threw);
  });

  it("rejects when paused", async () => {
    await program.methods
      .pause()
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();

    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const m = makeSigned(maker, {
        isLong: false,
        size: 1n * SIZE_PRECISION,
        price: 50_000n * PRICE_PRECISION,
        nonce: 7n,
        expiry: now + 600n,
      });
      const t = makeSigned(taker, {
        isLong: true,
        size: 1n * SIZE_PRECISION,
        price: 50_000n * PRICE_PRECISION,
        nonce: 7n,
        expiry: now + 600n,
      });
      let threw = false;
      try {
        await buildAndSendSettleOne(m, t, 50_000n * PRICE_PRECISION, 1n * SIZE_PRECISION);
      } catch (e: any) {
        threw = true;
        assert.match(String(e), /PausedError|Paused/);
      }
      assert.isTrue(threw);
    } finally {
      await program.methods
        .unpause()
        .accounts({ config: osConfigPda, owner: owner.publicKey })
        .rpc();
    }
  });

  it("rejects non-operator", async () => {
    const intruder = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      intruder.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 8n,
      expiry: now + 600n,
    });
    const t = makeSigned(taker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 8n,
      expiry: now + 600n,
    });

    const trade = {
      maker: toIxOrder(m),
      taker: toIxOrder(t),
      executionPrice: new anchor.BN((50_000n * PRICE_PRECISION).toString()),
      executionSize: new anchor.BN((1n * SIZE_PRECISION).toString()),
    };

    let threw = false;
    try {
      const ix = await program.methods
        .settleOne(trade as any)
        .accounts({
          config: osConfigPda,
          operatorAccount: osOperatorPda(intruder.publicKey),
          authority: osAuthorityPda,
          makerNoncePage: noncePagePda(maker.publicKey, 0n),
          takerNoncePage: noncePagePda(taker.publicKey, 0n),
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: marketPda,
          makerPosition: positionPda(maker.publicKey),
          takerPosition: positionPda(taker.publicKey),
          makerTrader: maker.publicKey,
          takerTrader: taker.publicKey,
          engineOperatorAccount: engineOperatorPda(osAuthorityPda),
          perpVaultProgram: vault.programId,
          vaultConfig: perpVaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(osAuthorityPda),
          makerBalance: balancePda(maker.publicKey),
          takerBalance: balancePda(taker.publicKey),
          feeRecipientBalance: balancePda(feeRecipient.publicKey),
          makerSnapshot: osAuthorityPda,
          takerSnapshot: osAuthorityPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          operator: intruder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      const msg = new TransactionMessage({
        payerKey: intruder.publicKey,
        recentBlockhash,
        instructions: [
          ed25519Ix(m),
          ed25519Ix(t),
          ix,
        ],
      }).compileToV0Message([lookupTable]);
      const vtx = new VersionedTransaction(msg);
      vtx.sign([intruder]);
      const sig = await provider.connection.sendTransaction(vtx);
      await provider.connection.confirmTransaction(sig);
    } catch (e: any) {
      threw = true;
    }
    assert.isTrue(threw);
  });

  it("settles a second trade — batch counter advances", async () => {
    const before = (
      await program.account.orderSettlementConfig.fetch(osConfigPda)
    ).batchCounter.toNumber();

    const now = BigInt(Math.floor(Date.now() / 1000));
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 9n,
      expiry: now + 600n,
    });
    const t = makeSigned(otherTaker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 2n,
      expiry: now + 600n,
    });
    await buildAndSendSettleOne(
      m,
      t,
      50_000n * PRICE_PRECISION,
      1n * SIZE_PRECISION,
    );

    const after = (
      await program.account.orderSettlementConfig.fetch(osConfigPda)
    ).batchCounter.toNumber();
    assert.equal(after, before + 1);
  });

  it("commit-reveal: settle fails before delay, succeeds after (Mapping 3)", async () => {
    // Defensive unpause in case a prior test left paused.
    try {
      await program.methods
        .unpause()
        .accounts({ config: osConfigPda, owner: owner.publicKey })
        .rpc();
    } catch (_) {}
    // Enable a small min_settlement_delay (2s).
    await program.methods
      .setSettlementDelay(new anchor.BN(2), new anchor.BN(300))
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();

    const now = BigInt(Math.floor(Date.now() / 1000));
    const m = makeSigned(maker, {
      isLong: false,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 10n,
      expiry: now + 600n,
    });
    const t = makeSigned(taker, {
      isLong: true,
      size: 1n * SIZE_PRECISION,
      price: 50_000n * PRICE_PRECISION,
      nonce: 9n,
      expiry: now + 600n,
    });
    const mDigest = digest(m.order);
    const tDigest = digest(t.order);

    // Commit both orders. Each commit is a separate tx with its own ed25519 ix.
    for (const s of [m, t]) {
      const d = digest(s.order);
      const ix = await program.methods
        .commitOrder(Array.from(d) as any, toIxOrder(s) as any)
        .accounts({
          config: osConfigPda,
          operatorAccount: osOperatorPda(operator.publicKey),
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          snapshot: commitPda(d),
          operator: operator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ed25519Ix(s));
      tx.add(ix);
      await provider.sendAndConfirm(tx, [operator]);
    }

    // Bump fees AFTER commit but BEFORE settle. Mapping 3: snapshot wins.
    await program.methods
      .setFees(50, 100) // 50 bps maker, 100 bps taker (much higher than 2/6)
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();

    // Try to settle immediately — should fail (delay not elapsed).
    let threw = false;
    try {
      await buildAndSendSettleOne(
        m,
        t,
        50_000n * PRICE_PRECISION,
        1n * SIZE_PRECISION,
        { makerSnapshot: commitPda(mDigest), takerSnapshot: commitPda(tDigest) },
      );
    } catch (e: any) {
      threw = true;
      const errMsg = String(e?.message ?? e);
      const errLogs = ((e?.logs ?? []) as string[]).join(" | ");
      const full = errMsg + " | " + errLogs;
      assert.match(full, /OrderTooRecent/, "actual error: " + full);
    }
    assert.isTrue(threw, "settle within delay must fail");

    // Wait 3 seconds.
    await new Promise((r) => setTimeout(r, 3500));

    const makerBalBefore = (
      await vault.account.accountBalance.fetch(balancePda(maker.publicKey))
    ).balance.toNumber();

    await buildAndSendSettleOne(
      m,
      t,
      50_000n * PRICE_PRECISION,
      1n * SIZE_PRECISION,
      { makerSnapshot: commitPda(mDigest), takerSnapshot: commitPda(tDigest) },
    );

    // Mapping 3: maker fee should still be 2 bps (snapshot), not 50 bps.
    // notional = 50_000 * 1e6 = 50e9; maker_fee = 50e9 * 2/10000 = 10e6.
    // Plus v0.3.1 margin lock: $50K * 5% = $2500.
    // The maker already has a position from prior happy-path trade (-1 BTC SHORT
    // at $50K, margin = $2500). Re-opening at the same size+price is a noop on
    // size — but engine's open_position adds size_delta, so this becomes -2 BTC
    // total and additional_margin = required($5000) - old($2500) = $2500.
    const makerBalAfter = (
      await vault.account.accountBalance.fetch(balancePda(maker.publicKey))
    ).balance.toNumber();
    const debited = makerBalBefore - makerBalAfter;
    assert.equal(
      debited,
      10_000_000 + 2_500_000_000,
      "maker fee must use snapshotted 2 bps (10e6) + v0.3.1 margin lock ($2500)",
    );

    // Restore fees.
    await program.methods
      .setFees(2, 6)
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();
    await program.methods
      .setSettlementDelay(new anchor.BN(0), new anchor.BN(300))
      .accounts({ config: osConfigPda, owner: owner.publicKey })
      .rpc();
  });
});
