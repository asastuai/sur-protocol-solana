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

  engineAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("engine_authority")],
      SUR_PROGRAM_IDS.perp_engine,
    ),

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

  // ============================================================
  //                    liquidator
  // ============================================================
  liquidatorConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("liquidator_config")],
      SUR_PROGRAM_IDS.liquidator,
    ),

  liquidatorAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("liquidator_authority")],
      SUR_PROGRAM_IDS.liquidator,
    ),

  keeperStats: (keeper: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("keeper"), keeper.toBuffer()],
      SUR_PROGRAM_IDS.liquidator,
    ),

  // ============================================================
  //                    insurance_fund
  // ============================================================
  insuranceFundConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("insurance_fund_config")],
      SUR_PROGRAM_IDS.insurance_fund,
    ),

  insuranceFundAuthority: () =>
    PublicKey.findProgramAddressSync(
      [utf8("insurance_fund_authority")],
      SUR_PROGRAM_IDS.insurance_fund,
    ),

  marketBadDebt: (marketId: Uint8Array) => {
    if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
    return PublicKey.findProgramAddressSync(
      [utf8("market_bad_debt"), Buffer.from(marketId)],
      SUR_PROGRAM_IDS.insurance_fund,
    );
  },

  insuranceFundOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      SUR_PROGRAM_IDS.insurance_fund,
    ),

  // ============================================================
  //                    auto_deleveraging
  // ============================================================
  adlConfig: () =>
    PublicKey.findProgramAddressSync(
      [utf8("adl_config")],
      SUR_PROGRAM_IDS.auto_deleveraging,
    ),

  adlOperator: (operator: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [utf8("operator"), operator.toBuffer()],
      SUR_PROGRAM_IDS.auto_deleveraging,
    ),
};

// ---- helpers ----
function bnLE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

// ============================================================
//                    collateral_manager
// ============================================================

export const collateralManagerConfigPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const collateralPda = (
  mint: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("collateral"), mint.toBuffer()],
    programId,
  );

export const traderCollateralPda = (
  mint: PublicKey,
  trader: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("deposit"), mint.toBuffer(), trader.toBuffer()],
    programId,
  );

export const collateralOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

export const collateralManagerAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("collateral_manager_authority")],
    programId,
  );

export const collateralEscrowAuthorityPda = (
  mint: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("vault"), mint.toBuffer()],
    programId,
  );

export const collateralEscrowPda = (
  mint: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.collateral_manager,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("escrow"), mint.toBuffer()],
    programId,
  );

// ============================================================
//                    trading_vault
// ============================================================

export const tradingVaultConfigPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const tradingVaultAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("trading_vault_authority")],
    programId,
  );

export const vaultPda = (
  vaultId: Uint8Array,
  programId: PublicKey = SUR_PROGRAM_IDS.trading_vault,
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
  programId: PublicKey = SUR_PROGRAM_IDS.trading_vault,
): [PublicKey, number] => {
  if (vaultId.length !== 32) throw new Error("vaultId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("share"), Buffer.from(vaultId), depositor.toBuffer()],
    programId,
  );
};

export const tradingVaultOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.trading_vault,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

// ============================================================
//                    order_settlement
// ============================================================

export const orderSettlementConfigPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("config")], programId);

export const orderSettlementAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("order_settlement_authority")],
    programId,
  );

export const orderSettlementOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.order_settlement,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

export const noncePagePda = (
  trader: PublicKey,
  pageIndex: bigint,
  programId: PublicKey = SUR_PROGRAM_IDS.order_settlement,
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
  programId: PublicKey = SUR_PROGRAM_IDS.order_settlement,
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
  programId: PublicKey = SUR_PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("liquidator_config")], programId);

export const liquidatorAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("liquidator_authority")], programId);

export const keeperStatsPda = (
  keeper: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.liquidator,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("keeper"), keeper.toBuffer()],
    programId,
  );

// ============================================================
//                    insurance_fund
// ============================================================

export const insuranceFundConfigPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("insurance_fund_config")],
    programId,
  );

export const insuranceFundAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("insurance_fund_authority")],
    programId,
  );

export const marketBadDebtPda = (
  marketId: Uint8Array,
  programId: PublicKey = SUR_PROGRAM_IDS.insurance_fund,
): [PublicKey, number] => {
  if (marketId.length !== 32) throw new Error("marketId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [utf8("market_bad_debt"), Buffer.from(marketId)],
    programId,
  );
};

export const insuranceFundOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.insurance_fund,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );

// ============================================================
//                    auto_deleveraging
// ============================================================

export const adlConfigPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("adl_config")], programId);

export const adlAuthorityPda = (
  programId: PublicKey = SUR_PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([utf8("adl_authority")], programId);

export const adlOperatorPda = (
  operator: PublicKey,
  programId: PublicKey = SUR_PROGRAM_IDS.auto_deleveraging,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [utf8("operator"), operator.toBuffer()],
    programId,
  );
