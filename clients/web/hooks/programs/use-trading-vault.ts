"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useTradingVault() {
  return useProgramHandle(IDLS.trading_vault, PROGRAM_IDS.trading_vault);
}
