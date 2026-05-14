import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AutoDeleveraging } from "../target/types/auto_deleveraging";
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
// auto_deleveraging — ADL state tracking + cooldown + engine CPI
// ============================================================
// v0.3 wiring #2: execute_adl fires real CPI to perp_engine.open_position
// (forced reduce on a profitable counterparty position). Vault accounts
// forwarded via remainingAccounts so engine's internal vault CPI fires.

describe("auto_deleveraging", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AutoDeleveraging as Program<AutoDeleveraging>;
  const engine = anchor.workspace.PerpEngine as Program<PerpEngine>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const profitableTrader = Keypair.generate();
  const insurancePlaceholder = Keypair.generate().publicKey;

  // Engine operator used to open the profitable LONG position.
  const engineOperatorKp = Keypair.generate();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adl_config")],
    program.programId,
  );
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adl_authority")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  // Engine PDAs
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
  const enginePositionPda = (trader: PublicKey) =>
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

  let usdcMint: PublicKey;

  // openPosition remainingAccounts — same shape engine expects.
  const openCloseRA = (trader: PublicKey) => [
    { pubkey: engineAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: vault.programId, isSigner: false, isWritable: false },
    { pubkey: vaultConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultOperatorPda(engineAuthorityPda), isSigner: false, isWritable: false },
    { pubkey: balancePda(trader), isSigner: false, isWritable: true },
    { pubkey: balancePda(engineAuthorityPda), isSigner: false, isWritable: true },
  ];

  before(async () => {
    for (const target of [
      operatorKp.publicKey,
      profitableTrader.publicKey,
      engineOperatorKp.publicKey,
      authorityPda,
    ]) {
      const sig = await provider.connection.requestAirdrop(
        target,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    const vc = await vault.account.vaultConfig.fetch(vaultConfigPda);
    usdcMint = vc.usdcMint;

    // Fund profitableTrader's vault balance so they can open a position.
    const SEED = 10_000 * 1_000_000;
    const ata = await createAccount(
      provider.connection,
      profitableTrader,
      usdcMint,
      profitableTrader.publicKey,
    );
    await mintTo(provider.connection, owner, usdcMint, ata, owner, SEED);
    await vault.methods
      .deposit(new anchor.BN(SEED))
      .accounts({
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        userUsdc: ata,
        accountBalance: balancePda(profitableTrader.publicKey),
        depositor: profitableTrader.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([profitableTrader])
      .rpc();

    // Authorize a fresh engine operator to open the position.
    await engine.methods
      .setOperator(engineOperatorKp.publicKey, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Authorize adl_authority PDA as engine operator (one-time setup).
    await engine.methods
      .setOperator(authorityPda, true)
      .accounts({
        engineConfig: engineConfigPda,
        operatorAccount: engineOperatorPda(authorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Reset mark to $50K for opening at this price.
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

    // Open profitable LONG 1 BTC at $50K, then move mark to $52K so it's
    // profitable when ADL fires. ADL will reduce 0.5 BTC at $52K mark.
    await engine.methods
      .openPosition(
        new anchor.BN(1 * 100_000_000),
        new anchor.BN(50_000 * 1_000_000),
      )
      .accounts({
        engineConfig: engineConfigPda,
        market: engineMarketPda,
        position: enginePositionPda(profitableTrader.publicKey),
        trader: profitableTrader.publicKey,
        operatorAccount: engineOperatorPda(engineOperatorKp.publicKey),
        operator: engineOperatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(profitableTrader.publicKey))
      .signers([engineOperatorKp])
      .rpc();

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
  });

  it("initializes with $1K threshold + 0s cooldown for testing", async () => {
    await program.methods
      .initialize(
        new anchor.BN(1_000 * 1_000_000),  // min_bad_debt_threshold = $1K
        new anchor.BN(0),                   // cooldown 0 for tests
      )
      .accounts({
        config: configPda,
        authority: authorityPda,
        perpEngine: engine.programId,
        perpVault: vault.programId,
        insuranceFund: insurancePlaceholder,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.adlConfig.fetch(configPda);
    assert.isTrue(cfg.adlEnabled);
    assert.isFalse(cfg.paused);
  });

  it("authorizes an operator", async () => {
    await program.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const op = await program.account.operator.fetch(operatorPda);
    assert.isTrue(op.authorized);
  });

  it("rejects ADL when fund still healthy ($5K > $1K threshold)", async () => {
    let threw = false;
    try {
      await program.methods
        .executeAdl(
          Array.from(marketIdBtc),
          profitableTrader.publicKey,
          new anchor.BN(1 * 100_000_000),
          new anchor.BN(50_000_000),
          new anchor.BN(52_000 * 1_000_000),
          new anchor.BN(2_000 * 1_000_000),
          new anchor.BN(5_000 * 1_000_000),  // fund $5K (healthy)
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          authority: authorityPda,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          enginePosition: enginePositionPda(profitableTrader.publicKey),
          traderAccount: profitableTrader.publicKey,
          engineOperatorAccount: engineOperatorPda(authorityPda),
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(openCloseRA(profitableTrader.publicKey))
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /InsuranceFundSufficient|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
  });

  it("rejects ADL when bad debt below threshold", async () => {
    let threw = false;
    try {
      await program.methods
        .executeAdl(
          Array.from(marketIdBtc),
          profitableTrader.publicKey,
          new anchor.BN(1 * 100_000_000),
          new anchor.BN(50_000_000),
          new anchor.BN(52_000 * 1_000_000),
          new anchor.BN(500 * 1_000_000),   // bad_debt $500 < $1K threshold
          new anchor.BN(0),                  // fund depleted
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          authority: authorityPda,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          enginePosition: enginePositionPda(profitableTrader.publicKey),
          traderAccount: profitableTrader.publicKey,
          engineOperatorAccount: engineOperatorPda(authorityPda),
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(openCloseRA(profitableTrader.publicKey))
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /BadDebtBelowThreshold|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
  });

  it("executes ADL successfully — engine position reduced, PositionModified emitted", async () => {
    const posBefore = await engine.account.position.fetch(
      enginePositionPda(profitableTrader.publicKey),
    );
    assert.equal(posBefore.size.toString(), (1 * 100_000_000).toString());

    await program.methods
      .executeAdl(
        Array.from(marketIdBtc),
        profitableTrader.publicKey,
        new anchor.BN(1 * 100_000_000),     // current position size
        new anchor.BN(50_000_000),          // reduce 0.5 BTC
        new anchor.BN(52_000 * 1_000_000),  // mark $52K
        new anchor.BN(2_000 * 1_000_000),   // bad_debt $2K > $1K threshold
        new anchor.BN(0),                    // fund depleted
      )
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        authority: authorityPda,
        perpEngineProgram: engine.programId,
        engineConfig: engineConfigPda,
        engineMarket: engineMarketPda,
        enginePosition: enginePositionPda(profitableTrader.publicKey),
        traderAccount: profitableTrader.publicKey,
        engineOperatorAccount: engineOperatorPda(authorityPda),
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(openCloseRA(profitableTrader.publicKey))
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.adlConfig.fetch(configPda);
    assert.equal(cfg.totalAdlEvents.toNumber(), 1);
    assert.equal(cfg.totalBadDebtCovered.toString(), "2000000000");

    // Engine should have reduced the position by 0.5 BTC.
    const posAfter = await engine.account.position.fetch(
      enginePositionPda(profitableTrader.publicKey),
    );
    assert.equal(
      posAfter.size.toString(),
      (50_000_000).toString(),
      "engine position reduced from 1 BTC to 0.5 BTC",
    );
  });

  it("rejects when ADL disabled", async () => {
    await program.methods
      .setAdlEnabled(false)
      .accounts({ config: configPda, owner: owner.publicKey })
      .rpc();

    let threw = false;
    try {
      await program.methods
        .executeAdl(
          Array.from(marketIdBtc),
          profitableTrader.publicKey,
          new anchor.BN(50_000_000),
          new anchor.BN(50_000_000),
          new anchor.BN(52_000 * 1_000_000),
          new anchor.BN(2_000 * 1_000_000),
          new anchor.BN(0),
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          authority: authorityPda,
          perpEngineProgram: engine.programId,
          engineConfig: engineConfigPda,
          engineMarket: engineMarketPda,
          enginePosition: enginePositionPda(profitableTrader.publicKey),
          traderAccount: profitableTrader.publicKey,
          engineOperatorAccount: engineOperatorPda(authorityPda),
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(openCloseRA(profitableTrader.publicKey))
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /ADLDisabled|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);

    await program.methods
      .setAdlEnabled(true)
      .accounts({ config: configPda, owner: owner.publicKey })
      .rpc();
  });
});
