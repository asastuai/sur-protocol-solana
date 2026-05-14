// Small helper to build Solana Explorer URLs for transaction signatures.
// Callers (tx hooks, toasts) use this to link the user to a confirmed tx.
//
// Phase 4 only targets devnet — the param keeps the signature open for
// later expansion (mainnet-beta, custom RPC) without callers having to
// hand-roll the query string.

export type ExplorerCluster = "devnet" | "mainnet-beta" | "testnet";

export function getExplorerUrl(
  signature: string,
  cluster: ExplorerCluster = "devnet",
): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (cluster === "mainnet-beta") return base;
  return `${base}?cluster=${cluster}`;
}
