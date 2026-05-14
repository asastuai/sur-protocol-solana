"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";

import { useSurPrograms } from "@/hooks/use-sur-programs";
import { useMarkets } from "@/hooks/data/use-markets";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { USDC_DECIMALS } from "@/lib/devnet-constants";

function formatBN(n: BN | undefined, decimals: number): string {
  if (!n) return "—";
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = n.div(divisor).toString();
  const frac = n.mod(divisor).toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export default function TestProgramsPage() {
  const programs = useSurPrograms();
  const entries = Object.entries(programs);

  const { publicKey, connected } = useWallet();
  const trader = connected ? publicKey ?? undefined : undefined;

  const { markets, loading: marketsLoading, error: marketsError } = useMarkets();
  const {
    balance,
    loading: balLoading,
    error: balError,
  } = useVaultBalance(trader);

  return (
    <main className="min-h-screen p-8 space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight mb-6">
          SUR Programs — wiring smoke test
        </h1>
        <p className="text-sur-muted mb-8 text-sm">
          Renders the 11 Anchor Program instances and their program IDs.
          No RPC calls, no account reads, no transactions. Proves Phase 2 wiring compiles.
        </p>
        <ul className="space-y-2 font-mono text-sm">
          {entries.map(([name, { programId }]) => (
            <li
              key={name}
              className="flex flex-col gap-1 border border-sur-border bg-sur-surface rounded-md p-3"
            >
              <span className="text-sur-text">{name}</span>
              <span className="text-sur-muted break-all">
                {programId.toBase58()}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          Phase 3 — read paths smoke test
        </h2>
        <p className="text-sur-muted text-sm mb-4">
          Exercises <code className="font-mono">useMarkets()</code> +{" "}
          <code className="font-mono">useVaultBalance()</code> against devnet.
          Empty results are expected until programs are initialized (Phase 9).
        </p>

        <div className="border border-sur-border bg-sur-surface rounded-md p-4 text-sm space-y-1">
          <div className="font-medium mb-2">useMarkets()</div>
          {marketsLoading ? (
            <div className="text-sur-muted">Loading…</div>
          ) : marketsError ? (
            <div className="text-red-400">Error: {marketsError.message}</div>
          ) : markets.length === 0 ? (
            <div className="text-sur-muted">
              0 markets on-chain — not initialized yet (expected on devnet).
            </div>
          ) : (
            <ul className="font-mono">
              {markets.map((m) => (
                <li key={m.pda.toBase58()}>
                  {m.symbol} — mark ${formatBN(m.markPrice, 6)} — active{" "}
                  {String(m.active)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border border-sur-border bg-sur-surface rounded-md p-4 text-sm">
          <div className="font-medium mb-2">useVaultBalance(connected wallet)</div>
          {!trader ? (
            <div className="text-sur-muted">No wallet connected.</div>
          ) : balLoading ? (
            <div className="text-sur-muted">Loading…</div>
          ) : balError ? (
            <div className="text-red-400">Error: {balError.message}</div>
          ) : (
            <div className="font-mono">
              ${formatBN(balance, USDC_DECIMALS)} USDC{" "}
              <span className="text-sur-muted">
                ({balance?.isZero() ? "account not initialized — zero" : "from PDA"})
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
