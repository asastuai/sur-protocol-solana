"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function usePerpVault() {
  return useProgramHandle(IDLS.perp_vault, PROGRAM_IDS.perp_vault);
}
