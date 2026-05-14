"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ExternalLink } from "lucide-react";

// SSR-disabled wallet connect button — wallet-adapter touches `window` on mount.
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

/**
 * Wallet button with a faucet hint when the connected account has zero SOL.
 * Renders the wallet-adapter button as-is; the hint is a small tooltip card
 * shown below on hover/focus when SOL == 0.
 */
export function WalletButton() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [lamports, setLamports] = useState<number | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setLamports(null);
      return;
    }
    let cancelled = false;
    void connection
      .getBalance(publicKey)
      .then((v) => {
        if (!cancelled) setLamports(v);
      })
      .catch(() => {
        if (!cancelled) setLamports(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, connected]);

  const needsFaucet = lamports !== null && lamports === 0;

  if (!needsFaucet) return <WalletMultiButton />;

  return (
    <div className="relative group">
      <WalletMultiButton />
      <div
        role="tooltip"
        className="absolute right-0 top-full mt-1 z-50 w-56 px-3 py-2 rounded-md bg-sur-surface border border-sur-yellow/30 text-[11px] text-sur-text shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      >
        <div className="text-sur-yellow font-semibold mb-0.5">0 SOL on devnet</div>
        <a
          href="https://faucet.solana.com"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-sur-accent pointer-events-auto hover:underline"
        >
          Get devnet SOL from faucet.solana.com
          <ExternalLink size={9} aria-hidden />
        </a>
      </div>
    </div>
  );
}

// Backward-compat default-style alias (not used elsewhere but kept just in case).
export { WalletMultiButton };

