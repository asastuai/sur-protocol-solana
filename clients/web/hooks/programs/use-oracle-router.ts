"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useOracleRouter() {
  return useProgramHandle(IDLS.oracle_router, PROGRAM_IDS.oracle_router);
}
