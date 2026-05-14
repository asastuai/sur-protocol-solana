"use client";

import { IDLS } from "@/lib/idls";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { useProgramHandle } from "./_factory";

export function useInsuranceFund() {
  return useProgramHandle(IDLS.insurance_fund, PROGRAM_IDS.insurance_fund);
}
