/**
 * @asastuai/sur-sdk — TypeScript SDK for SUR Protocol on Solana.
 *
 * Re-exports:
 *  - `SUR_PROGRAM_IDS`: canonical program IDs across all 5 programs
 *  - `SurPdas`: PDA derivation helpers for every account in the protocol
 *
 * Roadmap (v0.0.X → v1.0):
 *  - v0.0.1 (this): program IDs + PDA derivations
 *  - v0.0.2: typed program clients via Anchor IDLs (bundled from target/idl/*.json)
 *  - v0.1.0: high-level helpers (depositUSDC, openPositionAtomic, settleA2A)
 *  - v0.2.0: agent-API wrappers + MCP tool definitions
 *  - v1.0.0: production-ready, audit-pinned program IDs, mainnet defaults
 */

export { SUR_PROGRAM_IDS } from "./program-ids";
export { SurPdas } from "./pdas";
