"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useEngineView } from "@/hooks/data/use-engine-view";
import {
  formatBN,
  USDC_DECIMALS,
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  truncatePubkey,
} from "@/lib/formatters";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

type TimeRange = "24h" | "7d" | "30d" | "all";
type Tab = "positions" | "history";

function symbolFromMarketIdBytes(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { balance, loading: balLoading } = useVaultBalance(trader);
  const { positions, loading: posLoading } = useOpenPositions(trader);
  const { details, loading: viewLoading } = useEngineView(trader);

  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [tab, setTab] = useState<Tab>("positions");

  if (!connected) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-sur-surface border border-sur-border flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sur-muted">
              <path d="M21 12V7H5a2 2 0 010-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 5v14a2 2 0 002 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-sur-muted">
            Connect a Solana wallet to view your portfolio, balances, and
            positions on devnet.
          </p>
        </div>
      </div>
    );
  }

  const equityUi = details
    ? `$${formatBN(details.totalEquity, USDC_DECIMALS, 2)}`
    : "$0.00";
  const upnlUi = details
    ? `${details.totalUnrealizedPnl.isNeg() ? "-" : "+"}$${formatBN(
        details.totalUnrealizedPnl.abs(),
        USDC_DECIMALS,
        2,
      )}`
    : "$0.00";
  const upnlColor = details && !details.totalUnrealizedPnl.isNeg()
    ? "text-sur-green"
    : "text-sur-red";
  const freeUi = balance ? `$${formatBN(balance, USDC_DECIMALS, 2)}` : "$0.00";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold">Portfolio</h1>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sur-accent/15 text-sur-accent">
                Devnet
              </span>
            </div>
            <p className="text-xs text-sur-muted font-mono">
              {publicKey ? truncatePubkey(publicKey.toBase58(), 8, 8) : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-sur-surface border border-sur-border rounded-lg p-0.5">
            {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                  timeRange === r
                    ? "bg-white/[0.08] text-sur-text"
                    : "text-sur-muted hover:text-sur-text"
                }`}
              >
                {r === "all" ? "All" : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Account overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 bg-sur-surface border border-sur-border rounded-xl p-6">
          <MetricBox label="Equity" value={equityUi} loading={viewLoading && !details} />
          <MetricBox label="Free Balance" value={freeUi} loading={balLoading && !balance} />
          <MetricBox
            label="Unrealized PnL"
            value={upnlUi}
            color={details && !details.totalUnrealizedPnl.isZero() ? upnlColor : undefined}
            loading={viewLoading && !details}
          />
          <MetricBox
            label="Open Positions"
            value={String(details?.positionCount ?? positions.length)}
            loading={viewLoading && !details}
          />
        </div>

        {/* Tabs */}
        <div className="bg-sur-surface border border-sur-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-1 border-b border-sur-border px-4 pt-1">
            {(
              [
                { key: "positions" as const, label: "Open Positions", count: positions.length },
                { key: "history" as const, label: "Trade History", count: 0 },
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-[12px] font-medium transition-colors relative ${
                  tab === t.key ? "text-sur-text" : "text-sur-muted hover:text-sur-text"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-sur-accent/20 text-sur-accent">
                    {t.count}
                  </span>
                )}
                {tab === t.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sur-accent" />
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[200px]">
            {tab === "positions" &&
              (posLoading && positions.length === 0 ? (
                <div aria-label="Loading positions" className="pt-1">
                  <SkeletonTable rows={3} cols={5} />
                </div>
              ) : positions.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-xs text-sur-muted">
                  No open positions on devnet.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-sur-muted uppercase tracking-wider">
                      {["Market", "Side", "Size", "Entry", "Margin"].map((h) => (
                        <th
                          key={h}
                          className={`${
                            h === "Market" || h === "Side" ? "text-left" : "text-right"
                          } px-4 py-2.5 font-medium`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const symbol = symbolFromMarketIdBytes(p.marketId);
                      return (
                        <tr
                          key={p.pda.toBase58()}
                          className="text-[11px] hover:bg-white/[0.02] border-t border-sur-border/50"
                        >
                          <td className="px-4 py-3 font-medium">{symbol}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                p.isLong
                                  ? "bg-sur-green/10 text-sur-green"
                                  : "bg-sur-red/10 text-sur-red"
                              }`}
                            >
                              {p.isLong ? "LONG" : "SHORT"}
                            </span>
                          </td>
                          <td className="text-right px-4 py-3 tabular-nums font-mono">
                            {formatBN(p.size.abs(), SIZE_DECIMALS, 4)}
                          </td>
                          <td className="text-right px-4 py-3 tabular-nums font-mono">
                            ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                          </td>
                          <td className="text-right px-4 py-3 tabular-nums font-mono">
                            ${formatBN(p.margin, USDC_DECIMALS, 2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}

            {tab === "history" && (
              <div className="flex items-center justify-center h-48 text-xs text-sur-muted">
                Trade history is not indexed yet on devnet. Phase 8 polish
                will wire an event listener for the engine&apos;s
                position-update emits.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: string;
  color?: string;
  loading?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-sur-muted font-medium uppercase tracking-wider mb-1">
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-24 mt-0.5" />
      ) : (
        <div className={`text-xl font-bold tabular-nums font-mono ${color || ""}`}>
          {value}
        </div>
      )}
    </div>
  );
}
