import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

export const config = {
  rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  databaseUrl: req("DATABASE_URL"),
  port: Number(process.env.PORT ?? 8080),
  faucet: {
    usdcAmount: Number(process.env.FAUCET_USDC_AMOUNT ?? 5000),
    solLamports: Number(process.env.FAUCET_SOL_LAMPORTS ?? 100_000_000),
    testUsdcMint: process.env.TEST_USDC_MINT ?? "",
  },
  ipHashSalt: process.env.IP_HASH_SALT ?? "dev-salt",
};

// Program IDs to index (mirror clients/sdk/program-ids.ts). These are the
// FRESH re-deploy IDs (declare_id! updated 2026-06); the indexer scans by
// program id because trades are operator-signed.
export const PROGRAM_IDS = {
  perp_engine: "BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2",
  perp_vault: "HDS6P815i9ZTCriGVMxvvTAY5bkToTSf8XGfPKjSpCxQ",
  collateral_manager: "CzsxUSohWydLesZ2nfAa7WqpiZfWhZkWUHhBMkFS29VU",
  order_settlement: "8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ",
  a2a_darkpool: "3jPooLaiWoq5DA4SeXMfP4MT4hrp6X1zrASD9hcYqKke",
  oracle_router: "D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx",
} as const;
