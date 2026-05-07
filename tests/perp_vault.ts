import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// ============================================================
// perp_vault — happy-path integration test
// ============================================================
// Mirrors the upstream Foundry tests for PerpVault.sol but using SPL Token
// for USDC custody instead of ERC-20 transferFrom.

describe("perp_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpVault as Program<PerpVault>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const trader1 = Keypair.generate();
  const trader2 = Keypair.generate();
  const operatorKp = Keypair.generate();

  let usdcMint: PublicKey;
  let trader1Usdc: PublicKey;
  let trader2Usdc: PublicKey;

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId,
  );
  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    program.programId,
  );
  const [usdcVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdc_vault")],
    program.programId,
  );
  const [operatorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operatorKp.publicKey.toBuffer()],
    program.programId,
  );
  const balancePda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), trader.toBuffer()],
      program.programId,
    )[0];

  const TEN_USDC = 10_000_000n; // USDC has 6 decimals

  before(async () => {
    for (const kp of [trader1, trader2, operatorKp]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    usdcMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6,
    );

    trader1Usdc = await createAccount(
      provider.connection,
      trader1,
      usdcMint,
      trader1.publicKey,
    );
    trader2Usdc = await createAccount(
      provider.connection,
      trader2,
      usdcMint,
      trader2.publicKey,
    );

    await mintTo(
      provider.connection,
      owner,
      usdcMint,
      trader1Usdc,
      owner,
      Number(100n * TEN_USDC),
    );
    await mintTo(
      provider.connection,
      owner,
      usdcMint,
      trader2Usdc,
      owner,
      Number(100n * TEN_USDC),
    );
  });

  it("initializes the vault", async () => {
    await program.methods
      .initialize(
        new anchor.BN(0),     // deposit_cap = unlimited
        new anchor.BN(0),     // max_withdrawal = unlimited
        new anchor.BN(0),     // max_op_transfer = unlimited
      )
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

    const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
    assert.equal(cfg.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(cfg.usdcMint.toBase58(), usdcMint.toBase58());
    assert.equal(cfg.totalDeposits.toNumber(), 0);
    assert.isFalse(cfg.paused);
  });

  it("trader1 deposits 50 USDC", async () => {
    const amount = new anchor.BN(50_000_000); // 50 USDC

    await program.methods
      .deposit(amount)
      .accounts({
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        userUsdc: trader1Usdc,
        accountBalance: balancePda(trader1.publicKey),
        depositor: trader1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    const bal = await program.account.accountBalance.fetch(
      balancePda(trader1.publicKey),
    );
    assert.equal(bal.balance.toNumber(), 50_000_000);

    const vaultUsdc = await getAccount(provider.connection, usdcVaultPda);
    assert.equal(vaultUsdc.amount.toString(), "50000000");
  });

  it("trader1 withdraws 20 USDC", async () => {
    const amount = new anchor.BN(20_000_000);

    await program.methods
      .withdraw(amount)
      .accounts({
        vaultConfig: vaultConfigPda,
        vaultAuthority: vaultAuthorityPda,
        usdcVault: usdcVaultPda,
        userUsdc: trader1Usdc,
        accountBalance: balancePda(trader1.publicKey),
        withdrawer: trader1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader1])
      .rpc();

    const bal = await program.account.accountBalance.fetch(
      balancePda(trader1.publicKey),
    );
    assert.equal(bal.balance.toNumber(), 30_000_000);
  });

  it("owner authorizes operator", async () => {
    await program.methods
      .setOperator(operatorKp.publicKey, true)
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: operatorPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const op = await program.account.operator.fetch(operatorPda);
    assert.isTrue(op.authorized);
  });

  it("trader2 deposits 30 USDC (so transfer has a destination)", async () => {
    await program.methods
      .deposit(new anchor.BN(30_000_000))
      .accounts({
        vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda,
        userUsdc: trader2Usdc,
        accountBalance: balancePda(trader2.publicKey),
        depositor: trader2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader2])
      .rpc();
  });

  it("operator does internalTransfer of 10 USDC trader1 -> trader2", async () => {
    await program.methods
      .internalTransfer(new anchor.BN(10_000_000))
      .accounts({
        vaultConfig: vaultConfigPda,
        operatorAccount: operatorPda,
        fromBalance: balancePda(trader1.publicKey),
        toBalance: balancePda(trader2.publicKey),
        operator: operatorKp.publicKey,
      })
      .signers([operatorKp])
      .rpc();

    const fromBal = await program.account.accountBalance.fetch(
      balancePda(trader1.publicKey),
    );
    const toBal = await program.account.accountBalance.fetch(
      balancePda(trader2.publicKey),
    );
    assert.equal(fromBal.balance.toNumber(), 20_000_000); // 30 - 10
    assert.equal(toBal.balance.toNumber(), 40_000_000); // 30 + 10
  });

  it("rejects deposit when paused", async () => {
    await program.methods
      .pause()
      .accounts({
        vaultConfig: vaultConfigPda,
        owner: owner.publicKey,
      })
      .rpc();

    let threw = false;
    try {
      await program.methods
        .deposit(new anchor.BN(1_000_000))
        .accounts({
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          userUsdc: trader1Usdc,
          accountBalance: balancePda(trader1.publicKey),
          depositor: trader1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader1])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(e.toString(), /PausedError|0x[0-9a-f]+/i);
    }
    assert.isTrue(threw, "expected deposit to revert when paused");

    await program.methods
      .unpause()
      .accounts({
        vaultConfig: vaultConfigPda,
        owner: owner.publicKey,
      })
      .rpc();
  });

  it("rejects internalTransfer from unauthorized signer", async () => {
    let threw = false;
    try {
      await program.methods
        .internalTransfer(new anchor.BN(1_000_000))
        .accounts({
          vaultConfig: vaultConfigPda,
          operatorAccount: operatorPda,
          fromBalance: balancePda(trader1.publicKey),
          toBalance: balancePda(trader2.publicKey),
          operator: trader1.publicKey, // NOT the operator
        })
        .signers([trader1])
        .rpc();
    } catch (e) {
      threw = true;
    }
    assert.isTrue(threw, "expected internalTransfer to revert with non-operator signer");
  });
});
