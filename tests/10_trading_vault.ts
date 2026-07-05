import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TradingVault } from "../target/types/trading_vault";
import { PerpVault } from "../target/types/perp_vault";
import { PerpEngine } from "../target/types/perp_engine";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// trading_vault — happy-path integration test
// ============================================================
// Mirrors TradingVault.sol Foundry tests:
//   1) initialize trading_vault + perp_vault + perp_engine, wire operators
//   2) create vault (1000 USDC min first deposit, 20% perf fee, 0% mgmt)
//   3) trader1 deposits 1000 USDC -> 1e21 shares (1000e6 * 1e12 ratio)
//   4) trader2 deposits 500 USDC -> pro-rata at unchanged equity
//   5) manager opens + closes a position via CPI to perp_engine
//   6) trader1 withdraws half shares -> ~500 USDC back (after lockup)
//   7) lockup violation rejected
//   8) drawdown auto-pause + 24h cooldown lock

describe("trading_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const tv = anchor.workspace.TradingVault as Program<TradingVault>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const manager = Keypair.generate();
  const trader1 = Keypair.generate();
  const trader2 = Keypair.generate();
  const enginePriceOperator = Keypair.generate();

  // trading_vault PDAs
  const [tvConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    tv.programId,
  );
  const [tvAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trading_vault_authority")],
    tv.programId,
  );

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
  const [perpVaultTvOperatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), tvAuthorityPda.toBuffer()],
    vault.programId,
  );

  // perp_engine PDAs
  const [engineConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    engine.programId,
  );
  const [engineAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_authority")],
    engine.programId,
  );
  const [perpEngineTvOperatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), tvAuthorityPda.toBuffer()],
    engine.programId,
  );
  const [enginePriceOperatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), enginePriceOperator.publicKey.toBuffer()],
    engine.programId,
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

  // Vault id (32 bytes) — deterministic for test.
  const vaultId = Buffer.alloc(32);
  Buffer.from("test-vault-001").copy(vaultId);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultId],
    tv.programId,
  );

  const depositorPda = (depositor: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("share"), vaultId, depositor.toBuffer()],
      tv.programId,
    )[0];

  // Market for manager trading
  const marketId = Buffer.alloc(32);
  Buffer.from("TV-BTC-USD").copy(marketId);
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId],
    engine.programId,
  );
  const positionVaultPda = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketId, vaultPda.toBuffer()],
    engine.programId,
  )[0];

  let usdcMint: PublicKey;
  let trader1Usdc: PublicKey;
  let trader2Usdc: PublicKey;
  let managerUsdc: PublicKey;

  // Constants
  const ONE_K = 1_000n * 1_000_000n; // 1000 USDC
  const FIVE_HUNDRED = 500n * 1_000_000n;
  const PRICE_PRECISION = 1_000_000n;
  const SHARE_PRECISION = 1_000_000_000_000_000_000n;
  const SHARE_PER_PRICE = 1_000_000_000_000n;

  before(async () => {
    for (const kp of [manager, trader1, trader2, enginePriceOperator]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        3 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Pre-fund the trading_vault authority PDA (rent for init_if_needed at perp_vault + perp_engine).
    const sig = await provider.connection.requestAirdrop(
      tvAuthorityPda,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    // perp_vault is a singleton PDA shared with prior tests; reuse if exists.
    let existing = await vault.account.vaultConfig.fetchNullable(perpVaultConfigPda);
    if (existing) {
      usdcMint = existing.usdcMint;
    } else {
      usdcMint = await createMint(provider.connection, owner, owner.publicKey, null, 6);
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

    trader1Usdc = await createAccount(provider.connection, trader1, usdcMint, trader1.publicKey);
    trader2Usdc = await createAccount(provider.connection, trader2, usdcMint, trader2.publicKey);
    managerUsdc = await createAccount(provider.connection, manager, usdcMint, manager.publicKey);

    // Mint funds: 100k USDC each
    for (const ata of [trader1Usdc, trader2Usdc, managerUsdc]) {
      await mintTo(
        provider.connection,
        owner,
        usdcMint,
        ata,
        owner,
        Number(100_000n * 1_000_000n),
      );
    }

    // Deposit each trader's USDC into perp_vault (so they have AccountBalance.balance).
    for (const [signer, ata] of [
      [trader1, trader1Usdc],
      [trader2, trader2Usdc],
      [manager, managerUsdc],
    ] as [Keypair, PublicKey][]) {
      await vault.methods
        .deposit(new anchor.BN(10_000n * 1_000_000n))
        .accounts({
          vaultConfig: perpVaultConfigPda,
          usdcVault: usdcVaultPda,
          userUsdc: ata,
          accountBalance: balancePda(signer.publicKey),
          depositor: signer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([signer])
        .rpc();
    }

    // Initialize perp_engine if not already initialized.
    let engineCfg = await engine.account.engineConfig.fetchNullable(engineConfigPda);
    if (!engineCfg) {
      await engine.methods
        .initialize()
        .accounts({
          engineConfig: engineConfigPda,
          perpVault: vault.programId,
          oracleRouter: enginePriceOperator.publicKey, // placeholder
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("registers trading_vault authority as operator on perp_vault and perp_engine", async () => {
    // perp_vault operator
    const existingVOp = await vault.account.operator.fetchNullable(perpVaultTvOperatorPda);
    if (!existingVOp || !existingVOp.authorized) {
      await vault.methods
        .setOperator(tvAuthorityPda, true)
        .accounts({
          vaultConfig: perpVaultConfigPda,
          operatorAccount: perpVaultTvOperatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    // perp_engine operator
    const existingEOp = await engine.account.operator.fetchNullable(perpEngineTvOperatorPda);
    if (!existingEOp || !existingEOp.authorized) {
      await engine.methods
        .setOperator(tvAuthorityPda, true)
        .accounts({
          engineConfig: engineConfigPda,
          operatorAccount: perpEngineTvOperatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    // also register a separate price operator on perp_engine to push mark prices
    const existingPriceOp = await engine.account.operator.fetchNullable(enginePriceOperatorPda);
    if (!existingPriceOp || !existingPriceOp.authorized) {
      await engine.methods
        .setOperator(enginePriceOperator.publicKey, true)
        .accounts({
          engineConfig: engineConfigPda,
          operatorAccount: enginePriceOperatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Add the test market if not present.
    const m = await engine.account.market.fetchNullable(marketPda);
    if (!m) {
      await engine.methods
        .addMarket(
          Array.from(marketId),
          new anchor.BN(500),                          // 5% initial margin
          new anchor.BN(250),                          // 2.5% maintenance
          new anchor.BN(1000 * 100_000_000),           // max 1000 size units
        )
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Push initial mark = $50_000 (6dp).
      await engine.methods
        .updateMarkPrice(new anchor.BN(50_000n * PRICE_PRECISION), new anchor.BN(50_000n * PRICE_PRECISION))
        .accounts({
          engineConfig: engineConfigPda,
          market: marketPda,
          operatorAccount: enginePriceOperatorPda,
          operator: enginePriceOperator.publicKey,
        })
        .signers([enginePriceOperator])
        .rpc();
    }
  });

  it("initializes trading_vault config", async () => {
    const existing = await tv.account.tradingVaultConfig.fetchNullable(tvConfigPda);
    if (!existing) {
      await tv.methods
        .initialize()
        .accounts({
          config: tvConfigPda,
          authority: tvAuthorityPda,
          perpVaultProgram: vault.programId,
          perpVaultConfig: perpVaultConfigPda,
          vaultOperatorAccount: perpVaultTvOperatorPda,
          perpEngineProgram: engine.programId,
          perpEngineConfig: engineConfigPda,
          engineOperatorAccount: perpEngineTvOperatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    const cfg = await tv.account.tradingVaultConfig.fetch(tvConfigPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(cfg.drawdownCooldownSecs.toNumber(), 86400);
  });

  it("creates a vault: 20% perf, 0% mgmt, 30% max drawdown, 1s lockup", async () => {
    const name = Buffer.from("AlphaVault");
    const desc = Buffer.from("Test vault for integration");
    await tv.methods
      .createVault(
        Array.from(vaultId),
        name,
        desc,
        new anchor.BN(2000),                  // 20% perf fee
        new anchor.BN(0),                     // 0% mgmt fee — keeps math clean for assertions
        new anchor.BN(0),                     // unlimited deposit cap
        new anchor.BN(1),                     // 1s lockup
        new anchor.BN(3000),                  // 30% max drawdown
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([manager])
      .rpc();

    const v = await tv.account.vault.fetch(vaultPda);
    assert.equal(v.manager.toBase58(), manager.publicKey.toBase58());
    assert.equal(v.performanceFeeBps.toNumber(), 2000);
    assert.equal(v.maxDrawdownBps.toNumber(), 3000);
  });

  it("bootstraps the vault PDA's perp_vault AccountBalance", async () => {
    await tv.methods
      .initVaultBalance()
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        payer: manager.publicKey,
        authority: tvAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: perpVaultTvOperatorPda,
        vaultBalance: balancePda(vaultPda),
        systemProgram: SystemProgram.programId,
      })
      .signers([manager])
      .rpc();

    const vbal = await vault.account.accountBalance.fetch(balancePda(vaultPda));
    assert.equal(vbal.balance.toNumber(), 0);
    assert.equal(vbal.collateralBalance.toNumber(), 0);
  });

  it("trader1 deposits 1000 USDC (first depositor) → shares = 1000e6 * 1e12", async () => {
    await tv.methods
      .deposit(new anchor.BN(ONE_K.toString()))
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        depositorAccount: depositorPda(trader1.publicKey),
        depositor: trader1.publicKey,
        authority: tvAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: perpVaultTvOperatorPda,
        depositorBalance: balancePda(trader1.publicKey),
        vaultBalance: balancePda(vaultPda),
        managerBalance: balancePda(manager.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    const v = await tv.account.vault.fetch(vaultPda);
    const expectedShares = ONE_K * SHARE_PER_PRICE; // 1000e6 * 1e12 = 1e21
    assert.equal(v.totalShares.toString(), expectedShares.toString());
    assert.equal(v.totalDeposited.toString(), ONE_K.toString());

    const d = await tv.account.depositor.fetch(depositorPda(trader1.publicKey));
    assert.equal(d.shares.toString(), expectedShares.toString());

    const vbal = await vault.account.accountBalance.fetch(balancePda(vaultPda));
    assert.equal(vbal.balance.toString(), ONE_K.toString());
  });

  it("trader2 deposits 500 USDC → pro-rata shares (no PnL change)", async () => {
    // equity = 1000e6 (no positions yet), totalShares = 1e21.
    // shares = 500e6 * 1e21 / 1000e6 = 5e20.
    await tv.methods
      .deposit(new anchor.BN(FIVE_HUNDRED.toString()))
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        depositorAccount: depositorPda(trader2.publicKey),
        depositor: trader2.publicKey,
        authority: tvAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: perpVaultTvOperatorPda,
        depositorBalance: balancePda(trader2.publicKey),
        vaultBalance: balancePda(vaultPda),
        managerBalance: balancePda(manager.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([trader2])
      .rpc();

    const v = await tv.account.vault.fetch(vaultPda);
    const expectedT2 = (FIVE_HUNDRED * (ONE_K * SHARE_PER_PRICE)) / ONE_K; // = 5e20
    const total = ONE_K * SHARE_PER_PRICE + expectedT2;
    assert.equal(v.totalShares.toString(), total.toString());

    const vbal = await vault.account.accountBalance.fetch(balancePda(vaultPda));
    assert.equal(vbal.balance.toString(), (ONE_K + FIVE_HUNDRED).toString());
  });

  it("manager opens a small LONG position via CPI", async () => {
    // size_delta = 0.01 BTC = 1_000_000 (SIZE_PRECISION 1e8 -> 0.01 * 1e8)
    // notional = 0.01 * 50_000 = $500. margin = 5% = $25.
    await tv.methods
      .managerOpenPosition(
        Array.from(marketId),
        new anchor.BN(1_000_000),
        new anchor.BN(50_000n * PRICE_PRECISION),
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        authority: tvAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineMarket: marketPda,
        position: positionVaultPda,
        engineOperatorAccount: perpEngineTvOperatorPda,
        vaultBalance: balancePda(vaultPda),
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthority: engineAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .signers([manager])
      .rpc();

    const pos = await engine.account.position.fetch(positionVaultPda);
    assert.equal(pos.size.toString(), "1000000");
    assert.equal(pos.entryPrice.toString(), (50_000n * PRICE_PRECISION).toString());
  });

  it("manager reduce routes to engine.reduce_position and settles freed margin", async () => {
    // Position: 0.01 BTC long, margin $25. Reduce by half at the same price:
    // PnL = 0, surviving margin $12.50 -> freed $12.50 must return to the
    // vault's balance (the stranded-margin High fix). Before the routing fix
    // this went through open_position and returned nothing.
    const before = await vault.account.accountBalance.fetch(balancePda(vaultPda));

    await tv.methods
      .managerOpenPosition(
        Array.from(marketId),
        new anchor.BN(-500_000), // reduce: -0.005 BTC against the 0.01 long
        new anchor.BN(50_000n * PRICE_PRECISION),
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        authority: tvAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineMarket: marketPda,
        position: positionVaultPda,
        engineOperatorAccount: perpEngineTvOperatorPda,
        vaultBalance: balancePda(vaultPda),
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthority: engineAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .signers([manager])
      .rpc();

    const pos = await engine.account.position.fetch(positionVaultPda);
    assert.equal(pos.size.toString(), "500000"); // surviving 0.005 long
    assert.equal(pos.margin.toString(), "12500000"); // $12.50 stays locked

    const after = await vault.account.accountBalance.fetch(balancePda(vaultPda));
    // freed margin $12.50 settled back (PnL 0 at unchanged price)
    assert.equal(
      after.amount.sub(before.amount).toString(),
      "12500000",
      "freed margin must settle back to the vault balance",
    );
  });

  it("manager closes the position via CPI", async () => {
    await tv.methods
      .managerClosePosition(
        Array.from(marketId),
        new anchor.BN(50_000n * PRICE_PRECISION),
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        authority: tvAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineMarket: marketPda,
        position: positionVaultPda,
        engineOperatorAccount: perpEngineTvOperatorPda,
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthority: engineAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        vaultBalance: balancePda(vaultPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
      })
      .signers([manager])
      .rpc();

    const pos = await engine.account.position.fetch(positionVaultPda);
    assert.equal(pos.size.toString(), "0");
  });

  it("rejects withdraw inside the lockup window", async () => {
    // Re-deposit a small amount to refresh deposit_timestamp -> hits lockup.
    const small = 100n * 1_000_000n;
    await tv.methods
      .deposit(new anchor.BN(small.toString()))
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        depositorAccount: depositorPda(trader1.publicKey),
        depositor: trader1.publicKey,
        authority: tvAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: perpVaultTvOperatorPda,
        depositorBalance: balancePda(trader1.publicKey),
        vaultBalance: balancePda(vaultPda),
        managerBalance: balancePda(manager.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    let threw = false;
    try {
      await tv.methods
        .withdraw(new anchor.BN(1_000_000_000_000n.toString()))
        .accounts({
          config: tvConfigPda,
          vault: vaultPda,
          depositorAccount: depositorPda(trader1.publicKey),
          depositor: trader1.publicKey,
          authority: tvAuthorityPda,
          perpVaultProgram: vault.programId,
          perpVaultConfig: perpVaultConfigPda,
          vaultOperatorAccount: perpVaultTvOperatorPda,
          depositorBalance: balancePda(trader1.publicKey),
          vaultBalance: balancePda(vaultPda),
          managerBalance: balancePda(manager.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .signers([trader1])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /LockupNotExpired|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "withdraw inside lockup must throw");
  });

  it("trader1 withdraws after lockup elapses", async () => {
    // Lockup = 1s. Sleep just over 1s.
    await new Promise((r) => setTimeout(r, 1500));

    // Burn half of trader1's shares.
    const d = await tv.account.depositor.fetch(depositorPda(trader1.publicKey));
    const halfShares = BigInt(d.shares.toString()) / 2n;

    const before = await vault.account.accountBalance.fetch(balancePda(trader1.publicKey));

    await tv.methods
      .withdraw(new anchor.BN(halfShares.toString()))
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        depositorAccount: depositorPda(trader1.publicKey),
        depositor: trader1.publicKey,
        authority: tvAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        vaultOperatorAccount: perpVaultTvOperatorPda,
        depositorBalance: balancePda(trader1.publicKey),
        vaultBalance: balancePda(vaultPda),
        managerBalance: balancePda(manager.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    const after = await vault.account.accountBalance.fetch(balancePda(trader1.publicKey));
    const diff = BigInt(after.balance.toString()) - BigInt(before.balance.toString());
    // diff should be > 0 and equal to halfShares * equity / totalShares (close to 550 USDC after extra deposit).
    assert.isTrue(diff > 0n, "USDC must come back");
  });

  it("emergency_pause forces vault paused (owner-only)", async () => {
    await tv.methods
      .emergencyPause()
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        owner: owner.publicKey,
      })
      .rpc();
    const v = await tv.account.vault.fetch(vaultPda);
    assert.isTrue(v.paused);

    // Manager can unpause (no drawdown_paused_at, so cooldown skipped).
    await tv.methods
      .unpauseVault()
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
      })
      .signers([manager])
      .rpc();
    const v2 = await tv.account.vault.fetch(vaultPda);
    assert.isFalse(v2.paused);
  });

  it("drawdown auto-pause: dropping mark below HWM threshold pauses + locks cooldown", async () => {
    // HWM was bumped to current eps on first deposit. Subsequent deposits with
    // unchanged equity-per-share don't lower it. Manager opens a SHORT and we
    // crank mark UP — short loses money — eps drops below HWM*(1-0.30).
    // Open SHORT 0.05 BTC at $50k → notional $2500, margin $125.
    await tv.methods
      .managerOpenPosition(
        Array.from(marketId),
        new anchor.BN(-5_000_000), // 0.05 * 1e8 short
        new anchor.BN(50_000n * PRICE_PRECISION),
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        authority: tvAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineMarket: marketPda,
        position: positionVaultPda,
        engineOperatorAccount: perpEngineTvOperatorPda,
        vaultBalance: balancePda(vaultPda),
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthority: engineAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .signers([manager])
      .rpc();

    // Crank mark to $200k -> short PnL = -0.05 * (200k-50k) = -$7500.
    // Vault USDC balance was ~1500, equity now ~1500 + 125 (margin) - 7500 < 0 -> clamps to 0.
    // Eps drops far below HWM * (1 - 0.30). Drawdown should fire.
    await engine.methods
      .updateMarkPrice(new anchor.BN(200_000n * PRICE_PRECISION), new anchor.BN(200_000n * PRICE_PRECISION))
      .accounts({
        engineConfig: engineConfigPda,
        market: marketPda,
        operatorAccount: enginePriceOperatorPda,
        operator: enginePriceOperator.publicKey,
      })
      .signers([enginePriceOperator])
      .rpc();

    // Deviation from Solidity (documented in fees.rs): drawdown breach
    // does NOT revert — instead it auto-pauses the vault and returns Ok
    // without executing the trade. This preserves H-14 audit intent on
    // Solana (where Err would roll back the pause state).
    await tv.methods
      .managerOpenPosition(
        Array.from(marketId),
        new anchor.BN(1_000_000),
        new anchor.BN(200_000n * PRICE_PRECISION),
      )
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
        authority: tvAuthorityPda,
        perpEngineProgram: engine.programId,
        perpEngineConfig: engineConfigPda,
        engineMarket: marketPda,
        position: positionVaultPda,
        engineOperatorAccount: perpEngineTvOperatorPda,
        vaultBalance: balancePda(vaultPda),
        // v0.3.1 wiring: engine_authority + its vault accounts
        engineAuthority: engineAuthorityPda,
        perpVaultProgram: vault.programId,
        perpVaultConfig: perpVaultConfigPda,
        engineVaultOperator: vaultOperatorPda(engineAuthorityPda),
        enginePoolBalance: balancePda(engineAuthorityPda),
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: positionVaultPda, isSigner: false, isWritable: false },
        { pubkey: marketPda, isSigner: false, isWritable: false },
      ])
      .signers([manager])
      .rpc();

    const v = await tv.account.vault.fetch(vaultPda);
    assert.isTrue(v.paused, "vault should be auto-paused");
    assert.isAbove(v.drawdownPausedAt.toNumber(), 0, "drawdown_paused_at stamped");
  });

  it("drawdown cooldown: cannot unpause inside the cooldown window", async () => {
    let threw = false;
    try {
      await tv.methods
        .unpauseVault()
        .accounts({
          config: tvConfigPda,
          vault: vaultPda,
          manager: manager.publicKey,
        })
        .signers([manager])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /DrawdownCooldownActive|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "unpause inside cooldown must revert");

    // Set cooldown to 0 (owner) then unpause should succeed.
    await tv.methods
      .setDrawdownCooldownSecs(new anchor.BN(0))
      .accounts({
        config: tvConfigPda,
        owner: owner.publicKey,
      })
      .rpc();
    await tv.methods
      .unpauseVault()
      .accounts({
        config: tvConfigPda,
        vault: vaultPda,
        manager: manager.publicKey,
      })
      .signers([manager])
      .rpc();
    const v = await tv.account.vault.fetch(vaultPda);
    assert.isFalse(v.paused);
  });
});
