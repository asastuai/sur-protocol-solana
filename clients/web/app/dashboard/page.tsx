"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import {
  Activity,
  Wallet,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";

import { useMarkets } from "@/hooks/data/use-markets";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useEngineView } from "@/hooks/data/use-engine-view";
import { USDC_DECIMALS } from "@/lib/devnet-constants";
import { cn } from "@/lib/cn";
import { SkeletonTable } from "@/components/ui/Skeleton";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

// Price has 6 decimals. We format to 2 fractional digits for display.
const PRICE_DECIMALS = 6;
// Size has 8 decimals on-chain (SIZE_PRECISION = 1e8).
const SIZE_DECIMALS = 8;

function formatBN(n: BN | undefined, decimals: number, fractionDigits = 2): string {
  if (!n) return "—";
  const negative = n.isNeg();
  const abs = negative ? n.neg() : n;
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = abs.div(divisor).toString();
  const frac = abs.mod(divisor).toString().padStart(decimals, "0");
  const truncFrac = frac.slice(0, fractionDigits).padEnd(fractionDigits, "0");
  const out = fractionDigits > 0 ? `${whole}.${truncFrac}` : whole;
  return negative ? `-${out}` : out;
}

function MarketOverview() {
  const { markets, loading, error } = useMarkets();

  if (loading) {
    return (
      <div
        className="rounded-md border border-sur-border overflow-hidden"
        aria-label="Loading markets…"
      >
        <SkeletonTable rows={3} cols={4} />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-400">
        Failed to load markets: {error.message}
      </p>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex gap-3 items-start rounded-md border border-sur-border bg-sur-surface p-4 text-sm text-sur-muted">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-sur-accent" />
        <div>
          Markets not initialized on devnet yet — Phase 9 will run init from
          an admin wallet. Read paths are wired and will populate
          automatically once markets exist on-chain.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-sur-border">
      <table className="w-full text-sm">
        <thead className="bg-sur-surface text-sur-muted text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Market</th>
            <th className="px-3 py-2 font-medium text-right">Mark</th>
            <th className="px-3 py-2 font-medium text-right">OI Long</th>
            <th className="px-3 py-2 font-medium text-right">OI Short</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sur-border">
          {markets.map((m) => (
            <tr key={m.pda.toBase58()} className="hover:bg-sur-surface/40">
              <td className="px-3 py-2 font-mono">{m.symbol}</td>
              <td className="px-3 py-2 text-right font-mono">
                ${formatBN(m.markPrice, PRICE_DECIMALS, 2)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sur-muted">
                {formatBN(m.openInterestLong, SIZE_DECIMALS, 4)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sur-muted">
                {formatBN(m.openInterestShort, SIZE_DECIMALS, 4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function symbolFromIdBytes(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

function MyAccount() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { balance, loading: balLoading, error: balError } =
    useVaultBalance(trader);
  const { positions, loading: posLoading, error: posError } =
    useOpenPositions(trader);
  const { details, loading: viewLoading } = useEngineView(trader);

  if (!trader) {
    return (
      <div className="rounded-md border border-sur-border bg-sur-surface p-6 text-sm text-sur-muted">
        Connect wallet to see your account.
      </div>
    );
  }

  const anyError = balError ?? posError;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Free balance"
          value={
            balLoading
              ? "…"
              : `$${formatBN(balance, USDC_DECIMALS, 2)}`
          }
          icon={<Wallet className="h-4 w-4" />}
        />
        <Stat
          label="Total equity"
          value={
            viewLoading
              ? "…"
              : details
                ? `$${formatBN(details.totalEquity, USDC_DECIMALS, 2)}`
                : "$0.00"
          }
          icon={<Activity className="h-4 w-4" />}
        />
        <Stat
          label="Unrealized PnL"
          value={
            viewLoading
              ? "…"
              : details
                ? `$${formatBN(details.totalUnrealizedPnl, USDC_DECIMALS, 2)}`
                : "$0.00"
          }
        />
        <Stat
          label="Open positions"
          value={
            viewLoading
              ? "…"
              : String(details?.positionCount ?? positions.length)
          }
        />
      </div>

      <div>
        <h3 className="text-sm font-medium text-sur-muted mb-2">Positions</h3>
        {posLoading ? (
          <div
            className="rounded-md border border-sur-border overflow-hidden"
            aria-label="Loading positions…"
          >
            <SkeletonTable rows={2} cols={5} />
          </div>
        ) : positions.length === 0 ? (
          <p className="text-sm text-sur-muted">No open positions.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-sur-border">
            <table className="w-full text-sm">
              <thead className="bg-sur-surface text-sur-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium text-right">Size</th>
                  <th className="px-3 py-2 font-medium text-right">Entry</th>
                  <th className="px-3 py-2 font-medium text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sur-border">
                {positions.map((p) => (
                  <tr key={p.pda.toBase58()}>
                    <td className="px-3 py-2 font-mono">
                      {symbolFromIdBytes(p.marketId)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          p.isLong ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {p.isLong ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {p.isLong ? "LONG" : "SHORT"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatBN(p.size, SIZE_DECIMALS, 4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${formatBN(p.margin, USDC_DECIMALS, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {anyError && (
        <p className="text-xs text-red-400">
          RPC error: {anyError.message}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-sur-border bg-sur-surface p-3">
      <div className="flex items-center gap-2 text-xs text-sur-muted">
        {icon}
        {label}
      </div>
      <div className="text-lg font-mono mt-1">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6 md:p-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-sur-muted">
            SUR Protocol — devnet read paths
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-medium text-sur-muted uppercase tracking-wide mb-3">
            Market Overview
          </h2>
          <MarketOverview />
        </section>

        <section>
          <h2 className="text-sm font-medium text-sur-muted uppercase tracking-wide mb-3">
            My Account
          </h2>
          <MyAccount />
        </section>
      </div>
    </main>
  );
}
