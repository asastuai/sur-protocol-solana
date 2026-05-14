"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useSurTimelock() {
  return useProgramHandle(IDLS.sur_timelock, PROGRAM_IDS.sur_timelock);
}
