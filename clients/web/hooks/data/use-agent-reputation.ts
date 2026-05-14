"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { useA2aDarkpool } from "@/hooks/programs/use-a2a-darkpool";
import { SurPdas } from "@/lib/pdas";

// Mirrors AgentReputation::get_score() in programs/a2a_darkpool/src/state.rs:
// new agents (no history) default to 500 (50%); otherwise
// completed / (completed + expired + cancelled) * REPUTATION_PRECISION.
const REPUTATION_PRECISION = 1000;
const DEFAULT_NEW_AGENT_SCORE = 500;

export interface AgentReputationResult {
  /** 0-1000 scale (matches on-chain REPUTATION_PRECISION). */
  score: number;
  completedTrades: BN;
  totalVolume: BN;
  expiredIntents: BN;
  cancelledResponses: BN;
  /** True when the reputation PDA was never created on-chain. */
  isNew: boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface AgentReputationAccount {
  bump: number;
  agent: PublicKey;
  completedTrades: BN;
  totalVolume: BN;
  expiredIntents: BN;
  cancelledResponses: BN;
  firstTradeAt: BN;
  lastTradeAt: BN;
  lastResponseTime: BN;
}

// Reads the per-agent reputation PDA. Wallet not connected or PDA missing →
// score 0 (per task spec). isNew = true when the PDA is missing; consumers
// can still display "—" or the default 500 themselves.
export function useAgentReputation(
  agent: PublicKey | undefined,
): AgentReputationResult {
  const { program } = useA2aDarkpool();

  const query = useQuery({
    queryKey: ["a2a-reputation", agent?.toBase58() ?? null],
    enabled: !!agent,
    staleTime: 10_000,
    queryFn: async () => {
      if (!agent) {
        return {
          score: 0,
          completedTrades: new BN(0),
          totalVolume: new BN(0),
          expiredIntents: new BN(0),
          cancelledResponses: new BN(0),
          isNew: true,
        };
      }
      const [pda] = SurPdas.agentReputation(agent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = (await (program.account as any).agentReputation.fetchNullable(
        pda,
      )) as AgentReputationAccount | null;

      if (!acc) {
        return {
          score: 0,
          completedTrades: new BN(0),
          totalVolume: new BN(0),
          expiredIntents: new BN(0),
          cancelledResponses: new BN(0),
          isNew: true,
        };
      }

      const total = acc.completedTrades
        .add(acc.expiredIntents)
        .add(acc.cancelledResponses);

      let score: number;
      if (total.isZero()) {
        score = DEFAULT_NEW_AGENT_SCORE;
      } else {
        score = acc.completedTrades
          .muln(REPUTATION_PRECISION)
          .div(total)
          .toNumber();
      }

      return {
        score,
        completedTrades: acc.completedTrades,
        totalVolume: acc.totalVolume,
        expiredIntents: acc.expiredIntents,
        cancelledResponses: acc.cancelledResponses,
        isNew: false,
      };
    },
  });

  const data = query.data ?? {
    score: 0,
    completedTrades: new BN(0),
    totalVolume: new BN(0),
    expiredIntents: new BN(0),
    cancelledResponses: new BN(0),
    isNew: true,
  };

  return {
    ...data,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
  };
}
