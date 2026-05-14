"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useLiquidator() {
  return useProgramHandle(IDLS.liquidator, PROGRAM_IDS.liquidator);
}
