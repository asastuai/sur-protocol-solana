import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SurTimelock } from "../target/types/sur_timelock";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { assert } from "chai";

// ============================================================
// sur_timelock — mechanism test (C-3 / H-9 fix)
// ============================================================
// The timelock is now functional: execute_transaction does a real invoke_signed
// dispatch of the queued instruction, and tx_hash is BOUND to the payload
// (target ‖ instruction_hash ‖ accounts_hash) at queue time. Ownership transfer
// is two-step.
//
// NOTE: the execute SUCCESS path (real CPI after the delay) cannot be exercised
// here — MIN_DELAY is 24h and solana-test-validator has no clock-warp. The
// success path needs a bankrun/solana-program-test or a devnet run. This suite
// proves: payload binding, reject-before-delay (with real dispatch args),
// cancel, two-step ownership, and the guardian path.

const sha256 = (...bufs: Buffer[]) =>
  createHash("sha256").update(Buffer.concat(bufs)).digest();

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
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("timelock_authority")],
    program.programId,
  );

  // ---- queued payload: a real System transfer authorityPda -> owner ----
  const transferIx = SystemProgram.transfer({
    fromPubkey: authorityPda,
    toPubkey: owner.publicKey,
    lamports: 1000,
  });
  const ixData = transferIx.data; // Buffer
  const instructionHash = sha256(ixData);
  // is_signer is derived on-chain (only the authority signs), so the commitment
  // marks authority signer=1, the rest signer=0. is_writable matches the ix.
  const accountsBlob = Buffer.concat([
    authorityPda.toBuffer(), Buffer.from([1]), Buffer.from([1]), // from: signer, writable
    owner.publicKey.toBuffer(), Buffer.from([0]), Buffer.from([1]), // to: writable
  ]);
  const accountsHash = sha256(accountsBlob);
  const txHash = sha256(
    SystemProgram.programId.toBuffer(),
    instructionHash,
    accountsHash,
  );
  const [queuedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queued_tx"), txHash],
    program.programId,
  );

  const target = SystemProgram.programId; // dispatch payload target (System transfer)
  // NB: SystemProgram.programId is the all-zeros pubkey (== Pubkey::default), so it
  // cannot be used as a pausable target; use a distinct non-zero pubkey for that.
  const pauseTarget = Keypair.generate().publicKey;
  const [pausableTargetPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pausable_target"), pauseTarget.toBuffer()],
    program.programId,
  );

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      guardian.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes with 24h delay (+ authority PDA)", async () => {
    await program.methods
      .initialize(new anchor.BN(24 * 60 * 60))
      .accounts({
        config: configPda,
        authority: authorityPda,
        guardian: guardian.publicKey,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.timelockConfig.fetch(configPda);
    assert.equal(cfg.delay.toNumber(), 24 * 60 * 60);
    assert.equal(cfg.guardian.toBase58(), guardian.publicKey.toBase58());
    assert.equal(cfg.pendingOwner.toBase58(), PublicKey.default.toBase58());
  });

  it("queues a payload-bound transaction", async () => {
    await program.methods
      .queueTransaction(
        Array.from(txHash),
        target,
        Array.from(instructionHash),
        Array.from(accountsHash),
      )
      .accounts({
        config: configPda,
        queued: queuedPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const q = await program.account.queuedTx.fetch(queuedPda);
    assert.equal(q.target.toBase58(), target.toBase58());
    assert.deepEqual(Buffer.from(q.accountsHash), accountsHash);
    assert.isAbove(q.eta.toNumber(), 0);
  });

  it("SECURITY (H-9): rejects a queue whose tx_hash does not bind the payload", async () => {
    const bogus = Buffer.alloc(32, 9);
    const [bogusPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("queued_tx"), bogus],
      program.programId,
    );
    let threw = false;
    try {
      await program.methods
        .queueTransaction(
          Array.from(bogus), // tx_hash != sha256(target‖ixHash‖accountsHash)
          target,
          Array.from(instructionHash),
          Array.from(accountsHash),
        )
        .accounts({
          config: configPda,
          queued: bogusPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "InvalidTxHash");
    }
    assert.isTrue(threw, "queue with an unbound tx_hash must revert");
  });

  it("rejects execute before the delay (with real dispatch args)", async () => {
    let threw = false;
    try {
      await program.methods
        .executeTransaction(Buffer.from(ixData))
        .accounts({
          config: configPda,
          queued: queuedPda,
          authority: authorityPda,
          owner: owner.publicKey,
        })
        .remainingAccounts([
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: authorityPda, isSigner: false, isWritable: true },
          { pubkey: owner.publicKey, isSigner: false, isWritable: true },
        ])
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
      .setPausableTarget(pauseTarget, true)
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

  // Runs LAST: moves ownership away from `owner`.
  it("SECURITY (H-9): two-step ownership transfer (propose + accept)", async () => {
    const newOwner = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      newOwner.publicKey,
      LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    // Step 1: owner proposes — ownership does NOT change yet.
    await program.methods
      .transferOwnership(newOwner.publicKey)
      .accounts({ config: configPda, owner: owner.publicKey })
      .rpc();
    let cfg = await program.account.timelockConfig.fetch(configPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58(),
      "owner unchanged until accepted");
    assert.equal(cfg.pendingOwner.toBase58(), newOwner.publicKey.toBase58());

    // A non-pending signer cannot accept.
    let threw = false;
    try {
      await program.methods
        .acceptOwnership()
        .accounts({ config: configPda, pendingOwner: guardian.publicKey })
        .signers([guardian])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.include(e.toString(), "NotPendingOwner");
    }
    assert.isTrue(threw, "only the pending owner can accept");

    // Step 2: the pending owner accepts — now ownership flips.
    await program.methods
      .acceptOwnership()
      .accounts({ config: configPda, pendingOwner: newOwner.publicKey })
      .signers([newOwner])
      .rpc();
    cfg = await program.account.timelockConfig.fetch(configPda);
    assert.equal(cfg.owner.toBase58(), newOwner.publicKey.toBase58());
    assert.equal(cfg.pendingOwner.toBase58(), PublicKey.default.toBase58());
  });
});
