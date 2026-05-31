"use client";

import { useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import {
  useOpenPositions,
  type OpenPosition,
} from "@/hooks/data/use-open-positions";
import { useMarkets } from "@/hooks/data/use-markets";
import { type MarketState } from "@/hooks/data/use-market-state";
import { useClosePosition } from "@/hooks/tx/use-close-position";
import {
  formatBN,
  bnToNumber,
  fmtUsd,
  fmtUsdSigned,
  USDC_DECIMALS,
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  truncatePubkey,
} from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { CopyAddress } from "@/components/ui/CopyAddress";
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import { WalletButton } from "@/components/layout/WalletButton";

type Tab = "positions" | "history";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode the trailing zero-padded ASCII symbol from a 32-byte market id. */
function symbolFromMarketIdBytes(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

function marketKey(idBytes: Uint8Array): string {
  return Buffer.from(idBytes).toString("hex");
}

/**
 * Client-side unrealized PnL in USDC (human units).
 *
 * Price carries PRICE_DECIMALS (6), size carries SIZE_DECIMALS (8). We
 * convert both to numbers first, then:
 *   uPnL = (mark - entry) * size       for longs
 *   uPnL = (entry - mark) * size       for shorts
 * size is taken absolute because `isLong` already encodes direction.
 *
 * Returns 0 when no mark price is available yet (no on-chain feed) so the
 * UI degrades gracefully to a flat row rather than NaN.
 */
function unrealizedPnlUsd(
  pos: OpenPosition,
  markPrice: BN | undefined,
): number | null {
  if (!markPrice || markPrice.isZero()) return null;
  const entry = bnToNumber(pos.entryPrice, PRICE_DECIMALS);
  const mark = bnToNumber(markPrice, PRICE_DECIMALS);
  const size = Math.abs(bnToNumber(pos.size, SIZE_DECIMALS));
  const dir = pos.isLong ? 1 : -1;
  return (mark - entry) * size * dir;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { balance, loading: balLoading, refetch: refetchBalance } =
    useVaultBalance(trader);
  const {
    positions,
    loading: posLoading,
    refetch: refetchPositions,
  } = useOpenPositions(trader);
  const { markets, loading: marketsLoading } = useMarkets();

  const closePosition = useClosePosition();

  const [tab, setTab] = useState<Tab>("positions");
  const [closingPda, setClosingPda] = useState<string | null>(null);

  // marketId(hex) -> on-chain MarketState (mark price, pda, symbol).
  const marketByKey = useMemo(() => {
    const map = new Map<string, MarketState>();
    for (const m of markets) map.set(marketKey(m.marketId), m);
    return map;
  }, [markets]);

  // ---- derived account summary -------------------------------------------
  const balanceUsd = balance ? bnToNumber(balance, USDC_DECIMALS) : 0;

  const totalMarginUsed = useMemo(
    () =>
      positions.reduce(
        (sum, p) => sum + bnToNumber(p.margin, USDC_DECIMALS),
        0,
      ),
    [positions],
  );

  const totalUnrealizedPnl = useMemo(
    () =>
      positions.reduce((sum, p) => {
        const mark = marketByKey.get(marketKey(p.marketId))?.markPrice;
        const upnl = unrealizedPnlUsd(p, mark);
        return sum + (upnl ?? 0);
      }, 0),
    [positions, marketByKey],
  );

  // Estimated equity = free balance + margin locked in positions + uPnL.
  const estEquity = balanceUsd + totalMarginUsed + totalUnrealizedPnl;

  const summaryLoading =
    (balLoading && !balance) || (posLoading && positions.length === 0);

  // ---- close handler ------------------------------------------------------
  async function handleClose(pos: OpenPosition) {
    const market = marketByKey.get(marketKey(pos.marketId));
    if (!market || market.markPrice.isZero()) {
      toast.error("No mark price available", {
        description:
          "The market has no on-chain mark price yet — cannot derive a fill price to close against.",
        duration: 8000,
      });
      return;
    }

    const pda = pos.pda.toBase58();
    setClosingPda(pda);
    try {
      const sig = await closePosition({
        marketId: pos.marketId,
        fillPrice: market.markPrice,
      });
      toast.success("Position closed", {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      refetchPositions();
      refetchBalance();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setClosingPda(null);
    }
  }

  // ---- connect-wallet empty state ----------------------------------------
  if (!connected) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-sur-surface border border-sur-border flex items-center justify-center mx-auto mb-5">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-sur-muted"
            >
              <path
                d="M21 12V7H5a2 2 0 010-4h14v4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 5v14a2 2 0 002 2h16v-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18 12a2 2 0 100 4 2 2 0 000-4z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Connect your wallet</h2>
          <p className="text-sm text-sur-muted mb-6">
            Connect a Solana wallet to view your vault balance, open positions,
            and unrealized PnL on devnet.
          </p>
          <div className="flex justify-center">
            <WalletButton />
          </div>
        </div>
      </div>
    );
  }

  const pnlColor =
    totalUnrealizedPnl > 0
      ? "text-sur-green"
      : totalUnrealizedPnl < 0
        ? "text-sur-red"
        : undefined;

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
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
          {publicKey && (
            <CopyAddress
              address={publicKey}
              label="Wallet"
              chars={4}
              className="text-[11px]"
            />
          )}
        </div>

        {/* Devnet operator disclaimer — close routes through perp_engine,
            which requires an operator signer. Be honest about it. */}
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-sur-accent/25 bg-sur-accent/[0.06] px-3 py-2.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-sur-accent mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          <p className="text-[11px] leading-relaxed text-sur-muted">
            <span className="text-sur-text font-medium">Devnet demo.</span>{" "}
            Closing a position calls{" "}
            <span className="font-mono text-sur-text">
              perp_engine.close_position
            </span>
            , which requires an engine operator signer — here your connected
            wallet acts as operator and must be registered. This is not
            non-custodial single-sig trading. Unrealized PnL is computed
            client-side from the on-chain mark price (no external price feed).
          </p>
        </div>

        {/* Account summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 bg-sur-surface border border-sur-border rounded-xl p-6">
          <MetricBox
            label="Est. Equity"
            value={fmtUsd(estEquity)}
            sub="balance + margin + uPnL"
            loading={summaryLoading}
          />
          <MetricBox
            label="Free Balance"
            value={fmtUsd(balanceUsd)}
            sub="vault deposit"
            loading={balLoading && !balance}
          />
          <MetricBox
            label="Margin Used"
            value={fmtUsd(totalMarginUsed)}
            sub="locked in positions"
            loading={summaryLoading}
          />
          <MetricBox
            label="Unrealized PnL"
            value={fmtUsdSigned(totalUnrealizedPnl)}
            sub={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
            color={pnlColor}
            loading={summaryLoading || (marketsLoading && markets.length === 0)}
          />
        </div>

        {/* Tabs */}
        <div className="bg-sur-surface border border-sur-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-1 border-b border-sur-border px-4 pt-1">
            {(
              [
                {
                  key: "positions" as const,
                  label: "Open Positions",
                  count: positions.length,
                },
                { key: "history" as const, label: "History", count: 0 },
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-[12px] font-medium transition-colors relative ${
                  tab === t.key
                    ? "text-sur-text"
                    : "text-sur-muted hover:text-sur-text"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-sur-accent/20 text-sur-accent tabular-nums">
                    {t.count}
                  </span>
                )}
                {tab === t.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sur-accent" />
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[220px]">
            {tab === "positions" &&
              (posLoading && positions.length === 0 ? (
                <div aria-label="Loading positions" className="pt-1">
                  <SkeletonTable rows={3} cols={7} />
                </div>
              ) : positions.length === 0 ? (
                <EmptyPositions />
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-sur-muted uppercase tracking-wider">
                        {[
                          { h: "Market", align: "left" },
                          { h: "Side", align: "left" },
                          { h: "Size", align: "right" },
                          { h: "Entry", align: "right" },
                          { h: "Mark", align: "right" },
                          { h: "uPnL", align: "right" },
                          { h: "Margin", align: "right" },
                          { h: "", align: "right" },
                        ].map(({ h, align }, i) => (
                          <th
                            key={h || `act-${i}`}
                            className={`${
                              align === "left" ? "text-left" : "text-right"
                            } px-4 py-2.5 font-medium whitespace-nowrap`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => {
                        const market = marketByKey.get(marketKey(p.marketId));
                        const symbol = symbolFromMarketIdBytes(p.marketId);
                        const mark = market?.markPrice;
                        const upnl = unrealizedPnlUsd(p, mark);
                        const pda = p.pda.toBase58();
                        const closing = closingPda === pda;
                        return (
                          <tr
                            key={pda}
                            className="text-[11px] hover:bg-white/[0.02] border-t border-sur-border/50"
                          >
                            {/* Market + PDA / market copy links */}
                            <td className="px-4 py-3">
                              <div className="font-medium">{symbol}</div>
                              <div className="mt-1 flex flex-col gap-0.5">
                                <CopyAddress
                                  address={p.pda}
                                  label="pos"
                                  chars={4}
                                  className="text-[10px]"
                                />
                                {market && (
                                  <CopyAddress
                                    address={market.pda}
                                    label="mkt"
                                    chars={4}
                                    className="text-[10px]"
                                  />
                                )}
                              </div>
                            </td>

                            {/* Side */}
                            <td className="px-4 py-3 align-top">
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

                            {/* Size */}
                            <td className="text-right px-4 py-3 tabular-nums font-mono align-top">
                              {formatBN(p.size.abs(), SIZE_DECIMALS, 4)}
                            </td>

                            {/* Entry */}
                            <td className="text-right px-4 py-3 tabular-nums font-mono align-top">
                              ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                            </td>

                            {/* Mark */}
                            <td className="text-right px-4 py-3 tabular-nums font-mono align-top">
                              {mark && !mark.isZero() ? (
                                `$${formatBN(mark, PRICE_DECIMALS, 2)}`
                              ) : (
                                <span className="text-sur-muted">—</span>
                              )}
                            </td>

                            {/* uPnL */}
                            <td className="text-right px-4 py-3 tabular-nums font-mono align-top">
                              {upnl === null ? (
                                <span
                                  className="text-sur-muted"
                                  title="Awaiting on-chain mark price"
                                >
                                  —
                                </span>
                              ) : (
                                <span
                                  className={
                                    upnl > 0
                                      ? "text-sur-green"
                                      : upnl < 0
                                        ? "text-sur-red"
                                        : ""
                                  }
                                >
                                  {fmtUsdSigned(upnl)}
                                </span>
                              )}
                            </td>

                            {/* Margin */}
                            <td className="text-right px-4 py-3 tabular-nums font-mono align-top">
                              ${formatBN(p.margin, USDC_DECIMALS, 2)}
                            </td>

                            {/* Close action */}
                            <td className="text-right px-4 py-3 align-top">
                              <Button
                                variant="danger"
                                size="xs"
                                loading={closing}
                                disabled={closing || !mark || mark.isZero()}
                                onClick={() => handleClose(p)}
                                title={
                                  !mark || mark.isZero()
                                    ? "No mark price — cannot close"
                                    : "Close at mark price"
                                }
                              >
                                {closing ? "Closing" : "Close"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === "history" && <EmptyHistory />}
          </div>
        </div>

        {tab === "positions" && positions.length > 0 && (
          <p className="mt-3 text-[10px] text-sur-muted leading-relaxed">
            Close routes through{" "}
            <span className="font-mono">perp_engine.close_position</span> at the
            current on-chain mark price (full close — the v0.3 instruction has
            no partial-close arg). uPnL is an off-chain estimate from
            mark&nbsp;−&nbsp;entry.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricBox({
  label,
  value,
  sub,
  color,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-sur-muted font-medium uppercase tracking-wider mb-1">
        {label}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-6 w-24 mt-0.5" />
          {sub && <Skeleton className="h-2.5 w-20 mt-2" />}
        </>
      ) : (
        <>
          <div
            className={`text-xl font-bold tabular-nums font-mono ${color || ""}`}
          >
            {value}
          </div>
          {sub && (
            <div className="text-[10px] text-sur-muted mt-0.5">{sub}</div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyPositions() {
  return (
    <div className="flex flex-col items-center justify-center h-56 text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-sur-surface-2 border border-sur-border flex items-center justify-center mb-3">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-sur-muted"
        >
          <path
            d="M3 3v18h18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7 14l4-4 3 3 5-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-sur-text mb-1">
        No open positions
      </p>
      <p className="text-xs text-sur-muted max-w-xs">
        You have no open positions on devnet. Open one from the Trade page —
        BTC-USD, SOL-USD, or ETH-USD.
      </p>
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center h-56 text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-sur-surface-2 border border-sur-border flex items-center justify-center mb-3">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-sur-muted"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-sur-text mb-1">
        Trade history — coming soon
      </p>
      <p className="text-xs text-sur-muted max-w-sm">
        There is no on-chain event indexing yet. Once an indexer is wired to
        the engine&apos;s position-update emits, your fills and realized PnL
        will appear here.
      </p>
    </div>
  );
}
