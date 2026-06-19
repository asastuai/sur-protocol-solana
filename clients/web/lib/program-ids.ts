import { PublicKey } from "@solana/web3.js";

// Canonical SUR Protocol program IDs on Solana devnet.
// Mirrors clients/sdk/src/program-ids.ts. Copy lives here so the web bundle
// never imports from the SDK at runtime.
export const PROGRAM_IDS = {
  a2a_darkpool: new PublicKey("3jPooLaiWoq5DA4SeXMfP4MT4hrp6X1zrASD9hcYqKke"),
  perp_vault: new PublicKey("HDS6P815i9ZTCriGVMxvvTAY5bkToTSf8XGfPKjSpCxQ"),
  oracle_router: new PublicKey("D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx"),
  perp_engine: new PublicKey("BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2"),
  sur_timelock: new PublicKey("8VRBi4s3D12Y7sbUYLSmsCGLDnj6xAVSNL1KfhYiCnUw"),
  liquidator: new PublicKey("8aerVEjWfL65UtdTTLSYJmrNp2uabou8ySjdLw8BXD5p"),
  insurance_fund: new PublicKey("3p6HGqQmLB6fBQ3kQE1hQ3xPCLD2Bn4RPbHUwJD4HyV9"),
  auto_deleveraging: new PublicKey("6rg7CTKmrsxWLxRPApT9gkidE8i3aqJKf8AKCVgbENRf"),
  collateral_manager: new PublicKey("CzsxUSohWydLesZ2nfAa7WqpiZfWhZkWUHhBMkFS29VU"),
  trading_vault: new PublicKey("aMYTJ33dzuTXXHpRSAp9UsR5jogu7sdJUDtVrSx9bjT"),
  order_settlement: new PublicKey("8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ"),
} as const;

export type ProgramName = keyof typeof PROGRAM_IDS;
