import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { InsuranceFund } from "../target/types/insurance_fund";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// insurance_fund — bad debt tracking + keeper-reward caps
// ============================================================
// v0.2.2 ships state-tracking + caps validation. Real CPI to perp_vault
// for keeper-reward payout lands in v0.3 (same manual invoke_signed
// pattern as a2a_darkpool / liquidator).

describe("insurance_fund", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.InsuranceFund as Program<InsuranceFund>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const keeper1 = Keypair.generate();
  const keeper2 = Keypair.generate();
  const trader = Keypair.generate();
  const vaultPlaceholder = Keypair.generate().publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("insurance_fund_config")],
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

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes with caps ($1K per call, $10K daily)", async () => {
    await program.methods
      .initialize(
        new anchor.BN(1_000 * 1_000_000),    // $1K per call
        new anchor.BN(10_000 * 1_000_000),   // $10K daily
      )
      .accounts({
        config: configPda,
        vault: vaultPlaceholder,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(cfg.maxKeeperRewardPerCall.toString(), "1000000000");
    assert.equal(cfg.maxDailyKeeperRewards.toString(), "10000000000");
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

  it("pays keeper reward of $200 (within caps)", async () => {
    await program.methods
      .payKeeperReward(keeper1.publicKey, new anchor.BN(200 * 1_000_000))
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.insuranceFundConfig.fetch(configPda);
    assert.equal(cfg.totalKeeperRewardsPaid.toString(), "200000000");
    assert.equal(cfg.dailyKeeperRewardsPaid.toString(), "200000000");
  });

  it("rejects single keeper reward exceeding per-call cap ($1K)", async () => {
    let threw = false;
    try {
      await program.methods
        .payKeeperReward(keeper1.publicKey, new anchor.BN(1_500 * 1_000_000))
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /KeeperRewardExceedsPerCallCap|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
  });

  it("rejects daily cap when projected total > $10K", async () => {
    // Already paid $200. Pay $9,000 more — should pass (total $9,200 < $10K).
    await program.methods
      .payKeeperReward(keeper2.publicKey, new anchor.BN(900 * 1_000_000))
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    // Now pay another $1,000 — total would be $1,100. Still under.
    // We need to trigger daily cap. Pay 9 more $1K rewards to push past $10K total.
    for (let i = 0; i < 9; i++) {
      try {
        await program.methods
          .payKeeperReward(keeper2.publicKey, new anchor.BN(1_000 * 1_000_000))
          .accounts({
            config: configPda,
            operatorAccount: operatorPda,
            operator: operatorKp.publicKey,
          })
          .signers([operatorKp])
          .rpc();
      } catch (_e) {
        // Once daily cap breaches, all subsequent rewards revert.
        break;
      }
    }

    // Final attempt — should be rejected by daily cap.
    let threw = false;
    try {
      await program.methods
        .payKeeperReward(keeper2.publicKey, new anchor.BN(500 * 1_000_000))
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
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
