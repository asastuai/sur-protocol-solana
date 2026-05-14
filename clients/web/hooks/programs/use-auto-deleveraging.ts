"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useAutoDeleveraging() {
  return useProgramHandle(IDLS.auto_deleveraging, PROGRAM_IDS.auto_deleveraging);
}
