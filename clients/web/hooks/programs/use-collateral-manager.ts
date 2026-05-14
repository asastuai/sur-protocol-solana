"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useCollateralManager() {
  return useProgramHandle(IDLS.collateral_manager, PROGRAM_IDS.collateral_manager);
}
