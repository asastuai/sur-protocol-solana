/* eslint-disable no-console */
/**
 * SUR Protocol — Devnet Initialization Script
 * ============================================
 *
 * Idempotent bootstrap of all 11 SUR programs on Solana devnet so the
 * Next.js web UI's write hooks (deposit, open, close, withdraw, intents)
 * succeed end-to-end.
 *
 * Source of truth: the `before()` hooks in tests/0X_*.ts.
 *
 * Steps:
 *   1.  Load deployer keypair (~/.config/solana/id.json), confirm > 1 SOL.
 *   2.  Build typed Program instances for all 11 programs from target/idl.
 *   3.  Create (or reuse) a devnet USDC mint owned by the deployer.
 *   4.  Initialize each program (skip if Config PDA exists).
 *   5.  Register cross-program operator PDAs on vault + engine.
 *   6.  Bootstrap engine_pool + insurance_fund_pool vault balances.
 *   7.  Add BTC-USD, SOL-USD, ETH-USD markets to the engine.
 *   8.  Push initial mark prices via oracle_router → engine CPI.
 *   9.  Mint 1M test USDC to the deployer's ATA.
 *  10.  Register the deployer as a direct engine operator (v1 testing).
 *  11.  Save state to scripts/devnet-state.json AND patch
 *       clients/web/lib/devnet-constants.ts with the real USDC mint.
 *
 * Run:
 *   npx ts-node scripts/devnet-init.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ACCOUNT_SIZE,
  createInitializeAccountInstruction,
  createMint,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
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
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ============================================================================
// Constants
// ============================================================================

const REPO_ROOT = path.resolve(__dirname, "..");
const IDL_DIR = path.join(REPO_ROOT, "target", "idl");
const STATE_PATH = path.join(REPO_ROOT, "scripts", "devnet-state.json");
const WEB_CONSTANTS_PATH = path.join(
  REPO_ROOT,
  "clients",
  "web",
  "lib",
  "devnet-constants.ts",
);
const KEYPAIR_PATH = path.join(os.homedir(), ".config", "solana", "id.json");

// Fresh devnet program IDs (regenerated 2026-05-30 for the remediated build —
// the old IDs had stale config-account layouts from a prior init).
const PROGRAM_IDS = {
  a2a_darkpool: new PublicKey("DAK23pRLEr7E4JaSGRpeo8TEV5fjz6edqS5ZbvnJ5sAR"),
  perp_vault: new PublicKey("2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1"),
  oracle_router: new PublicKey("8yLenSHEkdkbsCiQLmiQrZg7Kdb3ZBb1MKTFmJsA37zk"),
  perp_engine: new PublicKey("28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX"),
  sur_timelock: new PublicKey("HBAd2wkpL3zuuvHG5VmPWvVz66U2u9G4SGH4XKavVFga"),
  liquidator: new PublicKey("38zdeFX8qeXep53DYRM8ssBEQwu9Ztja6HBFGxrhpDUy"),
  insurance_fund: new PublicKey("33WMHTYxURf1t65CoHuPGSD1ZPcRQ3KQi22Bdo92nxpA"),
  auto_deleveraging: new PublicKey(
    "J6qRhEyU45T17LhiPyoKGrHUvcMEKgH6iy5kxNUvcEHn",
  ),
  collateral_manager: new PublicKey(
    "94Pu8AJXwwpoexNfs6oQ4SEq6x3sRhyLEA5AvNPuLGc1",
  ),
  trading_vault: new PublicKey("8eXKqX7ZwVrJUH78urAsVoBiQQ1tgifmfBwhdiMepT3K"),
  order_settlement: new PublicKey(
    "6YiGUHjvSPKzS3ypDvodsbqH4ibiV3xTfq5FJeW5kfmo",
  ),
} as const;

// Pyth devnet feeds — we pass them as the oracle/feed account so the UI can
// surface the feed addresses, but the v0.2 oracle_router doesn't deserialize
// pyth accounts; the operator pushes prices manually.
const PYTH_FEEDS = {
  BTC: new PublicKey("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J"),
  SOL: new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVFvy"),
  ETH: new PublicKey("EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw"),
};

const PRICE_PRECISION = 1_000_000n;
const SIZE_PRECISION = 100_000_000n;

const CONFIRM_OPTS = {
  commitment: "confirmed" as const,
  preflightCommitment: "confirmed" as const,
  skipPreflight: false,
};

// ============================================================================
// Helpers
// ============================================================================

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function marketIdFromSymbol(symbol: string): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from(symbol).copy(buf);
  return buf;
}

function utf8(s: string): Buffer {
  return Buffer.from(s);
}

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function loadIdl<T extends anchor.Idl>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(IDL_DIR, `${name}.json`), "utf8"),
  ) as T;
}

function ok(label: string, sig?: string) {
  if (sig) console.log(`✅ ${label} (tx: ${sig})`);
  else console.log(`✅ ${label} (skipped: already done)`);
}

function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`❌ ${label} — ${msg.split("\n")[0]}`);
}

async function isInitialized(
  conn: Connection,
  pdaAddr: PublicKey,
): Promise<boolean> {
  const info = await conn.getAccountInfo(pdaAddr, "confirmed");
  return info !== null;
}

type State = {
  usdcMint: string;
  markets: Array<{ symbol: string; marketId: string; oracle: string }>;
  deployer: string;
  initializedAt: string;
  steps: Record<string, "ok" | "skipped" | "failed">;
};

function loadState(): Partial<State> {
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(s: State) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n", "utf8");
}

function patchWebConstants(usdcMint: PublicKey) {
  if (!fs.existsSync(WEB_CONSTANTS_PATH)) {
    console.log(`⚠️  web devnet-constants.ts not found at ${WEB_CONSTANTS_PATH}`);
    return;
  }
  const src = fs.readFileSync(WEB_CONSTANTS_PATH, "utf8");
  const re = /export const DEVNET_USDC_MINT = new PublicKey\(\s*"([^"]+)"\s*,?\s*\);/;
  const m = src.match(re);
  if (!m) {
    console.log("⚠️  DEVNET_USDC_MINT block not found in web constants");
    return;
  }
  if (m[1] === usdcMint.toBase58()) {
    console.log(`✅ web DEVNET_USDC_MINT already up to date (${m[1]})`);
    return;
  }
  const next = src.replace(
    re,
    `export const DEVNET_USDC_MINT = new PublicKey(\n  "${usdcMint.toBase58()}",\n);`,
  );
  fs.writeFileSync(WEB_CONSTANTS_PATH, next, "utf8");
  console.log(
    `✅ patched web DEVNET_USDC_MINT: ${m[1]} -> ${usdcMint.toBase58()}`,
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("============================================================");
  console.log(" SUR Protocol — Devnet Init");
  console.log("============================================================");

  // ---- 1. connection + deployer ----
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const deployer = loadKeypair(KEYPAIR_PATH);
  console.log(`deployer:  ${deployer.publicKey.toBase58()}`);

  const balLamports = await connection.getBalance(deployer.publicKey);
  const bal = balLamports / LAMPORTS_PER_SOL;
  console.log(`balance:   ${bal.toFixed(4)} SOL`);
  if (bal < 1) {
    console.error("❌ aborting: deployer needs > 1 SOL on devnet");
    process.exit(1);
  }

  const provider = new AnchorProvider(
    connection,
    new Wallet(deployer),
    CONFIRM_OPTS,
  );
  anchor.setProvider(provider);

  // ---- 2. build Program instances ----
  const idls = {
    perp_vault: loadIdl<anchor.Idl>("perp_vault"),
    oracle_router: loadIdl<anchor.Idl>("oracle_router"),
    perp_engine: loadIdl<anchor.Idl>("perp_engine"),
    sur_timelock: loadIdl<anchor.Idl>("sur_timelock"),
    a2a_darkpool: loadIdl<anchor.Idl>("a2a_darkpool"),
    liquidator: loadIdl<anchor.Idl>("liquidator"),
    insurance_fund: loadIdl<anchor.Idl>("insurance_fund"),
    auto_deleveraging: loadIdl<anchor.Idl>("auto_deleveraging"),
    collateral_manager: loadIdl<anchor.Idl>("collateral_manager"),
    trading_vault: loadIdl<anchor.Idl>("trading_vault"),
    order_settlement: loadIdl<anchor.Idl>("order_settlement"),
  };
  // Anchor 0.31 embeds program address in the IDL.
  const programs = {
    perp_vault: new Program(idls.perp_vault, provider),
    oracle_router: new Program(idls.oracle_router, provider),
    perp_engine: new Program(idls.perp_engine, provider),
    sur_timelock: new Program(idls.sur_timelock, provider),
    a2a_darkpool: new Program(idls.a2a_darkpool, provider),
    liquidator: new Program(idls.liquidator, provider),
    insurance_fund: new Program(idls.insurance_fund, provider),
    auto_deleveraging: new Program(idls.auto_deleveraging, provider),
    collateral_manager: new Program(idls.collateral_manager, provider),
    trading_vault: new Program(idls.trading_vault, provider),
    order_settlement: new Program(idls.order_settlement, provider),
  };

  // ---- common PDAs ----
  const P = PROGRAM_IDS;
  const vaultConfigPda = pda([utf8("vault_config")], P.perp_vault);
  const vaultAuthorityPda = pda([utf8("vault_authority")], P.perp_vault);
  const usdcVaultPda = pda([utf8("usdc_vault")], P.perp_vault);
  const vaultOperatorPda = (op: PublicKey) =>
    pda([utf8("operator"), op.toBuffer()], P.perp_vault);
  const accountBalancePda = (who: PublicKey) =>
    pda([utf8("balance"), who.toBuffer()], P.perp_vault);

  const engineConfigPda = pda([utf8("engine_config")], P.perp_engine);
  const engineAuthorityPda = pda([utf8("engine_authority")], P.perp_engine);
  const engineOperatorPda = (op: PublicKey) =>
    pda([utf8("operator"), op.toBuffer()], P.perp_engine);
  const marketPda = (marketId: Buffer) =>
    pda([utf8("market"), marketId], P.perp_engine);

  const oracleConfigPda = pda([utf8("oracle_config")], P.oracle_router);
  const oracleAuthorityPda = pda([utf8("oracle_authority")], P.oracle_router);
  const oracleOperatorPda = (op: PublicKey) =>
    pda([utf8("operator"), op.toBuffer()], P.oracle_router);
  const feedPda = (marketId: Buffer) =>
    pda([utf8("feed"), marketId], P.oracle_router);

  const insuranceFundConfigPda = pda(
    [utf8("insurance_fund_config")],
    P.insurance_fund,
  );
  const insuranceFundAuthorityPda = pda(
    [utf8("insurance_fund_authority")],
    P.insurance_fund,
  );

  const liquidatorConfigPda = pda(
    [utf8("liquidator_config")],
    P.liquidator,
  );
  const liquidatorAuthorityPda = pda(
    [utf8("liquidator_authority")],
    P.liquidator,
  );

  const adlConfigPda = pda([utf8("adl_config")], P.auto_deleveraging);
  const adlAuthorityPda = pda(
    [utf8("adl_authority")],
    P.auto_deleveraging,
  );

  const cmConfigPda = pda([utf8("config")], P.collateral_manager);
  const cmAuthorityPda = pda(
    [utf8("collateral_manager_authority")],
    P.collateral_manager,
  );

  const tvConfigPda = pda([utf8("config")], P.trading_vault);
  const tvAuthorityPda = pda(
    [utf8("trading_vault_authority")],
    P.trading_vault,
  );

  const a2aConfigPda = pda([utf8("config")], P.a2a_darkpool);
  const a2aAuthorityPda = pda([utf8("darkpool_authority")], P.a2a_darkpool);

  const osConfigPda = pda([utf8("config")], P.order_settlement);
  const osAuthorityPda = pda(
    [utf8("order_settlement_authority")],
    P.order_settlement,
  );

  const timelockConfigPda = pda([utf8("timelock_config")], P.sur_timelock);
  const timelockAuthorityPda = pda([utf8("timelock_authority")], P.sur_timelock);

  const state: State = {
    usdcMint: "",
    markets: [],
    deployer: deployer.publicKey.toBase58(),
    initializedAt: new Date().toISOString(),
    steps: {},
    ...loadState(),
  };

  // ===== 3. USDC mint =====
  let usdcMint: PublicKey;
  const vaultExisted = await isInitialized(connection, vaultConfigPda);
  if (vaultExisted) {
    // Reuse the mint already bound to the on-chain vault.
    const cfg = await (programs.perp_vault.account as any).vaultConfig.fetch(
      vaultConfigPda,
    );
    usdcMint = cfg.usdcMint as PublicKey;
    console.log(`✅ USDC mint (reuse from vault_config): ${usdcMint.toBase58()}`);
  } else if (state.usdcMint && state.usdcMint.length > 0) {
    // Reuse mint from state file (rare path: state ahead of chain).
    usdcMint = new PublicKey(state.usdcMint);
    console.log(`✅ USDC mint (from state.json): ${usdcMint.toBase58()}`);
  } else {
    console.log("→ creating new devnet USDC mint…");
    usdcMint = await createMint(connection, deployer, deployer.publicKey, null, 6);
    console.log(`✅ created USDC mint: ${usdcMint.toBase58()}`);
  }
  state.usdcMint = usdcMint.toBase58();
  saveState(state);

  // ===== 4. perp_vault.initialize =====
  if (!vaultExisted) {
    try {
      const sig = await programs.perp_vault.methods
        .initialize(new BN(0), new BN(0), new BN(0))
        .accountsPartial({
          vaultConfig: vaultConfigPda,
          vaultAuthority: vaultAuthorityPda,
          usdcMint,
          usdcVault: usdcVaultPda,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc(CONFIRM_OPTS);
      ok("perp_vault.initialize", sig);
      state.steps["perp_vault.initialize"] = "ok";
    } catch (e) {
      fail("perp_vault.initialize", e);
      state.steps["perp_vault.initialize"] = "failed";
    }
  } else {
    ok("perp_vault.initialize");
    state.steps["perp_vault.initialize"] = "skipped";
  }

  // ===== oracle_router.initialize =====
  if (!(await isInitialized(connection, oracleConfigPda))) {
    try {
      const sig = await programs.oracle_router.methods
        .initialize(new BN(180), new BN(1000), new BN(3))
        .accountsPartial({
          oracleConfig: oracleConfigPda,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("oracle_router.initialize", sig);
      state.steps["oracle_router.initialize"] = "ok";
    } catch (e) {
      fail("oracle_router.initialize", e);
      state.steps["oracle_router.initialize"] = "failed";
    }
  } else {
    ok("oracle_router.initialize");
  }

  // ===== perp_engine.initialize =====
  if (!(await isInitialized(connection, engineConfigPda))) {
    try {
      const sig = await programs.perp_engine.methods
        .initialize()
        .accountsPartial({
          engineConfig: engineConfigPda,
          authority: engineAuthorityPda,
          perpVault: P.perp_vault,
          oracleRouter: P.oracle_router,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("perp_engine.initialize", sig);
      state.steps["perp_engine.initialize"] = "ok";
    } catch (e) {
      fail("perp_engine.initialize", e);
      state.steps["perp_engine.initialize"] = "failed";
    }
  } else {
    ok("perp_engine.initialize");
  }

  // ===== sur_timelock.initialize =====
  // Note: program enforces a min delay of 24h. Devnet still uses 24h — the
  // UI doesn't gate writes on the timelock (timelock is for governance ops),
  // so a long delay is harmless for the golden path.
  if (!(await isInitialized(connection, timelockConfigPda))) {
    try {
      const sig = await programs.sur_timelock.methods
        .initialize(new BN(24 * 60 * 60))
        .accountsPartial({
          config: timelockConfigPda,
          authority: timelockAuthorityPda,
          guardian: deployer.publicKey,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("sur_timelock.initialize", sig);
      state.steps["sur_timelock.initialize"] = "ok";
    } catch (e) {
      fail("sur_timelock.initialize", e);
      state.steps["sur_timelock.initialize"] = "failed";
    }
  } else {
    ok("sur_timelock.initialize");
  }

  // ===== a2a_darkpool.initialize =====
  if (!(await isInitialized(connection, a2aConfigPda))) {
    try {
      const sig = await programs.a2a_darkpool.methods
        .initialize(
          new BN(3),                  // fee_bps 0.03%
          new BN(10_000 * 1_000_000), // large_trade_threshold $10K
          new BN(500),                // large_trade_min_reputation 50%
          new BN(60),                 // min_intent_duration s
          new BN(86400),              // max_intent_duration s
          new BN(5),                  // response_cooldown s
        )
        .accountsPartial({
          config: a2aConfigPda,
          owner: deployer.publicKey,
          feeRecipient: deployer.publicKey,
          perpEngine: P.perp_engine,
          perpVault: P.perp_vault,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("a2a_darkpool.initialize", sig);
      state.steps["a2a_darkpool.initialize"] = "ok";
    } catch (e) {
      fail("a2a_darkpool.initialize", e);
      state.steps["a2a_darkpool.initialize"] = "failed";
    }
  } else {
    ok("a2a_darkpool.initialize");
  }

  // ===== liquidator.initialize =====
  if (!(await isInitialized(connection, liquidatorConfigPda))) {
    try {
      const sig = await programs.liquidator.methods
        .initialize()
        .accountsPartial({
          config: liquidatorConfigPda,
          perpEngine: P.perp_engine,
          insuranceFund: insuranceFundAuthorityPda,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("liquidator.initialize", sig);
      state.steps["liquidator.initialize"] = "ok";
    } catch (e) {
      fail("liquidator.initialize", e);
      state.steps["liquidator.initialize"] = "failed";
    }
  } else {
    ok("liquidator.initialize");
  }

  // ===== insurance_fund.initialize =====
  if (!(await isInitialized(connection, insuranceFundConfigPda))) {
    try {
      const sig = await programs.insurance_fund.methods
        .initialize(
          new BN(1_000 * 1_000_000),  // max_keeper_reward_per_call $1K
          new BN(10_000 * 1_000_000), // max_daily_keeper_rewards $10K
        )
        .accountsPartial({
          config: insuranceFundConfigPda,
          authority: insuranceFundAuthorityPda,
          vault: P.perp_vault,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("insurance_fund.initialize", sig);
      state.steps["insurance_fund.initialize"] = "ok";
    } catch (e) {
      fail("insurance_fund.initialize", e);
      state.steps["insurance_fund.initialize"] = "failed";
    }
  } else {
    ok("insurance_fund.initialize");
  }

  // ===== auto_deleveraging.initialize =====
  if (!(await isInitialized(connection, adlConfigPda))) {
    try {
      const sig = await programs.auto_deleveraging.methods
        .initialize(
          new BN(1_000 * 1_000_000), // min_bad_debt_threshold $1K
          new BN(0),                  // adl_cooldown_secs 0 (devnet testing)
        )
        .accountsPartial({
          config: adlConfigPda,
          authority: adlAuthorityPda,
          perpEngine: P.perp_engine,
          perpVault: P.perp_vault,
          insuranceFund: insuranceFundAuthorityPda,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("auto_deleveraging.initialize", sig);
      state.steps["auto_deleveraging.initialize"] = "ok";
    } catch (e) {
      fail("auto_deleveraging.initialize", e);
      state.steps["auto_deleveraging.initialize"] = "failed";
    }
  } else {
    ok("auto_deleveraging.initialize");
  }

  // ===== collateral_manager.initialize =====
  if (!(await isInitialized(connection, cmConfigPda))) {
    try {
      // Pre-fund the CM authority PDA with a tiny SOL for the init_if_needed
      // vault.AccountBalance later on. Optional — not consumed at init time.
      const sig = await programs.collateral_manager.methods
        .initialize(
          new BN(9000), // liquidation_threshold_bps = 90%
          new BN(1000), // max_price_deviation_bps = 10%
        )
        .accountsPartial({
          config: cmConfigPda,
          authority: cmAuthorityPda,
          vaultProgram: P.perp_vault,
          vaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(cmAuthorityPda),
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("collateral_manager.initialize", sig);
      state.steps["collateral_manager.initialize"] = "ok";
    } catch (e) {
      fail("collateral_manager.initialize", e);
      state.steps["collateral_manager.initialize"] = "failed";
    }
  } else {
    ok("collateral_manager.initialize");
  }

  // ===== trading_vault.initialize =====
  if (!(await isInitialized(connection, tvConfigPda))) {
    try {
      const sig = await programs.trading_vault.methods
        .initialize()
        .accountsPartial({
          config: tvConfigPda,
          authority: tvAuthorityPda,
          perpVaultProgram: P.perp_vault,
          perpVaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(tvAuthorityPda),
          perpEngineProgram: P.perp_engine,
          perpEngineConfig: engineConfigPda,
          engineOperatorAccount: engineOperatorPda(tvAuthorityPda),
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("trading_vault.initialize", sig);
      state.steps["trading_vault.initialize"] = "ok";
    } catch (e) {
      fail("trading_vault.initialize", e);
      state.steps["trading_vault.initialize"] = "failed";
    }
  } else {
    ok("trading_vault.initialize");
  }

  // ===== order_settlement.initialize =====
  if (!(await isInitialized(connection, osConfigPda))) {
    try {
      // cluster_id=2 for devnet (matches no other env; localnet=1, mainnet=3).
      const sig = await programs.order_settlement.methods
        .initialize(new BN(2))
        .accountsPartial({
          config: osConfigPda,
          authority: osAuthorityPda,
          perpEngineProgram: P.perp_engine,
          perpEngineConfig: engineConfigPda,
          engineOperatorAccount: engineOperatorPda(osAuthorityPda),
          perpVaultProgram: P.perp_vault,
          perpVaultConfig: vaultConfigPda,
          vaultOperatorAccount: vaultOperatorPda(osAuthorityPda),
          feeRecipient: deployer.publicKey,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("order_settlement.initialize", sig);
      state.steps["order_settlement.initialize"] = "ok";
    } catch (e) {
      fail("order_settlement.initialize", e);
      state.steps["order_settlement.initialize"] = "failed";
    }
  } else {
    ok("order_settlement.initialize");
  }

  // ===== 5. cross-program operator registration =====
  // vault operators
  const vaultOperators: Array<[string, PublicKey]> = [
    ["engine_authority", engineAuthorityPda],
    ["insurance_fund_authority", insuranceFundAuthorityPda],
    ["collateral_manager_authority", cmAuthorityPda],
    ["trading_vault_authority", tvAuthorityPda],
    ["order_settlement_authority", osAuthorityPda],
    ["a2a_darkpool_authority", a2aAuthorityPda],
  ];
  for (const [label, op] of vaultOperators) {
    const opAcct = vaultOperatorPda(op);
    if (await isInitialized(connection, opAcct)) {
      ok(`vault.set_operator(${label})`);
      continue;
    }
    try {
      const sig = await programs.perp_vault.methods
        .setOperator(op, true)
        .accountsPartial({
          vaultConfig: vaultConfigPda,
          operatorAccount: opAcct,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok(`vault.set_operator(${label})`, sig);
      state.steps[`vault.set_operator.${label}`] = "ok";
    } catch (e) {
      fail(`vault.set_operator(${label})`, e);
      state.steps[`vault.set_operator.${label}`] = "failed";
    }
  }

  // engine operators
  const engineOperators: Array<[string, PublicKey]> = [
    ["liquidator_authority", liquidatorAuthorityPda],
    ["adl_authority", adlAuthorityPda],
    ["order_settlement_authority", osAuthorityPda],
    ["trading_vault_authority", tvAuthorityPda],
    ["a2a_darkpool_authority", a2aAuthorityPda],
    ["oracle_authority", oracleAuthorityPda],
    ["deployer (v1 direct)", deployer.publicKey],
  ];
  for (const [label, op] of engineOperators) {
    const opAcct = engineOperatorPda(op);
    if (await isInitialized(connection, opAcct)) {
      ok(`engine.set_operator(${label})`);
      continue;
    }
    try {
      const sig = await programs.perp_engine.methods
        .setOperator(op, true)
        .accountsPartial({
          engineConfig: engineConfigPda,
          operatorAccount: opAcct,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok(`engine.set_operator(${label})`, sig);
      state.steps[`engine.set_operator.${label}`] = "ok";
    } catch (e) {
      fail(`engine.set_operator(${label})`, e);
      state.steps[`engine.set_operator.${label}`] = "failed";
    }
  }

  // oracle_router operator (deployer pushes prices)
  {
    const opAcct = oracleOperatorPda(deployer.publicKey);
    if (await isInitialized(connection, opAcct)) {
      ok("oracle_router.set_operator(deployer)");
    } else {
      try {
        const sig = await programs.oracle_router.methods
          .setOperator(deployer.publicKey, true)
          .accountsPartial({
            oracleConfig: oracleConfigPda,
            operatorAccount: opAcct,
            owner: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc(CONFIRM_OPTS);
        ok("oracle_router.set_operator(deployer)", sig);
        state.steps["oracle_router.set_operator.deployer"] = "ok";
      } catch (e) {
        fail("oracle_router.set_operator(deployer)", e);
        state.steps["oracle_router.set_operator.deployer"] = "failed";
      }
    }
  }

  saveState(state);

  // ===== 6. bootstrap pool balances =====
  // Authority PDAs need SOL to pay rent for the init_if_needed
  // vault.AccountBalance created via CPI during bootstrap_*_pool.
  async function fundPda(pdaAddr: PublicKey, lamports: number, label: string) {
    const cur = await connection.getBalance(pdaAddr);
    if (cur >= lamports) {
      console.log(`✅ fund ${label} PDA (already ${cur} lamports)`);
      return;
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: pdaAddr,
        lamports: lamports - cur,
      }),
    );
    const sig = await provider.sendAndConfirm(tx, [], CONFIRM_OPTS);
    console.log(`✅ fund ${label} PDA with ${(lamports - cur) / 1e9} SOL (tx: ${sig})`);
  }

  await fundPda(engineAuthorityPda, 0.1 * LAMPORTS_PER_SOL, "engine_authority");
  await fundPda(insuranceFundAuthorityPda, 0.1 * LAMPORTS_PER_SOL, "insurance_fund_authority");

  // 6a. engine pool — needs a token account owned by engineAuthorityPda
  const enginePoolBalance = accountBalancePda(engineAuthorityPda);
  if (await isInitialized(connection, enginePoolBalance)) {
    ok("perp_engine.bootstrap_engine_pool");
  } else {
    try {
      // Create + initialize a USDC token account owned by engine_authority PDA.
      const authorityUsdcKp = Keypair.generate();
      const rent = await getMinimumBalanceForRentExemptAccount(connection);
      const createIx = SystemProgram.createAccount({
        fromPubkey: deployer.publicKey,
        newAccountPubkey: authorityUsdcKp.publicKey,
        lamports: rent,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      const initIx = createInitializeAccountInstruction(
        authorityUsdcKp.publicKey,
        usdcMint,
        engineAuthorityPda,
      );
      const tx = new Transaction().add(createIx, initIx);
      await provider.sendAndConfirm(tx, [authorityUsdcKp], CONFIRM_OPTS);
      const POOL_SEED = 50_000 * 1_000_000; // 50k USDC
      await mintTo(
        connection,
        deployer,
        usdcMint,
        authorityUsdcKp.publicKey,
        deployer,
        POOL_SEED,
      );
      const sig = await programs.perp_engine.methods
        .bootstrapEnginePool(new BN(POOL_SEED))
        .accountsPartial({
          engineConfig: engineConfigPda,
          authority: engineAuthorityPda,
          perpVaultProgram: P.perp_vault,
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          authorityUsdc: authorityUsdcKp.publicKey,
          enginePoolBalance,
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("perp_engine.bootstrap_engine_pool", sig);
      state.steps["perp_engine.bootstrap_engine_pool"] = "ok";
    } catch (e) {
      fail("perp_engine.bootstrap_engine_pool", e);
      state.steps["perp_engine.bootstrap_engine_pool"] = "failed";
    }
  }

  // 6b. insurance fund pool
  const insurancePoolBalance = accountBalancePda(insuranceFundAuthorityPda);
  if (await isInitialized(connection, insurancePoolBalance)) {
    ok("insurance_fund.bootstrap_insurance_pool");
  } else {
    try {
      const authorityUsdcKp = Keypair.generate();
      const rent = await getMinimumBalanceForRentExemptAccount(connection);
      const createIx = SystemProgram.createAccount({
        fromPubkey: deployer.publicKey,
        newAccountPubkey: authorityUsdcKp.publicKey,
        lamports: rent,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      const initIx = createInitializeAccountInstruction(
        authorityUsdcKp.publicKey,
        usdcMint,
        insuranceFundAuthorityPda,
      );
      const tx = new Transaction().add(createIx, initIx);
      await provider.sendAndConfirm(tx, [authorityUsdcKp], CONFIRM_OPTS);
      const POOL_SEED = 10_000 * 1_000_000; // 10k USDC
      await mintTo(
        connection,
        deployer,
        usdcMint,
        authorityUsdcKp.publicKey,
        deployer,
        POOL_SEED,
      );
      const sig = await programs.insurance_fund.methods
        .bootstrapInsurancePool(new BN(POOL_SEED))
        .accountsPartial({
          config: insuranceFundConfigPda,
          authority: insuranceFundAuthorityPda,
          perpVaultProgram: P.perp_vault,
          vaultConfig: vaultConfigPda,
          usdcVault: usdcVaultPda,
          authorityUsdc: authorityUsdcKp.publicKey,
          fundPoolBalance: insurancePoolBalance,
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(CONFIRM_OPTS);
      ok("insurance_fund.bootstrap_insurance_pool", sig);
      state.steps["insurance_fund.bootstrap_insurance_pool"] = "ok";
    } catch (e) {
      fail("insurance_fund.bootstrap_insurance_pool", e);
      state.steps["insurance_fund.bootstrap_insurance_pool"] = "failed";
    }
  }

  // ===== 6c. bind the canonical insurance-fund balance on the engine =====
  // Gate 0a / N-4: liquidation insurance flows are enforced against this key.
  // The insurance pool balance is the AccountBalance PDA bootstrapped above.
  try {
    const sig = await programs.perp_engine.methods
      .setInsuranceFundBalance(insurancePoolBalance)
      .accountsPartial({
        engineConfig: engineConfigPda,
        owner: deployer.publicKey,
      })
      .rpc(CONFIRM_OPTS);
    ok("perp_engine.set_insurance_fund_balance", sig);
    state.steps["perp_engine.set_insurance_fund_balance"] = "ok";
  } catch (e) {
    fail("perp_engine.set_insurance_fund_balance", e);
    state.steps["perp_engine.set_insurance_fund_balance"] = "failed";
  }

  // ===== 7. add markets =====
  const markets: Array<{
    symbol: string;
    marketId: Buffer;
    initialMarkPrice: bigint;
    oracle: PublicKey;
  }> = [
    {
      symbol: "BTC-USD",
      marketId: marketIdFromSymbol("BTC-USD"),
      initialMarkPrice: 65_000n * PRICE_PRECISION,
      oracle: PYTH_FEEDS.BTC,
    },
    {
      symbol: "SOL-USD",
      marketId: marketIdFromSymbol("SOL-USD"),
      initialMarkPrice: 150n * PRICE_PRECISION,
      oracle: PYTH_FEEDS.SOL,
    },
    {
      symbol: "ETH-USD",
      marketId: marketIdFromSymbol("ETH-USD"),
      initialMarkPrice: 3_500n * PRICE_PRECISION,
      oracle: PYTH_FEEDS.ETH,
    },
  ];

  state.markets = [];
  for (const m of markets) {
    const mPda = marketPda(m.marketId);
    if (await isInitialized(connection, mPda)) {
      ok(`engine.add_market(${m.symbol})`);
    } else {
      try {
        // initial_margin_bps = 500 (5%), maintenance_margin_bps = 250 (2.5%),
        // max_position_size = 100 BTC equivalent (1e10 in 8-decimal size units).
        const sig = await programs.perp_engine.methods
          .addMarket(
            Array.from(m.marketId),
            new BN(500),
            new BN(250),
            new BN(100 * 100_000_000),
          )
          .accountsPartial({
            engineConfig: engineConfigPda,
            market: mPda,
            owner: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc(CONFIRM_OPTS);
        ok(`engine.add_market(${m.symbol})`, sig);
        state.steps[`engine.add_market.${m.symbol}`] = "ok";
      } catch (e) {
        fail(`engine.add_market(${m.symbol})`, e);
        state.steps[`engine.add_market.${m.symbol}`] = "failed";
      }
    }
    state.markets.push({
      symbol: m.symbol,
      marketId: m.marketId.toString("hex"),
      oracle: m.oracle.toBase58(),
    });
  }
  saveState(state);

  // ===== 8. configure oracle feeds + push prices =====
  // We use the engine's update_mark_price directly via the deployer operator
  // PDA — it's the same write path the oracle CPI uses but skips the feed
  // wiring. Simpler + idempotent for devnet bring-up.
  for (const m of markets) {
    const mPda = marketPda(m.marketId);
    try {
      const sig = await programs.perp_engine.methods
        .updateMarkPrice(
          new BN(m.initialMarkPrice.toString()),
          new BN(m.initialMarkPrice.toString()),
        )
        .accountsPartial({
          engineConfig: engineConfigPda,
          market: mPda,
          operatorAccount: engineOperatorPda(deployer.publicKey),
          operator: deployer.publicKey,
        })
        .rpc(CONFIRM_OPTS);
      ok(`engine.update_mark_price(${m.symbol} = $${
        Number(m.initialMarkPrice) / Number(PRICE_PRECISION)
      })`, sig);
      state.steps[`engine.update_mark_price.${m.symbol}`] = "ok";
    } catch (e) {
      fail(`engine.update_mark_price(${m.symbol})`, e);
      state.steps[`engine.update_mark_price.${m.symbol}`] = "failed";
    }
  }

  // ===== 9. mint 1M test USDC to deployer's ATA =====
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      deployer,
      usdcMint,
      deployer.publicKey,
    );
    const want = BigInt(1_000_000) * BigInt(1_000_000); // 1M USDC
    if (ata.amount < want) {
      const need = Number(want - ata.amount);
      await mintTo(connection, deployer, usdcMint, ata.address, deployer, need);
      ok(`mintTo(deployer ATA, ${need / 1_000_000} USDC)`);
      state.steps["mint_test_usdc"] = "ok";
    } else {
      ok("mintTo(deployer ATA) — already > 1M");
      state.steps["mint_test_usdc"] = "skipped";
    }
  } catch (e) {
    fail("mintTo(deployer ATA)", e);
    state.steps["mint_test_usdc"] = "failed";
  }

  // ===== finalize =====
  state.initializedAt = new Date().toISOString();
  saveState(state);

  // Patch web constants with the real USDC mint.
  patchWebConstants(usdcMint);

  // ===== summary =====
  console.log("\n============================================================");
  console.log(" Devnet init summary");
  console.log("============================================================");
  console.log(`USDC mint:  ${state.usdcMint}`);
  console.log(`deployer:   ${state.deployer}`);
  console.log(`markets:    ${state.markets.map((m) => m.symbol).join(", ")}`);
  console.log(`state file: ${STATE_PATH}`);
  const okCount = Object.values(state.steps).filter((s) => s === "ok").length;
  const skipCount = Object.values(state.steps).filter(
    (s) => s === "skipped",
  ).length;
  const failCount = Object.values(state.steps).filter(
    (s) => s === "failed",
  ).length;
  console.log(`steps:      ${okCount} ok, ${skipCount} skipped, ${failCount} failed`);
  if (failCount > 0) {
    console.log("\nfailed steps:");
    for (const [k, v] of Object.entries(state.steps)) {
      if (v === "failed") console.log(`  - ${k}`);
    }
    process.exitCode = 1;
  }
  console.log("============================================================");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
