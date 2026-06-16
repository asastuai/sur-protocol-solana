"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useEngineView } from "@/hooks/data/use-engine-view";
import { formatBN, USDC_DECIMALS } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/Skeleton";

export function AccountPanel() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { balance, loading: balLoading } = useVaultBalance(trader);
  const { details, loading: viewLoading } = useEngineView(trader);

  const equity = details ? `$${formatBN(details.totalEquity, USDC_DECIMALS, 2)}` : "$0.00";
  const free = balance ? `$${formatBN(balance, USDC_DECIMALS, 2)}` : "$0.00";
  const upnl = details
    ? `${details.totalUnrealizedPnl.isNeg() ? "-" : ""}$${formatBN(
        details.totalUnrealizedPnl.abs(),
        USDC_DECIMALS,
        2,
      )}`
    : "$0.00";
  const upnlColor = details && !details.totalUnrealizedPnl.isNeg()
    ? "text-sur-green"
    : "text-sur-red";

  return (
    <div>
      <div className="px-3 py-2 border-b border-dashed border-ash flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sur-muted">
            Account
          </span>
          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sur-accent/15 text-sur-accent">
            Devnet
          </span>
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {!trader ? (
          <p className="text-[10px] text-sur-muted text-center py-2">
            Connect wallet to view balances.
          </p>
        ) : (
          <>
            <Row label="Equity" value={equity} loading={viewLoading && !details} highlight />
            <Row label="Free Balance" value={free} loading={balLoading && !balance} />
            <Row
              label="Unrealized PnL"
              value={upnl}
              loading={viewLoading && !details}
              colorClass={details && !details.totalUnrealizedPnl.isZero() ? upnlColor : undefined}
            />
            <Row
              label="Positions"
              value={String(details?.positionCount ?? 0)}
              loading={viewLoading && !details}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  colorClass,
  highlight,
  loading,
}: {
  label: string;
  value: string;
  colorClass?: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sur-muted">{label}</span>
      {loading ? (
        <Skeleton className="h-3 w-16" />
      ) : (
        <span
          className={`text-xs font-mono tabular-nums ${
            colorClass ?? (highlight ? "text-sur-text font-semibold" : "text-sur-muted")
          }`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
