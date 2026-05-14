import { PublicKey } from "@solana/web3.js";

// Canonical SUR Protocol program IDs on Solana devnet.
// Mirrors clients/sdk/src/program-ids.ts. Copy lives here so the web bundle
// never imports from the SDK at runtime.
export const PROGRAM_IDS = {
  a2a_darkpool: new PublicKey("BVrt7REAZoCZBEY987fUPEjn2EvnXyaFzpMPVXb81rnq"),
  perp_vault: new PublicKey("FpbuRBF3RiAkpD3k8XccnoYH99W5g9R59aRd3jRZTBfU"),
  oracle_router: new PublicKey("CC5Xc5DTyLSfcw3MiXbyJQyRA21mh3Shup6bgMH8WGSS"),
  perp_engine: new PublicKey("Cwpbe4mwgFdnhwhoRBGBzUerQa52cJMqXWjG3wGvYFW8"),
  sur_timelock: new PublicKey("9FeQoWChgaRqvKJGqjTmVvpF7jQ4Ph7zgSsrkA4NnwAF"),
  liquidator: new PublicKey("9APXqgHS7aNtYsjDE1SJ6PiboJPSyv2QhG9SmLaCzg2R"),
  insurance_fund: new PublicKey("A9TY4wcr6Buzrac5XLC5aQvz4wWyYjQSogsVBvS3eKPp"),
  auto_deleveraging: new PublicKey("F12KjhGRyiEbM629MHookPFar7xsbfbfafoZjuBmCTDz"),
  collateral_manager: new PublicKey("2LavJpzUzHWs2cJTAp2BEvvS2Kxrr9gfaWgSVH4s3juh"),
  trading_vault: new PublicKey("JE4JwZ3b7eYoBsTempCUbkBiFAgYrTsisn2uMssWGvCy"),
  order_settlement: new PublicKey("2q4HtPAjUMFPDfipazQhb52sRun3x9TdpwRHysWBg6Vf"),
} as const;

export type ProgramName = keyof typeof PROGRAM_IDS;
