"use client";

import { useMemo } from "react";
import { Program, type Idl } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";

import { getAnchorProvider } from "@/lib/anchor";

export interface ProgramHandle<P extends Idl> {
  program: Program<P>;
  programId: PublicKey;
}

// Shared per-program hook factory. Memoizes on connection + wallet pubkey
// so the Program instance is stable across renders.
export function useProgramHandle<P extends Idl>(
  idl: P,
  programId: PublicKey,
): ProgramHandle<P> {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const provider = getAnchorProvider(connection, wallet);
    return {
      program: new Program<P>(idl, provider),
      programId,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, wallet?.publicKey?.toBase58(), idl, programId]);
}
