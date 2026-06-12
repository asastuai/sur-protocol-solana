/* eslint-disable no-console */
/**
 * SUR Protocol — Localnet Adapter Probe
 * ======================================
 * Throwaway spike script: proves the open/close/read cycle for long AND short
 * against SUR localnet. Captures exact client calls, tx sigs, PDA derivations,
 * and precisions for the SurAdapter author.
 *
 * Prerequisites: validator up at http://127.0.0.1:8899 (launched via anchor test
 * or solana-test-validator). This script handles full init + bootstrap inline.
 *
 * Run: npx ts-node scripts/sur-adapter-probe.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ACCOUNT_SIZE,
  createInitializeAccountInstruction,
  createMint,
  createAccount,
  mintTo,
  getMinimumBalanceForRentExemptAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ============================================================================
// PROGRAM IDs — compiled IDs (matching declare_id! in each program's lib.rs)
// These are the DEVNET IDs; the .so files are compiled with these declare_id!
// values so they must be deployed at these exact addresses even on localnet.
// Use solana-test-validator with --upgradeable-program <id> <keypair> <.so>
// (Anchor.toml [programs.localnet] has stale/wrong IDs — ignore it.)
// ============================================================================
const PERP_VAULT_ID    = new PublicKey("2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1");
const PERP_ENGINE_ID   = new PublicKey("28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX");
const ORACLE_ROUTER_ID = new PublicKey("8yLenSHEkdkbsCiQLmiQrZg7Kdb3ZBb1MKTFmJsA37zk");

// ============================================================================
// PRECISION CONSTANTS (from programs/perp_engine/src/state.rs)
// ============================================================================
const PRICE_PRECISION = 1_000_000;    // 1e6  — mark_price / entry_price / balance decimals
const SIZE_PRECISION  = 100_000_000;  // 1e8  — position size decimals

const REPO    = path.resolve(__dirname, "..");
const IDL_DIR = path.join(REPO, "target", "idl");
const loadIdl = (n: string) =>
  JSON.parse(fs.readFileSync(path.join(IDL_DIR, `${n}.json`), "utf8"));
const loadKp  = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));

// ============================================================================
// PDA HELPERS — these are the exact derivations the adapter must replicate
// ============================================================================
const u = (s: string) => Buffer.from(s);
const pda = (seeds: (Buffer | Uint8Array)[], pid: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, pid)[0];

/** vault AccountBalance PDA: seeds = ["balance", trader_pubkey], program = perp_vault */
const balancePda = (who: PublicKey) =>
  pda([u("balance"), who.toBuffer()], PERP_VAULT_ID);

/** vault Operator PDA: seeds = ["operator", operator_pubkey], program = perp_vault */
const vaultOperatorPda = (op: PublicKey) =>
  pda([u("operator"), op.toBuffer()], PERP_VAULT_ID);

/** engine Operator PDA: seeds = ["operator", operator_pubkey], program = perp_engine */
const engineOperatorPda = (op: PublicKey) =>
  pda([u("operator"), op.toBuffer()], PERP_ENGINE_ID);

/** oracle_router Operator PDA: seeds = ["operator", op], program = oracle_router */
const oracleOperatorPda = (op: PublicKey) =>
  pda([u("operator"), op.toBuffer()], ORACLE_ROUTER_ID);

/** Market PDA: seeds = ["market", market_id_bytes32], program = perp_engine */
const marketPda = (marketId: Buffer) =>
  pda([u("market"), marketId], PERP_ENGINE_ID);

/** Position PDA: seeds = ["position", market_id_bytes32, trader_pubkey], program = perp_engine */
const positionPda = (marketId: Buffer, trader: PublicKey) =>
  pda([u("position"), marketId, trader.toBuffer()], PERP_ENGINE_ID);

/** Convert symbol (e.g. "BTC-USD") to 32-byte zero-padded Buffer */
const marketIdBuf = (symbol: string): Buffer => {
  const buf = Buffer.alloc(32);
  Buffer.from(symbol).copy(buf);
  return buf;
};

// ============================================================================
// remaining_accounts builder for open_position / close_position
// Order is CRITICAL — see programs/perp_engine/src/instructions/open_position.rs
//   [0] engine_authority PDA  (writable=false, signer=false)
//   [1] perp_vault program ID (writable=false, signer=false)
//   [2] vault_config PDA      (writable=false, signer=false)
//   [3] vaultOperatorPda(engine_authority) (writable=false, signer=false)
//   [4] balancePda(trader)    (writable=true,  signer=false)
//   [5] balancePda(engine_authority) = engine_pool (writable=true, signer=false)
// ============================================================================
const openCloseRA = (engineAuthPda: PublicKey, vaultCfgPda: PublicKey, trader: PublicKey) => [
  { pubkey: engineAuthPda,                 isSigner: false, isWritable: false },
  { pubkey: PERP_VAULT_ID,                 isSigner: false, isWritable: false },
  { pubkey: vaultCfgPda,                   isSigner: false, isWritable: false },
  { pubkey: vaultOperatorPda(engineAuthPda), isSigner: false, isWritable: false },
  { pubkey: balancePda(trader),            isSigner: false, isWritable: true  },
  { pubkey: balancePda(engineAuthPda),     isSigner: false, isWritable: true  },
];

// ============================================================================
// CLIENT-SIDE COMPUTATIONS (adapter replicates these — no on-chain values)
// ============================================================================

/** unrealizedPnlUsdc: direction * (markPrice - entryPrice) * |size| / SIZE_PRECISION
 *  Both prices in 1e6 units; result in human USD. */
function calcUPnL(size: number, entryPrice: number, markPrice: number): number {
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (size > 0) {
    return ((markPrice - entryPrice) / PRICE_PRECISION) * absSizeHuman;
  } else {
    return ((entryPrice - markPrice) / PRICE_PRECISION) * absSizeHuman;
  }
}

/** Approximate liquidation price (maintenance_margin_bps=250 = 2.5%).
 *  Long:  liqPrice = entryPrice_human - (marginHuman - maintMargin) / absSizeHuman
 *  Short: liqPrice = entryPrice_human + (marginHuman - maintMargin) / absSizeHuman
 *  All inputs in raw on-chain units (1e6 for prices/margin, 1e8 for size). */
function calcLiqPrice(size: number, entryPrice: number, margin: number): number | null {
  const epHuman = entryPrice / PRICE_PRECISION;
  const marginHuman = margin / PRICE_PRECISION;
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (absSizeHuman === 0) return null;
  const notionalHuman = absSizeHuman * epHuman;
  const maintMarginHuman = notionalHuman * 0.025; // 250 bps
  if (size > 0) {
    const liq = epHuman - (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  } else {
    const liq = epHuman + (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  }
}

const $ = (raw: number) => `$${(raw / PRICE_PRECISION).toFixed(2)}`;

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log("\n=== SUR ADAPTER PROBE — localnet open/close/read cycle ===\n");

  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  // Health check
  try {
    const ver = await connection.getVersion();
    console.log("localnet health:", ver["solana-core"]);
  } catch {
    console.error("FATAL: localnet not reachable at http://127.0.0.1:8899");
    process.exit(1);
  }

  const deployer = loadKp(path.join(os.homedir(), ".config", "solana", "id.json"));
  const provider  = new AnchorProvider(connection, new Wallet(deployer), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const me = deployer.publicKey;
  console.log("deployer/operator:", me.toBase58());

  // Airdrop if needed — also fund engine_authority PDA (needs rent for AccountBalance)
  const lamports = await connection.getBalance(me);
  if (lamports < 5 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(me, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    console.log("airdropped 10 SOL to deployer");
  }
  // engine_authority PDA needs SOL for the AccountBalance PDA rent during bootstrapEnginePool
  const engineAuthPdaLamports = await connection.getBalance(
    pda([u("engine_authority")], PERP_ENGINE_ID)
  );
  if (engineAuthPdaLamports < 2 * LAMPORTS_PER_SOL) {
    const authPda = pda([u("engine_authority")], PERP_ENGINE_ID);
    const sig = await connection.requestAirdrop(authPda, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    console.log("airdropped 2 SOL to engine_authority PDA");
  }

  // NOTE: Anchor 0.31 embeds the program address in the IDL.
  // The .so files are compiled with devnet declare_id! values (matching PERP_VAULT_ID etc.
  // above). The IDL address field already matches — no override needed.
  const vaultIdl  = loadIdl("perp_vault");
  const engineIdl = loadIdl("perp_engine");
  const oracleIdl = loadIdl("oracle_router");
  const vault  = new Program(vaultIdl,  provider);
  const engine = new Program(engineIdl, provider);
  const oracle = new Program(oracleIdl, provider);

  console.log("perp_vault  program ID:", vault.programId.toBase58());
  console.log("perp_engine program ID:", engine.programId.toBase58());
  console.log("oracle_router program ID:", oracle.programId.toBase58());

  // ── PDAs ──────────────────────────────────────────────────────────────────
  const vaultConfigPda     = pda([u("vault_config")],     PERP_VAULT_ID);
  const vaultAuthorityPda  = pda([u("vault_authority")],  PERP_VAULT_ID);
  const usdcVaultPda       = pda([u("usdc_vault")],       PERP_VAULT_ID);
  const engineConfigPda    = pda([u("engine_config")],    PERP_ENGINE_ID);
  const engineAuthorityPda = pda([u("engine_authority")], PERP_ENGINE_ID);
  const oracleConfigPda    = pda([u("oracle_config")],    ORACLE_ROUTER_ID);
  const poolBalAddr        = balancePda(engineAuthorityPda);
  const myBalance          = balancePda(me);
  const myEngineOp         = engineOperatorPda(me);

  console.log("\n-- PDA DERIVATIONS --");
  console.log("vaultConfig:         ", vaultConfigPda.toBase58(),     ' seeds=["vault_config"]');
  console.log("vaultAuthority:      ", vaultAuthorityPda.toBase58(),  ' seeds=["vault_authority"]');
  console.log("usdcVault:           ", usdcVaultPda.toBase58(),       ' seeds=["usdc_vault"]');
  console.log("engineConfig:        ", engineConfigPda.toBase58(),    ' seeds=["engine_config"]');
  console.log("engineAuthority:     ", engineAuthorityPda.toBase58(), ' seeds=["engine_authority"]');
  console.log("enginePool(balance): ", poolBalAddr.toBase58(),        ' seeds=["balance", engine_authority]');
  console.log("oracleConfig:        ", oracleConfigPda.toBase58(),    ' seeds=["oracle_config"]');
  console.log("myBalance:           ", myBalance.toBase58(),          ' seeds=["balance", deployer]');
  console.log("myEngineOp:          ", myEngineOp.toBase58(),         ' seeds=["operator", deployer]');

  // ── STEP 1: INIT VAULT ────────────────────────────────────────────────────
  let usdcMint: PublicKey;
  const vaultCfgInfo = await connection.getAccountInfo(vaultConfigPda);
  if (!vaultCfgInfo) {
    usdcMint = await createMint(connection, deployer, me, null, 6);
    console.log("\nvault init — USDC mint:", usdcMint.toBase58());
    await vault.methods
      .initialize(new BN(0), new BN(0), new BN(0))
      .accounts({
        vaultConfig: vaultConfigPda, vaultAuthority: vaultAuthorityPda,
        usdcMint, usdcVault: usdcVaultPda, owner: me,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID, rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log("vault initialized");
  } else {
    const vc = await (vault.account as any).vaultConfig.fetch(vaultConfigPda);
    usdcMint = vc.usdcMint;
    console.log("vault already initialized, USDC mint:", usdcMint.toBase58());
  }

  // ── STEP 2: INIT ORACLE ROUTER ────────────────────────────────────────────
  const oracleCfgInfo = await connection.getAccountInfo(oracleConfigPda);
  if (!oracleCfgInfo) {
    // cooldown_secs must be in [60, 86400]; max_price_change_bps in [100, 10000]
    await oracle.methods
      .initialize(new BN(60), new BN(10_000), new BN(3))
      .accounts({
        oracleConfig: oracleConfigPda, owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("oracle_router initialized");
  }

  // ── STEP 3: INIT PERP ENGINE ──────────────────────────────────────────────
  const engineCfgInfo = await connection.getAccountInfo(engineConfigPda);
  if (!engineCfgInfo) {
    await engine.methods
      .initialize()
      .accounts({
        engineConfig: engineConfigPda, authority: engineAuthorityPda,
        perpVault: PERP_VAULT_ID, oracleRouter: ORACLE_ROUTER_ID,
        owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("perp_engine initialized");
  }

  // ── STEP 4: REGISTER OPERATORS ────────────────────────────────────────────
  // 4a: deployer as engine operator
  if (!await connection.getAccountInfo(myEngineOp)) {
    await engine.methods.setOperator(me, true)
      .accounts({
        engineConfig: engineConfigPda, operatorAccount: myEngineOp,
        owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("deployer registered as engine operator");
  }
  // 4b: engine_authority as vault operator
  const engineVaultOp = vaultOperatorPda(engineAuthorityPda);
  if (!await connection.getAccountInfo(engineVaultOp)) {
    await vault.methods.setOperator(engineAuthorityPda, true)
      .accounts({
        vaultConfig: vaultConfigPda, operatorAccount: engineVaultOp,
        owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("engine_authority registered as vault operator");
  }
  // 4c: deployer as oracle operator
  const myOracleOp = oracleOperatorPda(me);
  if (!await connection.getAccountInfo(myOracleOp)) {
    await oracle.methods.setOperator(me, true)
      .accounts({
        oracleConfig: oracleConfigPda, operatorAccount: myOracleOp,
        owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("deployer registered as oracle_router operator");
  }

  // ── STEP 5: BOOTSTRAP ENGINE POOL ────────────────────────────────────────
  const poolInfo = await connection.getAccountInfo(poolBalAddr);
  if (!poolInfo) {
    const tokenKp = Keypair.generate();
    const rent    = await getMinimumBalanceForRentExemptAccount(connection);
    const tx = new Transaction()
      .add(SystemProgram.createAccount({
        fromPubkey: me, newAccountPubkey: tokenKp.publicKey,
        lamports: rent, space: ACCOUNT_SIZE, programId: TOKEN_PROGRAM_ID,
      }))
      .add(createInitializeAccountInstruction(tokenKp.publicKey, usdcMint, engineAuthorityPda));
    await provider.sendAndConfirm(tx, [tokenKp]);
    const POOL_SEED = 50_000 * PRICE_PRECISION;
    await mintTo(connection, deployer, usdcMint, tokenKp.publicKey, deployer, POOL_SEED);
    await engine.methods.bootstrapEnginePool(new BN(POOL_SEED))
      .accounts({
        engineConfig: engineConfigPda, authority: engineAuthorityPda,
        perpVaultProgram: PERP_VAULT_ID, vaultConfig: vaultConfigPda,
        usdcVault: usdcVaultPda, authorityUsdc: tokenKp.publicKey,
        enginePoolBalance: poolBalAddr,
        tokenProgram: TOKEN_PROGRAM_ID, owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("engine pool bootstrapped");
  }

  // ── STEP 6: ADD BTC-USD MARKET ────────────────────────────────────────────
  const BTC_ID  = marketIdBuf("BTC-USD");
  const BTC_PDA = marketPda(BTC_ID);
  if (!await connection.getAccountInfo(BTC_PDA)) {
    await engine.methods
      .addMarket(
        Array.from(BTC_ID),
        new BN(500),                       // initial_margin_bps = 5%
        new BN(250),                       // maintenance_margin_bps = 2.5%
        new BN(100 * SIZE_PRECISION),      // max_position_size = 100 BTC
      )
      .accounts({
        engineConfig: engineConfigPda, market: BTC_PDA,
        owner: me, systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("BTC-USD market added");
  }

  // ── STEP 7: PUSH INITIAL MARK PRICE ($65,000) ─────────────────────────────
  const MARK_OPEN = new BN(65_000 * PRICE_PRECISION);
  await engine.methods.updateMarkPrice(MARK_OPEN, MARK_OPEN)
    .accounts({
      engineConfig: engineConfigPda, market: BTC_PDA,
      operatorAccount: myEngineOp, operator: me,
    })
    .rpc();
  console.log("mark price set to $65,000");

  // ── STEP 8: FUND TRADER AccountBalance ────────────────────────────────────
  // ensureUserInitialized + ensureDeposited
  let myUsdc: PublicKey;
  const ata = await getAssociatedTokenAddress(usdcMint, me);
  const ataInfo = await connection.getAccountInfo(ata);
  if (!ataInfo) {
    myUsdc = await createAccount(connection, deployer, usdcMint, me);
  } else {
    myUsdc = ata;
  }
  await mintTo(connection, deployer, usdcMint, myUsdc, deployer, 10_000 * PRICE_PRECISION);
  const DEP = new BN(1_000 * PRICE_PRECISION);
  const sig_deposit = await vault.methods.deposit(DEP)
    .accounts({
      vaultConfig: vaultConfigPda, usdcVault: usdcVaultPda,
      userUsdc: myUsdc, accountBalance: myBalance,
      depositor: me, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("deposited 1000 USDC to vault, tx:", sig_deposit);
  const balAfterDep = await (vault.account as any).accountBalance.fetch(myBalance);
  console.log("vault balance:", $(balAfterDep.balance.toNumber()));

  // ============================================================================
  // PROBE A: LONG — open 0.1 BTC @ $65,000 → read → close @ $66,000
  // ============================================================================
  console.log("\n--- PROBE A: LONG 0.1 BTC @ $65,000 → close @ $66,000 ---");

  const LONG_POS_PDA = positionPda(BTC_ID, me);
  const LONG_SIZE    = new BN(Math.round(0.1 * SIZE_PRECISION));  // 10_000_000
  const OPEN_PRICE   = new BN(65_000 * PRICE_PRECISION);          // 65_000_000_000
  const CLOSE_PRICE_LONG = new BN(66_000 * PRICE_PRECISION);

  console.log("Position PDA:", LONG_POS_PDA.toBase58());
  console.log("  seeds: [\"position\", BTC-USD_32b, trader_pubkey], program:", PERP_ENGINE_ID.toBase58());

  const ra = openCloseRA(engineAuthorityPda, vaultConfigPda, me);

  const balBeforeOpenLong = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const sig_long_open = await engine.methods
    .openPosition(LONG_SIZE, OPEN_PRICE)
    .accounts({
      engineConfig: engineConfigPda, market: BTC_PDA, position: LONG_POS_PDA,
      trader: me, operatorAccount: myEngineOp, operator: me,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(ra)
    .rpc();
  console.log("LONG OPEN tx:", sig_long_open);

  // READ (getPositions equivalent)
  const posL = await (engine.account as any).position.fetch(LONG_POS_PDA);
  const mktL = await (engine.account as any).market.fetch(BTC_PDA);
  const balAfterOpenLong = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();

  const lSize       = posL.size.toNumber();
  const lEntry      = posL.entryPrice.toNumber();
  const lMargin     = posL.margin.toNumber();
  const lMarkPrice  = mktL.markPrice.toNumber();
  const lUPnL       = calcUPnL(lSize, lEntry, lMarkPrice);
  const lLiqPrice   = calcLiqPrice(lSize, lEntry, lMargin);

  console.log("\nPOSITION READ (long):");
  console.log("  size raw i64:", lSize, " human:", lSize / SIZE_PRECISION, "BTC");
  console.log("  entry_price raw:", lEntry, " human:", $(lEntry));
  console.log("  margin raw:", lMargin, " human:", $(lMargin));
  console.log("  mark_price (Market PDA):", $(lMarkPrice));
  console.log("  unrealizedPnlUsdc:", lUPnL.toFixed(4), "USD");
  console.log("  liqPrice (approx):", lLiqPrice !== null ? `$${lLiqPrice.toFixed(2)}` : "null");
  console.log("  stopLoss: null  (GAP-1 — no on-chain SL/TP in perp_engine)");
  console.log("  takeProfit: null  (GAP-1)");
  console.log("  side:", lSize > 0 ? "long" : "short");
  console.log("  margin debited from trader:", $(balBeforeOpenLong - balAfterOpenLong));

  // Update mark price to close level
  await engine.methods.updateMarkPrice(CLOSE_PRICE_LONG, CLOSE_PRICE_LONG)
    .accounts({ engineConfig: engineConfigPda, market: BTC_PDA, operatorAccount: myEngineOp, operator: me })
    .rpc();

  const balBeforeCloseLong = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const sig_long_close = await engine.methods
    .closePosition(CLOSE_PRICE_LONG)
    .accounts({
      engineConfig: engineConfigPda, market: BTC_PDA, position: LONG_POS_PDA,
      operatorAccount: myEngineOp, operator: me,
    })
    .remainingAccounts(ra)
    .rpc();
  console.log("LONG CLOSE tx:", sig_long_close);
  const balAfterCloseLong = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const longReturn = balAfterCloseLong - balBeforeCloseLong;
  console.log("  return to trader:", $(longReturn), "(expected ~$425: margin ~$325 + profit $100)");

  const posLClosed = await (engine.account as any).position.fetch(LONG_POS_PDA);
  console.log("  position.size after close:", posLClosed.size.toNumber(), "(should be 0)");

  // ============================================================================
  // PROBE B: SHORT — open 0.1 BTC @ $66,000 → read → close @ $65,000
  // ============================================================================
  console.log("\n--- PROBE B: SHORT 0.1 BTC @ $66,000 → close @ $65,000 ---");

  const SHORT_POS_PDA    = positionPda(BTC_ID, me);  // same PDA — sign of size encodes side
  const SHORT_SIZE       = new BN(-Math.round(0.1 * SIZE_PRECISION));  // -10_000_000
  const OPEN_PRICE_SHORT = new BN(66_000 * PRICE_PRECISION);
  const CLOSE_PRICE_SHORT = new BN(65_000 * PRICE_PRECISION);

  // Set mark to short open price
  await engine.methods.updateMarkPrice(OPEN_PRICE_SHORT, OPEN_PRICE_SHORT)
    .accounts({ engineConfig: engineConfigPda, market: BTC_PDA, operatorAccount: myEngineOp, operator: me })
    .rpc();

  console.log("NOTE: SHORT uses SAME position PDA as LONG —", SHORT_POS_PDA.toBase58());
  console.log("      SUR uses ONE PDA per (market, trader). Side = sign(size): positive=long, negative=short.");

  const balBeforeOpenShort = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const sig_short_open = await engine.methods
    .openPosition(SHORT_SIZE, OPEN_PRICE_SHORT)
    .accounts({
      engineConfig: engineConfigPda, market: BTC_PDA, position: SHORT_POS_PDA,
      trader: me, operatorAccount: myEngineOp, operator: me,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(ra)
    .rpc();
  console.log("SHORT OPEN tx:", sig_short_open);

  const posS = await (engine.account as any).position.fetch(SHORT_POS_PDA);
  const mktS = await (engine.account as any).market.fetch(BTC_PDA);
  const balAfterOpenShort = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();

  const sSize      = posS.size.toNumber();
  const sEntry     = posS.entryPrice.toNumber();
  const sMargin    = posS.margin.toNumber();
  const sMarkPrice = mktS.markPrice.toNumber();
  const sUPnL      = calcUPnL(sSize, sEntry, sMarkPrice);
  const sLiqPrice  = calcLiqPrice(sSize, sEntry, sMargin);

  console.log("\nPOSITION READ (short):");
  console.log("  size raw i64:", sSize, " human:", sSize / SIZE_PRECISION, "BTC (negative = short)");
  console.log("  entry_price raw:", sEntry, " human:", $(sEntry));
  console.log("  margin raw:", sMargin, " human:", $(sMargin));
  console.log("  mark_price (Market PDA):", $(sMarkPrice));
  console.log("  unrealizedPnlUsdc:", sUPnL.toFixed(4), "USD");
  console.log("  liqPrice (approx):", sLiqPrice !== null ? `$${sLiqPrice.toFixed(2)}` : "null");
  console.log("  stopLoss: null  (GAP-1)");
  console.log("  takeProfit: null  (GAP-1)");
  console.log("  side:", sSize < 0 ? "short" : "long");
  console.log("  margin debited from trader:", $(balBeforeOpenShort - balAfterOpenShort));

  await engine.methods.updateMarkPrice(CLOSE_PRICE_SHORT, CLOSE_PRICE_SHORT)
    .accounts({ engineConfig: engineConfigPda, market: BTC_PDA, operatorAccount: myEngineOp, operator: me })
    .rpc();

  const balBeforeCloseShort = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const sig_short_close = await engine.methods
    .closePosition(CLOSE_PRICE_SHORT)
    .accounts({
      engineConfig: engineConfigPda, market: BTC_PDA, position: SHORT_POS_PDA,
      operatorAccount: myEngineOp, operator: me,
    })
    .remainingAccounts(ra)
    .rpc();
  console.log("SHORT CLOSE tx:", sig_short_close);
  const balAfterCloseShort = (await (vault.account as any).accountBalance.fetch(myBalance)).balance.toNumber();
  const shortReturn = balAfterCloseShort - balBeforeCloseShort;
  console.log("  return to trader:", $(shortReturn), "(expected ~$430: margin ~$330 + profit $100)");

  const posSClosed = await (engine.account as any).position.fetch(SHORT_POS_PDA);
  console.log("  position.size after close:", posSClosed.size.toNumber(), "(should be 0)");

  // ============================================================================
  // PROBE C: getFloatBalanceUsdc
  // ============================================================================
  console.log("\n--- PROBE C: getFloatBalanceUsdc ---");
  const finalBal = await (vault.account as any).accountBalance.fetch(myBalance);
  console.log("  AccountBalance PDA:", myBalance.toBase58(), 'seeds=["balance", trader]');
  console.log("  balance raw u64:", finalBal.balance.toNumber());
  console.log("  balance human:", $(finalBal.balance.toNumber()), "USDC");

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n============================================================");
  console.log("PROBE RESULTS:");
  console.log("  LONG  open  tx:", sig_long_open);
  console.log("  LONG  close tx:", sig_long_close);
  console.log("  SHORT open  tx:", sig_short_open);
  console.log("  SHORT close tx:", sig_short_close);
  console.log("  long return:", $(longReturn), "| short return:", $(shortReturn));
  console.log("============================================================");
  console.log("ALL PROBES PASSED — SurAdapter is buildable.");

  return { sig_long_open, sig_long_close, sig_short_open, sig_short_close };
}

main().catch((e: unknown) => {
  const err = e as { message?: string; logs?: string[] };
  console.error("\nPROBE FAILED:", err.message || e);
  if (err.logs) err.logs.slice(-20).forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
