// Small helper to build Solana Explorer URLs for transaction signatures.
// Callers (tx hooks, toasts) use this to link the user to a confirmed tx.
//
// Phase 4 only targets devnet — the param keeps the signature open for
// later expansion (mainnet-beta, custom RPC) without callers having to
// hand-roll the query string.

import type { PublicKey } from "@solana/web3.js";

export type ExplorerCluster = "devnet" | "mainnet-beta" | "testnet";

export function getExplorerUrl(
  signature: string,
  cluster: ExplorerCluster = "devnet",
): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (cluster === "mainnet-beta") return base;
  return `${base}?cluster=${cluster}`;
}

/**
 * Build a Solana Explorer URL for an account/program address.
 *
 * Accepts either a base58 string or a PublicKey so callers can pass the
 * raw `PROGRAM_IDS` values directly. Mirrors `getExplorerUrl` for the
 * `/address/` route and appends `?cluster=` for every non-mainnet cluster.
 */
export function getAddressExplorerUrl(
  address: string | PublicKey,
  cluster: ExplorerCluster = "devnet",
): string {
  const value = typeof address === "string" ? address : address.toBase58();
  const base = `https://explorer.solana.com/address/${value}`;
  if (cluster === "mainnet-beta") return base;
  return `${base}?cluster=${cluster}`;
}
