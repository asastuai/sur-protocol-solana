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
// perp_engine — integration test (v0.3 wiring #1: real perp_vault CPIs)
// ============================================================
// open_position locks margin via vault.internal_transfer.
// close_position settles PnL via vault.internal_transfer.
// liquidate_position routes keeper reward + insurance payout.
//
// Vault accounts are passed via remainingAccounts in the order documented
// in each instruction's source file header. This pattern preserves backward
// compatibility for existing CPI callers (darkpool, order_settlement,
// trading_vault) which have not yet been migrated to v0.3 — they call
// open_position with empty remainingAccounts and the CPI is silently skipped.

describe("perp_engine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const trader1 = Keypair.generate();
  const trader2 = Keypair.generate();
  const trader3 = Keypair.generate();
  const keeper = Keypair.generate();
  const insuranceFundAuthority = Keypair.generate();
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

  // remainingAccounts builder for each ix — order matches src file header.
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

  // Helpers for the reduce_position battery — each test uses a fresh funded
  // trader so positions don't couple across `it`s.
  const fundTrader = async (kp: Keypair) => {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    const SEED = 10_000 * 1_000_000;
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
  };
  const bal = async (pk: PublicKey) =>
    (await vault.account.accountBalance.fetch(balancePda(pk))).balance.toNumber();
  const openPos = (kp: Keypair, sizeDelta: number, price: number) =>
    program.methods
      .openPosition(new anchor.BN(sizeDelta), new anchor.BN(price))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(kp.publicKey),
        trader: kp.publicKey,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(kp.publicKey))
      .signers([operatorKp])
      .rpc();
  const reducePos = (kp: Keypair, sizeDelta: number, price: number, ra?: any[]) =>
    program.methods
      .reducePosition(new anchor.BN(sizeDelta), new anchor.BN(price))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(kp.publicKey),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .remainingAccounts(ra ?? openCloseRA(kp.publicKey))
      .signers([operatorKp])
      .rpc();

  before(async () => {
    for (const target of [
      operatorKp.publicKey,
      trader1.publicKey,
      trader2.publicKey,
      trader3.publicKey,
      keeper.publicKey,
      insuranceFundAuthority.publicKey,
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
  });

  it("initializes engine config (with engine_authority PDA)", async () => {
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

    const cfg = await program.account.engineConfig.fetch(engineConfigPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(cfg.perpVault.toBase58(), vault.programId.toBase58());
  });

  it("authorizes operatorKp as engine operator", async () => {
    await program.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: operatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("registers engine_authority as operator on perp_vault", async () => {
    await vault.methods
      .setOperator(engineAuthorityPda, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: vaultOperatorPda(engineAuthorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("adds BTC-USD market", async () => {
    await program.methods
      .addMarket(
        Array.from(marketIdBtc),
        new anchor.BN(500),
        new anchor.BN(250),
        new anchor.BN(100 * 100_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("updates mark price to 50000", async () => {
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
  });

  it("funds vault balances for traders, keeper, insurance fund", async () => {
    const SEED = 10_000 * 1_000_000;
    for (const kp of [trader1, trader2, trader3, keeper, insuranceFundAuthority]) {
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
  });

  it("bootstraps engine_pool balance via bootstrap_engine_pool ix", async () => {
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

    const pool = await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda));
    assert.equal(pool.balance.toString(), POOL_SEED.toString());
  });

  it("opens trader1 LONG 1 BTC at 50000 - margin debited from trader, credited to engine_pool", async () => {
    const traderBalBefore = (await vault.account.accountBalance.fetch(balancePda(trader1.publicKey))).balance.toNumber();
    const poolBalBefore = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();

    await program.methods
      .openPosition(new anchor.BN(1 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
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

    const pos = await program.account.position.fetch(positionPda(trader1.publicKey));
    assert.equal(pos.size.toString(), (1 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "2500000000");

    const traderBalAfter = (await vault.account.accountBalance.fetch(balancePda(trader1.publicKey))).balance.toNumber();
    const poolBalAfter = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();
    assert.equal(traderBalBefore - traderBalAfter, 2_500_000_000);
    assert.equal(poolBalAfter - poolBalBefore, 2_500_000_000);
  });

  it("opens trader2 SHORT 1 BTC at 50000", async () => {
    await program.methods
      .openPosition(new anchor.BN(-1 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader2.publicKey),
        trader: trader2.publicKey,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(trader2.publicKey))
      .signers([operatorKp])
      .rpc();

    const pos = await program.account.position.fetch(positionPda(trader2.publicKey));
    assert.equal(pos.size.toString(), (-1 * 100_000_000).toString());
  });

  it("closes trader1 LONG at 52000 - PnL +2000, trader receives margin + profit", async () => {
    const traderBalBefore = (await vault.account.accountBalance.fetch(balancePda(trader1.publicKey))).balance.toNumber();
    const poolBalBefore = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();

    await program.methods
      .closePosition(new anchor.BN(52_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader1.publicKey),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .remainingAccounts(openCloseRA(trader1.publicKey))
      .signers([operatorKp])
      .rpc();

    const traderBalAfter = (await vault.account.accountBalance.fetch(balancePda(trader1.publicKey))).balance.toNumber();
    const poolBalAfter = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();
    assert.equal(traderBalAfter - traderBalBefore, 4_500_000_000);
    assert.equal(poolBalBefore - poolBalAfter, 4_500_000_000);
  });

  it("closes trader2 SHORT at 52000 - PnL -2000 (loser, partial)", async () => {
    const traderBalBefore = (await vault.account.accountBalance.fetch(balancePda(trader2.publicKey))).balance.toNumber();
    const poolBalBefore = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();

    await program.methods
      .closePosition(new anchor.BN(52_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader2.publicKey),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .remainingAccounts(openCloseRA(trader2.publicKey))
      .signers([operatorKp])
      .rpc();

    const traderBalAfter = (await vault.account.accountBalance.fetch(balancePda(trader2.publicKey))).balance.toNumber();
    const poolBalAfter = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();
    assert.equal(traderBalAfter - traderBalBefore, 500_000_000);
    assert.equal(poolBalBefore - poolBalAfter, 500_000_000);
  });

  it("opens trader3 LONG 1 BTC for bad-debt path", async () => {
    await program.methods
      .openPosition(new anchor.BN(1 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader3.publicKey),
        trader: trader3.publicKey,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(trader3.publicKey))
      .signers([operatorKp])
      .rpc();
  });

  it("closes trader3 at 45000 - bad debt: trader gets 0, BadDebt event emitted", async () => {
    const traderBalBefore = (await vault.account.accountBalance.fetch(balancePda(trader3.publicKey))).balance.toNumber();
    const poolBalBefore = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();

    let badDebtEvent: any = null;
    const listener = program.addEventListener("badDebt", (ev: any) => {
      badDebtEvent = ev;
    });

    await program.methods
      .closePosition(new anchor.BN(45_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(trader3.publicKey),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .remainingAccounts(openCloseRA(trader3.publicKey))
      .signers([operatorKp])
      .rpc();

    await new Promise((r) => setTimeout(r, 1500));
    await program.removeEventListener(listener);

    const traderBalAfter = (await vault.account.accountBalance.fetch(balancePda(trader3.publicKey))).balance.toNumber();
    const poolBalAfter = (await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))).balance.toNumber();
    assert.equal(traderBalAfter - traderBalBefore, 0);
    assert.equal(poolBalAfter, poolBalBefore);
    assert.isNotNull(badDebtEvent);
    assert.equal(badDebtEvent.amount.toString(), "2500000000");
    assert.isFalse(badDebtEvent.viaLiquidation);
  });

  it("rejects oversized open position", async () => {
    let threw = false;
    try {
      await program.methods
        .openPosition(new anchor.BN(101 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
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
    } catch (e: any) {
      threw = true;
    }
    assert.isTrue(threw);
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
        .openPosition(new anchor.BN(1 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
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

  // ── reduce_position: settles a voluntary reduce ─────────────────────────
  // open_position's reduce path strands the freed margin (additional_margin =
  // required.saturating_sub(old_margin) is 0 on a reduce, so it returns no
  // value — the confirmed High). reduce_position is the settling path for
  // voluntary callers: it returns the freed margin (+ realized PnL) to the
  // trader, mirroring close_position. open_position is left as-is for ADL.
  it("refunds freed margin to the trader on a pure reduce via reduce_position", async () => {
    const t = trader1.publicKey; // position is currently size 0 (closed earlier)

    // Setup: fresh LONG 2 BTC @ 50000 → margin 5000 USDC locked.
    await program.methods
      .openPosition(new anchor.BN(2 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(t),
        trader: t,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(t))
      .signers([operatorKp])
      .rpc();

    const posOpen = await program.account.position.fetch(positionPda(t));
    assert.equal(posOpen.size.toString(), (2 * 100_000_000).toString());
    assert.equal(posOpen.margin.toString(), "5000000000");

    const traderBefore = (
      await vault.account.accountBalance.fetch(balancePda(t))
    ).balance.toNumber();
    const poolBefore = (
      await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))
    ).balance.toNumber();

    // Reduce LONG 2 → 1 at fill == entry (zero PnL): frees exactly 2500 USDC.
    await program.methods
      .reducePosition(new anchor.BN(-1 * 100_000_000), new anchor.BN(50_000 * 1_000_000))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        position: positionPda(t),
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .remainingAccounts(openCloseRA(t))
      .signers([operatorKp])
      .rpc();

    const pos = await program.account.position.fetch(positionPda(t));
    assert.equal(pos.size.toString(), (1 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "2500000000"); // residual margin stays locked

    const traderAfter = (
      await vault.account.accountBalance.fetch(balancePda(t))
    ).balance.toNumber();
    const poolAfter = (
      await vault.account.accountBalance.fetch(balancePda(engineAuthorityPda))
    ).balance.toNumber();

    // CORRECT: the 2500 USDC of freed margin is refunded to the trader.
    assert.equal(
      traderAfter - traderBefore,
      2_500_000_000,
      "freed margin must be refunded to the trader on reduce",
    );
    assert.equal(
      poolBefore - poolAfter,
      2_500_000_000,
      "engine_pool must release the freed margin",
    );
  });

  it("reduce_position winner: refunds freed margin + realized profit", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 2 * 100_000_000, 50_000 * 1_000_000); // LONG 2 BTC, margin 5000
    const t0 = await bal(k.publicKey);
    const p0 = await bal(engineAuthorityPda);
    await reducePos(k, -1 * 100_000_000, 52_000 * 1_000_000); // close 1 @ +2000
    const pos = await program.account.position.fetch(positionPda(k.publicKey));
    assert.equal(pos.size.toString(), (1 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "2500000000");
    assert.equal((await bal(k.publicKey)) - t0, 4_500_000_000); // freed 2500 + pnl 2000
    assert.equal(p0 - (await bal(engineAuthorityPda)), 4_500_000_000);
  });

  it("reduce_position loser-partial: refunds freed margin minus loss", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 2 * 100_000_000, 50_000 * 1_000_000);
    const t0 = await bal(k.publicKey);
    const p0 = await bal(engineAuthorityPda);
    await reducePos(k, -1 * 100_000_000, 49_000 * 1_000_000); // close 1 @ -1000
    assert.equal((await bal(k.publicKey)) - t0, 1_500_000_000); // freed 2500 - loss 1000
    assert.equal(p0 - (await bal(engineAuthorityPda)), 1_500_000_000);
  });

  it("reduce_position rejects an increase (NotAReduce)", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 1 * 100_000_000, 50_000 * 1_000_000);
    let threw = false;
    try {
      await reducePos(k, 1 * 100_000_000, 50_000 * 1_000_000);
    } catch (e: any) {
      threw = true;
    }
    assert.isTrue(threw);
  });

  it("reduce_position reverts when vault accounts are missing", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 2 * 100_000_000, 50_000 * 1_000_000);
    let threw = false;
    try {
      await reducePos(k, -1 * 100_000_000, 50_000 * 1_000_000, []); // empty remainingAccounts
    } catch (e: any) {
      threw = true;
    }
    assert.isTrue(threw);
  });

  it("reduce_position flip to smaller: settles old side, locks new side", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 2 * 100_000_000, 50_000 * 1_000_000); // LONG 2 BTC, margin 5000
    const t0 = await bal(k.publicKey);
    const p0 = await bal(engineAuthorityPda);
    await reducePos(k, -3 * 100_000_000, 52_000 * 1_000_000); // → SHORT 1 BTC
    const pos = await program.account.position.fetch(positionPda(k.publicKey));
    assert.equal(pos.size.toString(), (-1 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "2600000000"); // 1 BTC @ 52000 * 5%
    // payout old 9000 (5000 + 4000) - lock new 2600 = net +6400 to trader
    assert.equal((await bal(k.publicKey)) - t0, 6_400_000_000);
    assert.equal(p0 - (await bal(engineAuthorityPda)), 6_400_000_000);
  });

  it("reduce_position flip to larger: net debits the trader for the new side", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, -1 * 100_000_000, 50_000 * 1_000_000); // SHORT 1 BTC, margin 2500
    const t0 = await bal(k.publicKey);
    const p0 = await bal(engineAuthorityPda);
    await reducePos(k, 3 * 100_000_000, 50_000 * 1_000_000); // → LONG 2 BTC, pnl 0
    const pos = await program.account.position.fetch(positionPda(k.publicKey));
    assert.equal(pos.size.toString(), (2 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "5000000000"); // 2 BTC @ 50000 * 5%
    // payout old 2500 - lock new 5000 = net -2500 (trader pays)
    assert.equal(t0 - (await bal(k.publicKey)), 2_500_000_000);
    assert.equal((await bal(engineAuthorityPda)) - p0, 2_500_000_000);
  });

  it("reduce_position flip with loss > old margin: bad debt, locks new side", async () => {
    const k = Keypair.generate();
    await fundTrader(k);
    await openPos(k, 1 * 100_000_000, 50_000 * 1_000_000); // LONG 1 BTC, margin 2500
    const t0 = await bal(k.publicKey);
    let badDebt: any = null;
    const listener = program.addEventListener("badDebt", (ev: any) => {
      badDebt = ev;
    });
    await reducePos(k, -2 * 100_000_000, 45_000 * 1_000_000); // → SHORT 1 BTC, loss 5000
    await new Promise((r) => setTimeout(r, 1500));
    await program.removeEventListener(listener);
    const pos = await program.account.position.fetch(positionPda(k.publicKey));
    assert.equal(pos.size.toString(), (-1 * 100_000_000).toString());
    assert.equal(pos.margin.toString(), "2250000000"); // 1 BTC @ 45000 * 5%
    assert.equal(t0 - (await bal(k.publicKey)), 2_250_000_000); // payout 0, lock new 2250
    assert.isNotNull(badDebt);
    assert.equal(badDebt.amount.toString(), "2500000000");
  });
});
