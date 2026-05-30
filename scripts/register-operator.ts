/* eslint-disable no-console */
/**
 * Register a Phantom (or any) wallet as a direct engine operator on devnet.
 *
 * v1 testing only — production never registers EOAs as operators; only the
 * cross-program authority PDAs (intent_engine, order_settlement, etc.) ever
 * call engine.open_position.
 *
 * Usage:
 *   npx ts-node scripts/register-operator.ts <phantom_pubkey>
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
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

const PERP_ENGINE_PROGRAM_ID = new PublicKey(
  "28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX",
);

async function main() {
  const [targetStr] = process.argv.slice(2);
  if (!targetStr) {
    console.error("usage: register-operator.ts <phantom_pubkey>");
    process.exit(1);
  }
  const operator = new PublicKey(targetStr);

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(
          path.join(os.homedir(), ".config", "solana", "id.json"),
          "utf8",
        ),
      ),
    ),
  );

  const provider = new AnchorProvider(connection, new Wallet(deployer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "..", "target", "idl", "perp_engine.json"),
      "utf8",
    ),
  );
  const program = new Program(idl, provider);

  const engineConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("engine_config")],
    PERP_ENGINE_PROGRAM_ID,
  )[0];
  const operatorPda = PublicKey.findProgramAddressSync(
    [Buffer.from("operator"), operator.toBuffer()],
    PERP_ENGINE_PROGRAM_ID,
  )[0];

  console.log(`operator:    ${operator.toBase58()}`);
  console.log(`operatorPda: ${operatorPda.toBase58()}`);

  const existing = await connection.getAccountInfo(operatorPda);
  if (existing) {
    console.log("✅ already registered (operator PDA exists)");
    return;
  }

  const sig = await program.methods
    .setOperator(operator, true)
    .accountsPartial({
      engineConfig: engineConfigPda,
      operatorAccount: operatorPda,
      owner: deployer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });
  console.log(`✅ registered: ${sig}`);
  console.log(
    `explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
