import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CollateralManager } from "../target/types/collateral_manager";
import { PerpVault } from "../target/types/perp_vault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// collateral_manager — happy-path integration test
// ============================================================
// Mirrors CollateralManager.sol Foundry tests:
//   1) initialize CM + perp_vault, register CM authority as vault operator
//   2) add a mock LST mint with $3500 price + 95% haircut + 18 decimals
//   3) trader deposits 10 LST → expect creditedUsdc = 10 * 3500e6 * 9500 / (1e18 * 10000) = 33_250e6
//   4) withdraw half → expect proportional debit
//   5) verify SPL custody balances + perp_vault.collateral_balance accounting

describe("collateral_manager", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const cm = anchor.workspace.CollateralManager as Program<CollateralManager>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const trader = Keypair.generate();

  // PDAs — collateral_manager
  const [cmConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    cm.programId,
  );
  const [cmAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("collateral_manager_authority")],
    cm.programId,
  );

  // PDAs — perp_vault
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    vault.programId,
  );
  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    vault.programId,
  );
  const [usdcVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault")],
    vault.programId,
  );
  const [vaultCmOperatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), cmAuthorityPda.toBuffer()],
    vault.programId,
  );
  const traderVaultBalancePda = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), trader.publicKey.toBuffer()],
    vault.programId,
  )[0];

  let usdcMint: PublicKey;
  let lstMint: PublicKey;
  let traderLst: PublicKey;
  let collateralPda: PublicKey;
  let escrowPda: PublicKey;
  let escrowAuthorityPda: PublicKey;
  let traderCollateralPda: PublicKey;

  // Mock LST: 9 decimals (typical SPL LST), $3500 price, 95% haircut.
  const LST_DECIMALS = 9;
  const PRICE = 3500_000_000n;             // $3500 with 6-decimal precision
  const HAIRCUT_BPS = 9500n;               // 95%
  const DEPOSIT_LST = 10n * 10n ** 9n;     // 10 LST
  // expected = 10e9 * 3500e6 * 9500 / (1e9 * 10000) = 33_250_000_000 (33,250 USDC at 6dp)
  const EXPECTED_CREDIT = 33_250_000_000n;

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      trader.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    usdcMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6,
    );

    lstMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      LST_DECIMALS,
    );

    traderLst = await createAccount(
      provider.connection,
      trader,
      lstMint,
      trader.publicKey,
    );

    await mintTo(
      provider.connection,
      owner,
      lstMint,
      traderLst,
      owner,
      Number(100n * 10n ** BigInt(LST_DECIMALS)),
    );

    [collateralPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral"), lstMint.toBuffer()],
      cm.programId,
    );
    [escrowAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), lstMint.toBuffer()],
      cm.programId,
    );
    [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), lstMint.toBuffer()],
      cm.programId,
    );
    [traderCollateralPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), lstMint.toBuffer(), trader.publicKey.toBuffer()],
      cm.programId,
    );
  });

  it("initializes perp_vault (USDC custody) — or reuses existing", async () => {
    // perp_vault is a singleton PDA; if 01_perp_vault.ts already initialized
    // it in this validator session, reuse it.
    const existing = await vault.account.vaultConfig
      .fetchNullable(vaultConfigPda);
    if (existing) {
      // Existing vault was initialized with a different USDC mint. Reuse its
      // USDC mint so deposits and CPIs line up.
      usdcMint = existing.usdcMint;
      return;
    }
    await vault.methods
      .initialize(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
      .accounts({
        vaultConfig: vaultConfigPda,
        vaultAuthority: vaultAuthorityPda,
        usdcMint,
        usdcVault: usdcVaultPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  });

  it("initializes collateral_manager", async () => {
    // Pre-fund the CM authority PDA (will pay rent for vault init_if_needed AccountBalance).
    const ftx = await provider.connection.requestAirdrop(
      cmAuthorityPda,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(ftx);

    const existing = await cm.account.collateralManagerConfig
      .fetchNullable(cmConfigPda);
    if (!existing) {
      await cm.methods
        .initialize(
          new anchor.BN(9000),  // liquidation_threshold_bps = 90%
          new anchor.BN(1000),  // max_price_deviation_bps = 10%
        )
        .accounts({
          config: cmConfigPda,
          authority: cmAuthorityPda,
          vaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultCmOperatorPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const cfg = await cm.account.collateralManagerConfig.fetch(cmConfigPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(cfg.liquidationThresholdBps.toNumber(), 9000);
    assert.equal(cfg.vaultProgram.toBase58(), vault.programId.toBase58());
  });

  it("registers CM authority as perp_vault operator", async () => {
    await vault.methods
      .setOperator(cmAuthorityPda, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: vaultCmOperatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const op = await vault.account.operator.fetch(vaultCmOperatorPda);
    assert.isTrue(op.authorized);
  });

  it("adds the LST as collateral", async () => {
    const symbol = Buffer.alloc(16);
    Buffer.from("mockLST").copy(symbol);

    await cm.methods
      .addCollateral(
        Array.from(symbol),
        new anchor.BN(HAIRCUT_BPS.toString()),
        new anchor.BN(PRICE.toString()),
        new anchor.BN(86400),  // max_price_age 24h
        new anchor.BN(0),       // deposit_cap unlimited
      )
      .accounts({
        config: cmConfigPda,
        mint: lstMint,
        collateral: collateralPda,
        escrowAuthority: escrowAuthorityPda,
        escrow: escrowPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const c = await cm.account.collateralConfig.fetch(collateralPda);
    assert.equal(c.haircutBps.toNumber(), Number(HAIRCUT_BPS));
    assert.equal(c.price.toString(), PRICE.toString());
    assert.equal(c.decimals, LST_DECIMALS);
    assert.isTrue(c.active);
  });

  it("deposits 10 LST and credits 33,250 USDC equivalent in vault", async () => {
    await cm.methods
      .deposit(new anchor.BN(DEPOSIT_LST.toString()))
      .accounts({
        config: cmConfigPda,
        collateral: collateralPda,
        mint: lstMint,
        escrow: escrowPda,
        traderToken: traderLst,
        traderCollateral: traderCollateralPda,
        trader: trader.publicKey,
        authority: cmAuthorityPda,
        vaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        vaultOperatorAccount: vaultCmOperatorPda,
        traderBalance: traderVaultBalancePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    // Verify SPL token moved to escrow.
    const escrowAcc = await getAccount(provider.connection, escrowPda);
    assert.equal(escrowAcc.amount.toString(), DEPOSIT_LST.toString());

    // Verify trader_collateral PDA accounting.
    const tc = await cm.account.traderCollateral.fetch(traderCollateralPda);
    assert.equal(tc.amount.toString(), DEPOSIT_LST.toString());
    assert.equal(tc.creditedUsdc.toString(), EXPECTED_CREDIT.toString());
    assert.equal(tc.haircutAtDeposit.toNumber(), Number(HAIRCUT_BPS));
    assert.equal(tc.liquidationThresholdAtDeposit.toNumber(), 9000);

    // Verify perp_vault.collateral_balance got credited.
    const vbal = await vault.account.accountBalance.fetch(traderVaultBalancePda);
    assert.equal(vbal.collateralBalance.toString(), EXPECTED_CREDIT.toString());
    assert.equal(vbal.balance.toNumber(), 0);
  });

  it("withdraws half — debits half the vault credit, returns LST", async () => {
    const HALF = DEPOSIT_LST / 2n;
    const HALF_DEBIT = EXPECTED_CREDIT / 2n;

    const traderLstBefore = (await getAccount(provider.connection, traderLst)).amount;

    await cm.methods
      .withdraw(new anchor.BN(HALF.toString()))
      .accounts({
        config: cmConfigPda,
        collateral: collateralPda,
        mint: lstMint,
        escrow: escrowPda,
        escrowAuthority: escrowAuthorityPda,
        traderToken: traderLst,
        traderCollateral: traderCollateralPda,
        trader: trader.publicKey,
        authority: cmAuthorityPda,
        vaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        vaultOperatorAccount: vaultCmOperatorPda,
        traderBalance: traderVaultBalancePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const tc = await cm.account.traderCollateral.fetch(traderCollateralPda);
    assert.equal(tc.amount.toString(), HALF.toString());
    assert.equal(tc.creditedUsdc.toString(), HALF_DEBIT.toString());

    const vbal = await vault.account.accountBalance.fetch(traderVaultBalancePda);
    assert.equal(vbal.collateralBalance.toString(), HALF_DEBIT.toString());

    const traderLstAfter = (await getAccount(provider.connection, traderLst)).amount;
    assert.equal(
      (traderLstAfter - traderLstBefore).toString(),
      HALF.toString(),
    );

    const escrowAcc = await getAccount(provider.connection, escrowPda);
    assert.equal(escrowAcc.amount.toString(), HALF.toString());
  });

  it("rejects deposit when paused", async () => {
    await cm.methods
      .pause()
      .accounts({ config: cmConfigPda, owner: owner.publicKey })
      .rpc();

    let threw = false;
    try {
      await cm.methods
        .deposit(new anchor.BN(1000))
        .accounts({
          config: cmConfigPda,
          collateral: collateralPda,
          mint: lstMint,
          escrow: escrowPda,
          traderToken: traderLst,
          traderCollateral: traderCollateralPda,
          trader: trader.publicKey,
          authority: cmAuthorityPda,
          vaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultCmOperatorPda,
          traderBalance: traderVaultBalancePda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PausedError|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);

    await cm.methods
      .unpause()
      .accounts({ config: cmConfigPda, owner: owner.publicKey })
      .rpc();
  });

  it("operator can update price (within deviation bound)", async () => {
    const operatorKp = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    const [cmOperatorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
      cm.programId,
    );

    await cm.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        config: cmConfigPda,
        operatorAccount: cmOperatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // 5% bump within 10% deviation cap.
    const NEW_PRICE = (PRICE * 105n) / 100n;
    await cm.methods
      .updatePrice(new anchor.BN(NEW_PRICE.toString()))
      .accounts({
        config: cmConfigPda,
        collateral: collateralPda,
        operatorAccount: cmOperatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const c = await cm.account.collateralConfig.fetch(collateralPda);
    assert.equal(c.price.toString(), NEW_PRICE.toString());
  });
});
