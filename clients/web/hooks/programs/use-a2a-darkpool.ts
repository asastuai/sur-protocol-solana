"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useA2aDarkpool() {
  return useProgramHandle(IDLS.a2a_darkpool, PROGRAM_IDS.a2a_darkpool);
}
