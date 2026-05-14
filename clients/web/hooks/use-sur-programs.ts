"use client";

import { useA2aDarkpool } from "./programs/use-a2a-darkpool";
import { useAutoDeleveraging } from "./programs/use-auto-deleveraging";
import { useCollateralManager } from "./programs/use-collateral-manager";
import { useInsuranceFund } from "./programs/use-insurance-fund";
import { useLiquidator } from "./programs/use-liquidator";
import { useOracleRouter } from "./programs/use-oracle-router";
import { useOrderSettlement } from "./programs/use-order-settlement";
import { usePerpEngine } from "./programs/use-perp-engine";
import { usePerpVault } from "./programs/use-perp-vault";
import { useSurTimelock } from "./programs/use-sur-timelock";
import { useTradingVault } from "./programs/use-trading-vault";

export function useSurPrograms() {
  return {
    a2aDarkpool: useA2aDarkpool(),
    autoDeleveraging: useAutoDeleveraging(),
    collateralManager: useCollateralManager(),
    insuranceFund: useInsuranceFund(),
    liquidator: useLiquidator(),
    oracleRouter: useOracleRouter(),
    orderSettlement: useOrderSettlement(),
    perpEngine: usePerpEngine(),
    perpVault: usePerpVault(),
    surTimelock: useSurTimelock(),
    tradingVault: useTradingVault(),
  };
}
