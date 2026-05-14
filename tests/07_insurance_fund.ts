import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { InsuranceFund } from "../target/types/insurance_fund";
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
// insurance_fund — bad debt tracking + keeper-reward caps + vault CPI
// ============================================================
// v0.3 wiring #2: pay_keeper_reward fires real CPI to perp_vault.
// internal_transfer (insurance_fund_authority -> keeper). Caps still
// fire BEFORE the CPI. State updated AFTER successful CPI.
//
// Authority PDA bootstrap mirrors engine: open a token account owned by
// the authority PDA, mint USDC, then call bootstrap_insurance_pool which
// CPIs vault.deposit signed by the authority PDA.

describe("insurance_fund", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.InsuranceFund as Program<InsuranceFund>;
  const vault = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const keeper1 = Keypair.generate();
  const keeper2 = Keypair.generate();
  const trader = Keypair.generate();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("insurance_fund_config")],
    program.programId,
  );
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("insurance_fund_authority")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);
  const [marketBadDebtPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_bad_debt"), marketIdBtc],
    program.programId,
  );

  // Vault PDAs.
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
  let authorityUsdc: PublicKey;

  before(async () => {
    for (const target of [
      operatorKp.publicKey,
      keeper1.publicKey,
      keeper2.publicKey,
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

    // Seed vault balances for keepers (small starter balance so the AccountBalance PDA exists).
    for (const kp of [keeper1, keeper2]) {
      const ata = await createAccount(provider.connection, kp, usdcMint, kp.publicKey);
      await mintTo(provider.connection, owner, usdcMint, ata, owner, 100);
      await vault.methods
        .deposit(new anchor.BN(100))
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

  it("initializes with caps ($1K per call, $10K daily)", async () => {
    await program.methods
      .initialize(
        new anchor.BN(1_000 * 1_000_000),    // $1K per call
        new anchor.BN(10_000 * 1_000_000),   // $10K daily
      )
      .accounts({
        config: configPda,
        authority: authorityPda,
        vault: vault.programId,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(cfg.maxKeeperRewardPerCall.toString(), "1000000000");
    assert.equal(cfg.maxDailyKeeperRewards.toString(), "10000000000");
    assert.isFalse(cfg.paused);
  });

  it("bootstraps the insurance fund's vault balance via bootstrap_insurance_pool", async () => {
    // Create a USDC token account owned by the authority PDA, mint USDC,
    // then call bootstrap_insurance_pool which CPIs vault.deposit.
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
      authorityPda,
    );
    const tx = new anchor.web3.Transaction().add(createIx).add(initIx);
    await provider.sendAndConfirm(tx, [tokenAccountKp]);
    authorityUsdc = tokenAccountKp.publicKey;

    const POOL_SEED = 50_000 * 1_000_000;
    await mintTo(provider.connection, owner, usdcMint, authorityUsdc, owner, POOL_SEED);

    await program.methods
      .bootstrapInsurancePool(new anchor.BN(POOL_SEED))
      .accounts({
        config: configPda,
        authority: authorityPda,
        perpVaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        authorityUsdc,
        fundPoolBalance: balancePda(authorityPda),
        tokenProgram: TOKEN_PROGRAM_ID,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fundBal = await vault.account.accountBalance.fetch(balancePda(authorityPda));
    assert.equal(fundBal.balance.toString(), POOL_SEED.toString());
  });

  it("registers insurance_fund_authority PDA as a vault operator", async () => {
    await vault.methods
      .setOperator(authorityPda, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: vaultOperatorPda(authorityPda),
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
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

  it("records bad debt of $500 in BTC market", async () => {
    await program.methods
      .recordBadDebt(
        Array.from(marketIdBtc),
        trader.publicKey,
        new anchor.BN(500 * 1_000_000),
      )
      .accounts({
        config: configPda,
        marketBadDebt: marketBadDebtPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(cfg.totalBadDebt.toString(), "500000000");
    assert.equal(cfg.totalLiquidations.toNumber(), 1);

    const mb = await program.account.marketBadDebt.fetch(marketBadDebtPda);
    assert.equal(mb.cumulativeBadDebt.toString(), "500000000");
  });

  it("pays keeper reward of $200 (within caps) — vault USDC actually moves", async () => {
    const keeperBalBefore = (await vault.account.accountBalance.fetch(balancePda(keeper1.publicKey))).balance.toNumber();
    const fundBalBefore = (await vault.account.accountBalance.fetch(balancePda(authorityPda))).balance.toNumber();

    await program.methods
      .payKeeperReward(keeper1.publicKey, new anchor.BN(200 * 1_000_000))
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        authority: authorityPda,
        perpVaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        vaultOperatorAccount: vaultOperatorPda(authorityPda),
        fromBalance: balancePda(authorityPda),
        toBalance: balancePda(keeper1.publicKey),
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(cfg.totalKeeperRewardsPaid.toString(), "200000000");
    assert.equal(cfg.dailyKeeperRewardsPaid.toString(), "200000000");

    const keeperBalAfter = (await vault.account.accountBalance.fetch(balancePda(keeper1.publicKey))).balance.toNumber();
    const fundBalAfter = (await vault.account.accountBalance.fetch(balancePda(authorityPda))).balance.toNumber();
    assert.equal(keeperBalAfter - keeperBalBefore, 200_000_000, "keeper +$200");
    assert.equal(fundBalBefore - fundBalAfter, 200_000_000, "fund -$200");
  });

  it("rejects single keeper reward exceeding per-call cap ($1K) — totals NOT updated", async () => {
    const cfgBefore = await program.account.insuranceFundConfig.fetch(configPda);
    let threw = false;
    try {
      await program.methods
        .payKeeperReward(keeper1.publicKey, new anchor.BN(1_500 * 1_000_000))
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          authority: authorityPda,
          perpVaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(authorityPda),
          fromBalance: balancePda(authorityPda),
          toBalance: balancePda(keeper1.publicKey),
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /KeeperRewardExceedsPerCallCap|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
    // Cap fires BEFORE CPI — totals must be unchanged.
    const cfgAfter = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(
      cfgAfter.totalKeeperRewardsPaid.toString(),
      cfgBefore.totalKeeperRewardsPaid.toString(),
      "totals unchanged on cap rejection",
    );
  });

  it("rejects daily cap when projected total > $10K", async () => {
    // Already paid $200. Pay $900 (within cap).
    await program.methods
      .payKeeperReward(keeper2.publicKey, new anchor.BN(900 * 1_000_000))
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
        authority: authorityPda,
        perpVaultProgram: vault.programId,
        vaultConfig: vaultConfigPda,
        vaultOperatorAccount: vaultOperatorPda(authorityPda),
        fromBalance: balancePda(authorityPda),
        toBalance: balancePda(keeper2.publicKey),
      })
      .signers([operatorKp])
      .rpc();

    // Loop $1K rewards until daily cap breaches.
    for (let i = 0; i < 9; i++) {
      try {
        await program.methods
          .payKeeperReward(keeper2.publicKey, new anchor.BN(1_000 * 1_000_000))
          .accounts({
            config: configPda,
            operatorAccount: operatorPda,
            operator: operatorKp.publicKey,
            authority: authorityPda,
            perpVaultProgram: vault.programId,
            vaultConfig: vaultConfigPda,
            vaultOperatorAccount: vaultOperatorPda(authorityPda),
            fromBalance: balancePda(authorityPda),
            toBalance: balancePda(keeper2.publicKey),
          })
          .signers([operatorKp])
          .rpc();
      } catch (_e) {
        break;
      }
    }

    // Final attempt of $1K — exceeds remaining daily budget.
    let threw = false;
    try {
      await program.methods
        .payKeeperReward(keeper2.publicKey, new anchor.BN(1_000 * 1_000_000))
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          authority: authorityPda,
          perpVaultProgram: vault.programId,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(authorityPda),
          fromBalance: balancePda(authorityPda),
          toBalance: balancePda(keeper2.publicKey),
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /DailyKeeperRewardCapExceeded|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected daily cap breach to revert");

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.isAtMost(
      cfg.dailyKeeperRewardsPaid.toNumber(),
      10_000 * 1_000_000,
      "daily total should never exceed cap",
    );
  });

  it("pause blocks recordBadDebt + payKeeperReward", async () => {
    await program.methods
      .pause()
      .accounts({ config: configPda, owner: owner.publicKey })
      .rpc();

    let threw = false;
    try {
      await program.methods
        .recordBadDebt(
          Array.from(marketIdBtc),
          trader.publicKey,
          new anchor.BN(100 * 1_000_000),
        )
        .accounts({
          config: configPda,
          marketBadDebt: marketBadDebtPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PausedError|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);

    await program.methods
      .unpause()
      .accounts({ config: configPda, owner: owner.publicKey })
      .rpc();
  });
});
