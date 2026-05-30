/* eslint-disable no-console */
/**
 * SUR Protocol — Devnet Golden-Path (CLI)
 * =======================================
 * Exercises the core flow end-to-end on devnet, signed by the deployer
 * (which `devnet-init.ts` registered as an engine operator + funded with USDC):
 *
 *   deposit 100 → open 0.01 BTC long → close → withdraw 100
 *
 * This specifically validates the Gate 0a engine bindings on-chain: open/close
 * pass the canonical trader_balance + engine_pool_balance via remaining_accounts,
 * and the engine now require!s they are the canonical PDAs. If the binding were
 * wrong, open/close would revert.
 *
 * Run: npx ts-node scripts/golden-path-cli.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const REPO = path.resolve(__dirname, "..");
const IDL_DIR = path.join(REPO, "target", "idl");
const STATE = JSON.parse(
  fs.readFileSync(path.join(REPO, "scripts", "devnet-state.json"), "utf8"),
);

const PERP_VAULT = new PublicKey("2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1");
const PERP_ENGINE = new PublicKey("28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX");

const u = (s: string) => Buffer.from(s);
const pda = (seeds: (Buffer | Uint8Array)[], pid: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, pid)[0];
const loadIdl = (n: string) =>
  JSON.parse(fs.readFileSync(path.join(IDL_DIR, `${n}.json`), "utf8"));
const loadKp = (p: string) =>
  Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );

const fmt = (n: number) => `$${(n / 1e6).toFixed(2)}`;

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const deployer = loadKp(path.join(os.homedir(), ".config", "solana", "id.json"));
  const provider = new AnchorProvider(connection, new Wallet(deployer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const vault = new Program(loadIdl("perp_vault"), provider);
  const engine = new Program(loadIdl("perp_engine"), provider);
  const usdcMint = new PublicKey(STATE.usdcMint);
  const me = deployer.publicKey;

  // PDAs
  const vaultConfig = pda([u("vault_config")], PERP_VAULT);
  const vaultAuthority = pda([u("vault_authority")], PERP_VAULT);
  const usdcVault = pda([u("usdc_vault")], PERP_VAULT);
  const balance = (who: PublicKey) => pda([u("balance"), who.toBuffer()], PERP_VAULT);
  const vaultOperator = (op: PublicKey) =>
    pda([u("operator"), op.toBuffer()], PERP_VAULT);

  const engineConfig = pda([u("engine_config")], PERP_ENGINE);
  const engineAuthority = pda([u("engine_authority")], PERP_ENGINE);
  const engineOperator = (op: PublicKey) =>
    pda([u("operator"), op.toBuffer()], PERP_ENGINE);
  const marketIdBtc = Buffer.alloc(32);
  u("BTC-USD").copy(marketIdBtc);
  const market = pda([u("market"), marketIdBtc], PERP_ENGINE);
  const position = pda([u("position"), marketIdBtc, me.toBuffer()], PERP_ENGINE);

  // remaining_accounts for engine open/close (order per open_position.rs header)
  const ra = (trader: PublicKey) => [
    { pubkey: engineAuthority, isSigner: false, isWritable: false },
    { pubkey: PERP_VAULT, isSigner: false, isWritable: false },
    { pubkey: vaultConfig, isSigner: false, isWritable: false },
    { pubkey: vaultOperator(engineAuthority), isSigner: false, isWritable: false },
    { pubkey: balance(trader), isSigner: false, isWritable: true },
    { pubkey: balance(engineAuthority), isSigner: false, isWritable: true },
  ];

  const ata = await getAssociatedTokenAddress(usdcMint, me);
  const readBal = async () => {
    const acc = await (vault.account as any).accountBalance.fetchNullable(balance(me));
    return acc ? acc.balance.toNumber() : 0;
  };

  console.log("=== SUR devnet golden-path (deployer:", me.toBase58(), ") ===");
  console.log("vault balance start:", fmt(await readBal()));

  // ---- 1. deposit 100 USDC ----
  const DEP = 100 * 1e6;
  await vault.methods
    .deposit(new BN(DEP))
    .accounts({
      vaultConfig,
      usdcVault,
      userUsdc: ata,
      accountBalance: balance(me),
      depositor: me,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✅ deposit 100 → vault balance:", fmt(await readBal()));

  // ---- 2. open 0.01 BTC long @ $65,000 ----
  const SIZE = new BN(0.01 * 1e8); // 8-decimal size units
  const PRICE = new BN(65_000 * 1e6); // 6-decimal price
  await engine.methods
    .openPosition(SIZE, PRICE)
    .accounts({
      engineConfig,
      market,
      position,
      trader: me,
      operatorAccount: engineOperator(me),
      operator: me,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(ra(me))
    .rpc();
  const posOpen = await (engine.account as any).position.fetch(position);
  console.log(
    "✅ open 0.01 BTC → size:",
    posOpen.size.toString(),
    "entry:",
    fmt(posOpen.entryPrice.toNumber()),
    "margin:",
    fmt(posOpen.margin.toNumber()),
    "| vault balance:",
    fmt(await readBal()),
  );

  // ---- 3. close @ $65,000 (PnL ~ $0) ----
  await engine.methods
    .closePosition(PRICE)
    .accounts({
      engineConfig,
      market,
      position,
      operatorAccount: engineOperator(me),
      operator: me,
    })
    .remainingAccounts(ra(me))
    .rpc();
  const posClosed = await (engine.account as any).position.fetch(position);
  console.log(
    "✅ close → size:",
    posClosed.size.toString(),
    "| vault balance (margin released):",
    fmt(await readBal()),
  );

  // ---- 4. withdraw 100 ----
  await vault.methods
    .withdraw(new BN(DEP))
    .accounts({
      vaultConfig,
      vaultAuthority,
      usdcVault,
      userUsdc: ata,
      accountBalance: balance(me),
      withdrawer: me,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("✅ withdraw 100 → vault balance:", fmt(await readBal()));

  console.log("\n🎉 GOLDEN PATH PASSED — deposit → open → close → withdraw all on-chain.");
  console.log("   Gate 0a engine bindings accepted the canonical accounts end-to-end.");
}

main().catch((e) => {
  console.error("❌ FAILED:", e.message || e);
  if (e.logs) console.error(e.logs.slice(-15).join("\n"));
  process.exit(1);
});
