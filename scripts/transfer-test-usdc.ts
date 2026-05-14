/* eslint-disable no-console */
/**
 * Transfer test USDC from the deployer's ATA to a target wallet's ATA.
 *
 * Usage:
 *   npx ts-node scripts/transfer-test-usdc.ts <target_pubkey> <amount_usdc>
 *
 * Reads USDC mint from scripts/devnet-state.json.
 */
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function main() {
  const [targetStr, amountStr] = process.argv.slice(2);
  if (!targetStr || !amountStr) {
    console.error("usage: transfer-test-usdc.ts <target_pubkey> <amount_usdc>");
    process.exit(1);
  }
  const target = new PublicKey(targetStr);
  const amount = BigInt(Math.floor(parseFloat(amountStr) * 1_000_000));

  const statePath = path.resolve(__dirname, "devnet-state.json");
  if (!fs.existsSync(statePath)) {
    console.error("devnet-state.json not found — run devnet-init.ts first.");
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const usdcMint = new PublicKey(state.usdcMint);

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

  console.log(`source:   ${deployer.publicKey.toBase58()}`);
  console.log(`target:   ${target.toBase58()}`);
  console.log(`usdc:     ${usdcMint.toBase58()}`);
  console.log(`amount:   ${Number(amount) / 1e6} USDC`);

  const fromAta = await getAssociatedTokenAddress(usdcMint, deployer.publicKey);
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    usdcMint,
    target,
  );

  const sig = await transfer(
    connection,
    deployer,
    fromAta,
    toAta.address,
    deployer,
    Number(amount),
  );
  console.log(`✅ transferred: ${sig}`);
  console.log(
    `explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
