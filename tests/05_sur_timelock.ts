import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SurTimelock } from "../target/types/sur_timelock";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

describe("sur_timelock", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SurTimelock as Program<SurTimelock>;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const guardian = Keypair.generate();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("timelock_config")],
    program.programId,
  );

  const txHash = Buffer.alloc(32, 1);
  const target = Keypair.generate().publicKey;
  const ixHash = Buffer.alloc(32, 2);

  const [queuedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queued_tx"), txHash],
    program.programId,
  );

  const [pausableTargetPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pausable_target"), target.toBuffer()],
    program.programId,
  );

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      guardian.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes with 24h delay", async () => {
    await program.methods
      .initialize(new anchor.BN(24 * 60 * 60))
      .accounts({
        config: configPda,
        guardian: guardian.publicKey,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.timelockConfig.fetch(configPda);
    assert.equal(cfg.delay.toNumber(), 24 * 60 * 60);
    assert.equal(cfg.guardian.toBase58(), guardian.publicKey.toBase58());
  });

  it("queues a transaction", async () => {
    await program.methods
      .queueTransaction(Array.from(txHash), target, Array.from(ixHash))
      .accounts({
        config: configPda,
        queued: queuedPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const q = await program.account.queuedTx.fetch(queuedPda);
    assert.equal(q.target.toBase58(), target.toBase58());
    assert.isAbove(q.eta.toNumber(), 0);
  });

  it("rejects execute before delay", async () => {
    let threw = false;
    try {
      await program.methods
        .executeTransaction()
        .accounts({
          config: configPda,
          queued: queuedPda,
          owner: owner.publicKey,
        })
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /TxNotReady|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw);
  });

  it("cancels the queued tx", async () => {
    await program.methods
      .cancelTransaction()
      .accounts({
        config: configPda,
        queued: queuedPda,
        owner: owner.publicKey,
      })
      .rpc();

    const q = await provider.connection.getAccountInfo(queuedPda);
    assert.isNull(q, "queued PDA should be closed");
  });

  it("registers a pausable target + emergency_pause via guardian", async () => {
    await program.methods
      .setPausableTarget(target, true)
      .accounts({
        config: configPda,
        pausableTarget: pausableTargetPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .emergencyPause()
      .accounts({
        config: configPda,
        pausableTarget: pausableTargetPda,
        guardian: guardian.publicKey,
      })
      .signers([guardian])
      .rpc();

    // No revert — emergency pause emitted event successfully
    const pt = await program.account.pausableTarget.fetch(pausableTargetPda);
    assert.isTrue(pt.status);
  });

  it("rejects emergency_pause from non-guardian", async () => {
    let threw = false;
    try {
      await program.methods
        .emergencyPause()
        .accounts({
          config: configPda,
          pausableTarget: pausableTargetPda,
          guardian: owner.publicKey, // not the registered guardian
        })
        .rpc();
    } catch (e) {
      threw = true;
    }
    assert.isTrue(threw);
  });
});
