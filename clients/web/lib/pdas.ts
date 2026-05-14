import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { PROGRAM_IDS } from "./program-ids";

const utf8 = (s: string) => Buffer.from(s);

function bnLE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

// ============================================================
//                    a2a_darkpool
// ============================================================
export const SurPdas = {
  darkpoolConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("config")],
      PROGRAM_IDS.a2a_darkpool,
    ),

  intent: (intentId: bigint) =>
    PublicKey.findProgramAddressSync(
      [utf8("intent"), bnLE(intentId)],
      PROGRAM_IDS.a2a_darkpool,
    ),

  response: (responseId: bigint) =>
    PublicKey.findProgramAddressSync(
      [utf8("response"), bnLE(responseId)],
      PROGRAM_IDS.a2a_darkpool,
    ),

  agentReputation: (agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("reputation"), agent.toBuffer()],
      PROGRAM_IDS.a2a_darkpool,
    ),

  // ============================================================
  //                    perp_vault
  // ============================================================
  vaultConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("vault_config")],
      PROGRAM_IDS.perp_vault,
    ),

  vaultAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("vault_authority")],
      PROGRAM_IDS.perp_vault,
    ),

  usdcVault: () =>
    PublicKey.findProgramAddressSync(
      [utf8("usdc_vault")],
      PROGRAM_IDS.perp_vault,
    ),

  accountBalance: (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("balance"), trader.toBuffer()],
      PROGRAM_IDS.perp_vault,
    ),

  vaultOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      PROGRAM_IDS.perp_vault,
    ),

  // ============================================================
  //                    oracle_router
  // ============================================================
  oracleConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("oracle_config")],
      PROGRAM_IDS.oracle_router,
    ),

  oracleAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("oracle_authority")],
      PROGRAM_IDS.oracle_router,
    ),

  feed: (marketId: Uint8Array) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("feed"), Buffer.from(marketId)],
      PROGRAM_IDS.oracle_router,
    );
  },

  oracleOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      PROGRAM_IDS.oracle_router,
    ),

  // ============================================================
  //                    perp_engine
  // ============================================================
  engineConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("engine_config")],
      PROGRAM_IDS.perp_engine,
    ),

  market: (marketId: Uint8Array) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("market"), Buffer.from(marketId)],
      PROGRAM_IDS.perp_engine,
    );
  },

  position: (marketId: Uint8Array, trader: PublicKey) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("position"), Buffer.from(marketId), trader.toBuffer()],
      PROGRAM_IDS.perp_engine,
    );
  },

  engineAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("engine_authority")],
      PROGRAM_IDS.perp_engine,
    ),

  engineOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      PROGRAM_IDS.perp_engine,
    ),

  // ============================================================
  //                    sur_timelock
  // ============================================================
  timelockConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("timelock_config")],
      PROGRAM_IDS.sur_timelock,
    ),

  queuedTx: (txHash: Uint8Array) => {
    if (txHash.length !== 32) throw new Error("txHash must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("queued_tx"), Buffer.from(txHash)],
      PROGRAM_IDS.sur_timelock,
    );
  },

  pausableTarget: (target: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("pausable_target"), target.toBuffer()],
      PROGRAM_IDS.sur_timelock,
    ),
};

// ============================================================
//                    collateral_manager
// ============================================================

export const collateralManagerConfigPda = (
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const collateralPda = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("collateral"), mint.toBuffer()],
    programId,
  );

export const traderCollateralPda = (
  mint: PublicKey,
  trader: PublicKey,
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("deposit"), mint.toBuffer(), trader.toBuffer()],
    programId,
  );

export const collateralOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

export const collateralManagerAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("collateral_manager_authority")],
    programId,
  );

export const collateralEscrowAuthorityPda = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("vault"), mint.toBuffer()],
    programId,
  );

export const collateralEscrowPda = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("escrow"), mint.toBuffer()],
    programId,
  );

// ============================================================
//                    trading_vault
// ============================================================

export const tradingVaultConfigPda = (
  programId: PublicKey = PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const tradingVaultAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("trading_vault_authority")],
    programId,
  );

export const vaultPda = (
  vaultId: Uint8Array,
  programId: PublicKey = PROGRAM_IDS.trading_vault,
): [PublicKey, number] => {
  if (vaultId.length !== 32) throw new Error("vaultId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("vault"), Buffer.from(vaultId)],
    programId,
  );
};

export const depositorPda = (
  vaultId: Uint8Array,
  depositor: PublicKey,
  programId: PublicKey = PROGRAM_IDS.trading_vault,
): [PublicKey, number] => {
  if (vaultId.length !== 32) throw new Error("vaultId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("share"), Buffer.from(vaultId), depositor.toBuffer()],
    programId,
  );
};

export const tradingVaultOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

// ============================================================
//                    order_settlement
// ============================================================

export const orderSettlementConfigPda = (
  programId: PublicKey = PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const orderSettlementAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("order_settlement_authority")],
    programId,
  );

export const orderSettlementOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

export const noncePagePda = (
  trader: PublicKey,
  pageIndex: bigint,
  programId: PublicKey = PROGRAM_IDS.order_settlement,
): [PublicKey, number] => {
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64LE(pageIndex, 0);
  return PublicKey.findProgramAddressSync(
    [utf8("nonce_page"), trader.toBuffer(), idx],
    programId,
  );
};

export const orderCommitPda = (
  commitHash: Uint8Array,
  programId: PublicKey = PROGRAM_IDS.order_settlement,
): [PublicKey, number] => {
  if (commitHash.length !== 32) throw new Error("commitHash must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("commit"), Buffer.from(commitHash)],
    programId,
  );
};

// ============================================================
//                    liquidator
// ============================================================

export const liquidatorConfigPda = (
  programId: PublicKey = PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("liquidator_config")], programId);

export const liquidatorAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("liquidator_authority")], programId);

export const keeperStatsPda = (
  keeper: PublicKey,
  programId: PublicKey = PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("keeper"), keeper.toBuffer()],
    programId,
  );

// ============================================================
//                    insurance_fund
// ============================================================

export const insuranceFundConfigPda = (
  programId: PublicKey = PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("insurance_fund_config")],
    programId,
  );

export const insuranceFundAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("insurance_fund_authority")],
    programId,
  );

export const marketBadDebtPda = (
  marketId: Uint8Array,
  programId: PublicKey = PROGRAM_IDS.insurance_fund,
): [PublicKey, number] => {
  if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("market_bad_debt"), Buffer.from(marketId)],
    programId,
  );
};

export const insuranceFundOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

// ============================================================
//                    auto_deleveraging
// ============================================================

export const adlConfigPda = (
  programId: PublicKey = PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("adl_config")], programId);

export const adlAuthorityPda = (
  programId: PublicKey = PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("adl_authority")], programId);

export const adlOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );
