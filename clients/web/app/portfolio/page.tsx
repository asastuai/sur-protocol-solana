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
import {
  DossierHeader,
  DashedPanel,
  SectionLabel,
  Stamp,
  Leader,
} from "@/components/dossier/kit";

type TimeRange = "24h" | "7d" | "30d" | "all";
type Tab = "positions" | "history";

const ROMAN = ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X."];

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
      <div className="min-h-screen bg-ink font-mono text-bone">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-8">
          <DashedPanel title="Access" className="w-full max-w-md" bodyClassName="p-8">
            <SectionLabel>handler not authenticated</SectionLabel>
            <h2 className="font-display text-2xl tracking-tight text-bone">
              Connect Your Wallet
            </h2>
            <p className="mt-3 text-[12px] leading-relaxed text-sur-muted">
              Connect a Solana wallet to decrypt your portfolio, balances, and
              positions on devnet.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Stamp tone="rust">Locked</Stamp>
              <Stamp tone="muted">Solana Devnet</Stamp>
            </div>
          </DashedPanel>
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
    ? "text-gold"
    : "text-rust";
  const freeUi = balance ? `$${formatBN(balance, USDC_DECIMALS, 2)}` : "$0.00";

  return (
    <div className="min-h-screen overflow-y-auto bg-ink font-mono text-bone">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <DossierHeader
          path="portfolio"
          title="Portfolio Dossier"
          subtitle={
            publicKey
              ? `handler · ${truncatePubkey(publicKey.toBase58(), 8, 8)} · solana devnet`
              : "handler · solana devnet"
          }
          stamps={<Stamp>Devnet</Stamp>}
          right={
            <div className="flex items-center gap-1 border border-dashed border-ash p-0.5">
              {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                    timeRange === r
                      ? "bg-smoke text-gold"
                      : "text-sur-muted hover:text-bone"
                  }`}
                >
                  {r === "all" ? "All" : r.toUpperCase()}
                </button>
              ))}
            </div>
          }
        />

        {/* Account overview */}
        <DashedPanel title="Summary Sheet" bodyClassName="p-0">
          <div className="grid grid-cols-2 md:grid-cols-4">
            <MetricBox label="Equity" value={equityUi} loading={viewLoading && !details} divider />
            <MetricBox label="Free Balance" value={freeUi} loading={balLoading && !balance} divider />
            <MetricBox
              label="Unrealized PnL"
              value={upnlUi}
              color={details && !details.totalUnrealizedPnl.isZero() ? upnlColor : undefined}
              loading={viewLoading && !details}
              divider
            />
            <MetricBox
              label="Open Positions"
              value={String(details?.positionCount ?? positions.length)}
              loading={viewLoading && !details}
            />
          </div>
        </DashedPanel>

        {/* Tabs */}
        <DashedPanel title="Case Files" className="mt-8" bodyClassName="p-0">
          <div className="flex items-center gap-1 border-b border-dashed border-ash px-4 pt-1">
            {(
              [
                { key: "positions" as const, label: "Open Positions", count: positions.length },
                { key: "history" as const, label: "Trade History", count: 0 },
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-4 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  tab === t.key ? "text-gold" : "text-sur-muted hover:text-bone"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 border border-gold px-1.5 py-0.5 text-[9px] text-gold">
                    {t.count}
                  </span>
                )}
                {tab === t.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gold" />
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
                <div className="flex h-48 items-center justify-center text-[12px] uppercase tracking-[0.18em] text-sur-muted">
                  No open positions on devnet.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dashed border-ash text-[10px] uppercase tracking-[0.18em] text-sur-muted">
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
                    {positions.map((p, i) => {
                      const symbol = symbolFromMarketIdBytes(p.marketId);
                      return (
                        <tr
                          key={p.pda.toBase58()}
                          className="border-t border-dashed border-ash text-[11px] hover:bg-smoke/60"
                        >
                          <td className="px-4 py-3">
                            <span className="mr-2 text-gold">{ROMAN[i] ?? `${i + 1}.`}</span>
                            <span className="text-bone">{symbol}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] uppercase tracking-widest ${
                                p.isLong ? "text-gold" : "text-rust"
                              }`}
                            >
                              {p.isLong ? "long" : "short"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sur-muted">
                            {formatBN(p.size.abs(), SIZE_DECIMALS, 4)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sur-muted">
                            ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-bone">
                            ${formatBN(p.margin, USDC_DECIMALS, 2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}

            {tab === "history" && (
              <div className="flex h-48 items-center justify-center px-6 text-center text-[12px] leading-relaxed text-sur-muted">
                Trade history is not indexed yet on devnet. Phase 8 polish
                will wire an event listener for the engine&apos;s
                position-update emits.
              </div>
            )}
          </div>
        </DashedPanel>

        {/* footer */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ash pt-4 text-[10px] uppercase tracking-[0.2em] text-sur-muted">
          <span>SUR // Solana Devnet // portfolio dossier</span>
          <span className="flex items-center gap-2">
            range
            <Leader />
            <span className="text-gold">{timeRange === "all" ? "all" : timeRange}</span>
          </span>
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
  divider,
}: {
  label: string;
  value: string;
  color?: string;
  loading?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={`p-5 ${divider ? "border-b border-dashed border-ash md:border-b-0 md:border-r" : ""}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-24" />
      ) : (
        <div className={`mt-1.5 text-xl tabular-nums ${color || "text-bone"}`}>
          {value}
        </div>
      )}
    </div>
  );
}
