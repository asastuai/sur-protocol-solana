import { PublicKey } from "@solana/web3.js";
import { SUR_PROGRAM_IDS } from "./program-ids";

const utf8 = (s: string) => Buffer.from(s);

/**
 * PDA derivations across all SUR programs. Each helper returns
 * `[address, bump]` matching the program's seed convention.
 */
export const SurPdas = {
  // ============================================================
  //                    a2a_darkpool
  // ============================================================
  darkpoolConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("config")],
      SUR_PROGRAM_IDS.a2a_darkpool,
    ),

  intent: (intentId: bigint) =>
    PublicKey.findProgramAddressSync(
      [utf8("intent"), bnLE(intentId)],
      SUR_PROGRAM_IDS.a2a_darkpool,
    ),

  response: (responseId: bigint) =>
    PublicKey.findProgramAddressSync(
      [utf8("response"), bnLE(responseId)],
      SUR_PROGRAM_IDS.a2a_darkpool,
    ),

  agentReputation: (agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("reputation"), agent.toBuffer()],
      SUR_PROGRAM_IDS.a2a_darkpool,
    ),

  // ============================================================
  //                    perp_vault
  // ============================================================
  vaultConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("vault_config")],
      SUR_PROGRAM_IDS.perp_vault,
    ),

  vaultAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("vault_authority")],
      SUR_PROGRAM_IDS.perp_vault,
    ),

  usdcVault: () =>
    PublicKey.findProgramAddressSync(
      [utf8("usdc_vault")],
      SUR_PROGRAM_IDS.perp_vault,
    ),

  accountBalance: (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("balance"), trader.toBuffer()],
      SUR_PROGRAM_IDS.perp_vault,
    ),

  vaultOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      SUR_PROGRAM_IDS.perp_vault,
    ),

  // ============================================================
  //                    oracle_router
  // ============================================================
  oracleConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("oracle_config")],
      SUR_PROGRAM_IDS.oracle_router,
    ),

  oracleAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("oracle_authority")],
      SUR_PROGRAM_IDS.oracle_router,
    ),

  feed: (marketId: Uint8Array) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("feed"), Buffer.from(marketId)],
      SUR_PROGRAM_IDS.oracle_router,
    );
  },

  oracleOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      SUR_PROGRAM_IDS.oracle_router,
    ),

  // ============================================================
  //                    perp_engine
  // ============================================================
  engineConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("engine_config")],
      SUR_PROGRAM_IDS.perp_engine,
    ),

  market: (marketId: Uint8Array) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("market"), Buffer.from(marketId)],
      SUR_PROGRAM_IDS.perp_engine,
    );
  },

  position: (marketId: Uint8Array, trader: PublicKey) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("position"), Buffer.from(marketId), trader.toBuffer()],
      SUR_PROGRAM_IDS.perp_engine,
    );
  },

  engineOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      SUR_PROGRAM_IDS.perp_engine,
    ),

  // ============================================================
  //                    sur_timelock
  // ============================================================
  timelockConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("timelock_config")],
      SUR_PROGRAM_IDS.sur_timelock,
    ),

  queuedTx: (txHash: Uint8Array) => {
    if (txHash.length !== 32) throw new Error("txHash must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("queued_tx"), Buffer.from(txHash)],
      SUR_PROGRAM_IDS.sur_timelock,
    );
  },

  pausableTarget: (target: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("pausable_target"), target.toBuffer()],
      SUR_PROGRAM_IDS.sur_timelock,
    ),
};

// ---- helpers ----
function bnLE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}
