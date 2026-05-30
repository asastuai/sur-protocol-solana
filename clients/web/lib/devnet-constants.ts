import { PublicKey } from "@solana/web3.js";

// =====================================================================
// Devnet constants — SUR Protocol
// =====================================================================
//
// IMPORTANT (Phase 2 status):
//
// 1. The 11 SUR programs are DEPLOYED on devnet but NOT YET INITIALIZED.
//    `perp_vault` has no on-chain `VaultConfig` PDA yet, so the
//    `usdc_mint` field is not set on-chain. Phase 9 will run init in
//    the browser from an admin wallet and bind the mint below.
//
// 2. The workspace integration tests (tests/01_perp_vault.ts) create a
//    local USDC mint with `createMint(...)` per-suite. There is NO
//    canonical "workspace USDC mint" baked into the programs.
//
// 3. Tests pass a placeholder Pyth account into `configure_feed`
//    (`Keypair.generate().publicKey`) — no real Pyth account is wired in
//    yet. push_price.rs (v0.2) takes already-validated prices from the
//    operator; real pyth-solana-receiver-sdk derivation is v0.2.X.
//
// The values below are the *canonical Solana devnet* mint + Pyth feed
// addresses we plan to bind on init in Phase 9. They are exposed here
// so feature components can render them and so Phase 9 init flows have
// a single source of truth.
// =====================================================================

// Canonical Solana devnet USDC mint published by Circle / SPL maintainers.
// (https://spl.solana.com / Solana cookbook — devnet USDC faucet mint)
export const DEVNET_USDC_MINT = new PublicKey(
  "HPPfibzQ5GYgjBpBsRNXxD8MUKasBFwpR3UpjFqBbzny",
);

// USDC has 6 decimals on every cluster.
export const USDC_DECIMALS = 6;

// Canonical Pyth devnet price feed accounts (pyth-network publishers,
// https://pyth.network/developers/price-feed-ids). These are the
// account public keys on devnet, NOT the chain-agnostic feed ids.
export const DEVNET_PYTH_BTC_USD = new PublicKey(
  "HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J",
);

export const DEVNET_PYTH_SOL_USD = new PublicKey(
  "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVFvy",
);

export const DEVNET_PYTH_ETH_USD = new PublicKey(
  "EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw",
);

// Market id helper. The engine uses fixed 32-byte market ids; tests
// build them as `Buffer.from("BTC-USD")` zero-padded to 32 bytes.
export function marketIdFromSymbol(symbol: string): Uint8Array {
  const buf = new Uint8Array(32);
  const bytes = new TextEncoder().encode(symbol);
  if (bytes.length > 32) {
    throw new Error(`market symbol "${symbol}" exceeds 32 bytes`);
  }
  buf.set(bytes, 0);
  return buf;
}

export const MARKET_IDS = {
  BTC_USD: marketIdFromSymbol("BTC-USD"),
  SOL_USD: marketIdFromSymbol("SOL-USD"),
  ETH_USD: marketIdFromSymbol("ETH-USD"),
} as const;
