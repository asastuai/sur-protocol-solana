"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function usePerpEngine() {
  return useProgramHandle(IDLS.perp_engine, PROGRAM_IDS.perp_engine);
}
