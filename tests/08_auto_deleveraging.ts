import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AutoDeleveraging } from "../target/types/auto_deleveraging";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ============================================================
// auto_deleveraging — ADL state tracking + cooldown
// ============================================================
// v0.2.3 ships state validation. Real engine.open_position CPI lands v0.3.

describe("auto_deleveraging", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AutoDeleveraging as Program<AutoDeleveraging>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const operatorKp = Keypair.generate();
  const profitableTrader = Keypair.generate();
  const enginePlaceholder = Keypair.generate().publicKey;
  const vaultPlaceholder = Keypair.generate().publicKey;
  const insurancePlaceholder = Keypair.generate().publicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adl_config")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );

  const marketIdBtc = Buffer.alloc(32);
  Buffer.from("BTC-USD").copy(marketIdBtc);

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      operatorKp.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes with $1K threshold + 0s cooldown for testing", async () => {
    await program.methods
      .initialize(
        new anchor.BN(1_000 * 1_000_000),  // min_bad_debt_threshold = $1K
        new anchor.BN(0),                   // cooldown 0 for tests
      )
      .accounts({
        config: configPda,
        perpEngine: enginePlaceholder,
        perpVault: vaultPlaceholder,
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
          new anchor.BN(1 * 100_000_000),    // position_size = +1 BTC long
          new anchor.BN(50_000_000),         // reduce_size 0.5 BTC
          new anchor.BN(50_000 * 1_000_000), // mark $50K
          new anchor.BN(2_000 * 1_000_000),  // bad_debt $2K
          new anchor.BN(5_000 * 1_000_000),  // fund $5K (healthy)
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
        })
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
          new anchor.BN(50_000 * 1_000_000),
          new anchor.BN(500 * 1_000_000),   // bad_debt $500 < $1K threshold
          new anchor.BN(0),                  // fund depleted
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
        })
        .signers([operatorKp])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /BadDebtBelowThreshold|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
  });

  it("executes ADL successfully when fund depleted + bad debt > threshold", async () => {
    await program.methods
      .executeAdl(
        Array.from(marketIdBtc),
        profitableTrader.publicKey,
        new anchor.BN(1 * 100_000_000),
        new anchor.BN(50_000_000),
        new anchor.BN(50_000 * 1_000_000),
        new anchor.BN(2_000 * 1_000_000),  // bad_debt $2K > $1K threshold
        new anchor.BN(0),                   // fund depleted
      )
      .accounts({
        config: configPda,
        operatorAccount: operatorPda,
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const cfg = await program.account.adlConfig.fetch(configPda);
    assert.equal(cfg.totalAdlEvents.toNumber(), 1);
    assert.equal(cfg.totalBadDebtCovered.toString(), "2000000000");
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
          new anchor.BN(1 * 100_000_000),
          new anchor.BN(50_000_000),
          new anchor.BN(50_000 * 1_000_000),
          new anchor.BN(2_000 * 1_000_000),
          new anchor.BN(0),
        )
        .accounts({
          config: configPda,
          operatorAccount: operatorPda,
          operator: operatorKp.publicKey,
        })
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
