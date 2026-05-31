"use client";

import { useMemo } from "react";
import { BN } from "@coral-xyz/anchor";
import { ShieldCheck, TrendingUp, Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import { fmtUsd, fmtPct } from "@/lib/formatters";
import { CopyAddress } from "@/components/ui/CopyAddress";
import { Button } from "@/components/ui/Button";
import type { TradingVault } from "@/hooks/data/use-trading-vaults";

interface VaultCardProps {
  vault: TradingVault;
  onDeposit: (vault: TradingVault) => void;
  className?: string;
}

function bpsToPct(bps: BN): number {
  return bps.toNumber() / 100;
}

/** Days from a seconds BN, or 0. */
function secsToDays(secs: BN): number {
  if (secs.isZero() || secs.isNeg()) return 0;
  return secs.toNumber() / 86_400;
}

/**
 * Vault preview card. Surfaces the manager (copyable), an approximate TVL
 * and share price (client-side NAV — see useTradingVaults caveats), the
 * performance fee, lockup, and a Deposit CTA.
 *
 * The share-price "trend" bar is a minimal visual derived from share price
 * vs. the 1.0 genesis baseline — NOT a real time series (no external price
 * feed for vault NAV). It is intentionally subtle and labeled "est.".
 */
export function VaultCard({ vault, onDeposit, className }: VaultCardProps) {
  const perfFeePct = bpsToPct(vault.performanceFeeBps);
  const mgmtFeePct = bpsToPct(vault.managementFeeBps);
  const lockupDays = secsToDays(vault.lockupPeriodSecs);

  // PnL vs. genesis baseline (share price starts at 1.0). Estimate only.
  const pnlPct = useMemo(
    () => (vault.estSharePrice - 1) * 100,
    [vault.estSharePrice],
  );
  const pnlUp = pnlPct >= 0;

  const displayName =
    vault.name && vault.name.length > 0
      ? vault.name
      : `Vault ${Buffer.from(vault.id).toString("hex").slice(0, 6)}`;

  return (
    <div
      className={cn(
        "group flex flex-col rounded-xl border border-sur-border bg-sur-surface p-4 transition-colors hover:border-white/15 hover:bg-sur-surface-2",
        className,
      )}
    >
      {/* Header: name + manager */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="shrink-0 text-sur-accent" aria-hidden />
            <h3 className="truncate text-sm font-semibold text-sur-text" title={displayName}>
              {displayName}
            </h3>
          </div>
          <div className="mt-1.5">
            <CopyAddress address={vault.manager} label="Manager" chars={4} />
          </div>
        </div>
        {vault.paused && (
          <span className="shrink-0 rounded bg-sur-red/10 px-1.5 py-0.5 text-[10px] font-medium text-sur-red">
            paused
          </span>
        )}
      </div>

      {/* Description */}
      {vault.description && vault.description.length > 0 && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-sur-muted">
          {vault.description}
        </p>
      )}

      {/* TVL + share price */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-sur-border bg-sur-bg px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-sur-muted">
            TVL <span className="normal-case">(est.)</span>
          </div>
          <div className="mt-0.5 font-mono text-sm tabular-nums text-sur-text">
            {fmtUsd(vault.estEquityUi)}
          </div>
        </div>
        <div className="rounded-lg border border-sur-border bg-sur-bg px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-sur-muted">
            Share px <span className="normal-case">(est.)</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-sm tabular-nums text-sur-text">
              {vault.estSharePrice.toFixed(4)}
            </span>
            <span
              className={cn(
                "inline-flex items-center text-[10px] font-medium tabular-nums",
                pnlUp ? "text-sur-green" : "text-sur-red",
              )}
            >
              <TrendingUp
                size={9}
                className={cn("mr-0.5", !pnlUp && "rotate-180")}
                aria-hidden
              />
              {fmtPct(pnlPct)}
            </span>
          </div>
        </div>
      </div>

      {/* Subtle est. NAV trend bar (baseline 1.0 → current) */}
      <div className="mt-2.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-sur-bg">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pnlUp ? "bg-sur-green/60" : "bg-sur-red/60",
            )}
            style={{
              // Map share price into a 0–100% fill around the 1.0 baseline.
              width: `${Math.max(4, Math.min(100, vault.estSharePrice * 50))}%`,
            }}
          />
        </div>
      </div>

      {/* Footer stats */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-sur-muted">
        <span className="inline-flex items-center gap-1">
          <span className="text-sur-muted">Perf fee</span>
          <span className="font-mono text-sur-text tabular-nums">
            {perfFeePct.toFixed(1)}%
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-sur-muted">Mgmt</span>
          <span className="font-mono text-sur-text tabular-nums">
            {mgmtFeePct.toFixed(1)}%
          </span>
        </span>
        {lockupDays > 0 && (
          <span className="inline-flex items-center gap-1">
            <Lock size={9} aria-hidden />
            <span className="font-mono text-sur-text tabular-nums">
              {lockupDays.toFixed(0)}d
            </span>
          </span>
        )}
      </div>

      {/* CTA */}
      <Button
        variant="primary"
        size="sm"
        className="mt-3.5 w-full"
        onClick={() => onDeposit(vault)}
        disabled={vault.paused}
      >
        {vault.paused ? "Paused" : "Deposit"}
      </Button>
    </div>
  );
}
