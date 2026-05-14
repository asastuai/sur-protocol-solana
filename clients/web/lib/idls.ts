import type { Idl } from "@coral-xyz/anchor";

import a2aDarkpoolIdl from "@/idls/a2a_darkpool.json";
import autoDeleveragingIdl from "@/idls/auto_deleveraging.json";
import collateralManagerIdl from "@/idls/collateral_manager.json";
import insuranceFundIdl from "@/idls/insurance_fund.json";
import liquidatorIdl from "@/idls/liquidator.json";
import oracleRouterIdl from "@/idls/oracle_router.json";
import orderSettlementIdl from "@/idls/order_settlement.json";
import perpEngineIdl from "@/idls/perp_engine.json";
import perpVaultIdl from "@/idls/perp_vault.json";
import surTimelockIdl from "@/idls/sur_timelock.json";
import tradingVaultIdl from "@/idls/trading_vault.json";

export const IDLS = {
  a2a_darkpool: a2aDarkpoolIdl as Idl,
  auto_deleveraging: autoDeleveragingIdl as Idl,
  collateral_manager: collateralManagerIdl as Idl,
  insurance_fund: insuranceFundIdl as Idl,
  liquidator: liquidatorIdl as Idl,
  oracle_router: oracleRouterIdl as Idl,
  order_settlement: orderSettlementIdl as Idl,
  perp_engine: perpEngineIdl as Idl,
  perp_vault: perpVaultIdl as Idl,
  sur_timelock: surTimelockIdl as Idl,
  trading_vault: tradingVaultIdl as Idl,
} as const;
