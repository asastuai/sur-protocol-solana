"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useOrderSettlement() {
  return useProgramHandle(IDLS.order_settlement, PROGRAM_IDS.order_settlement);
}
