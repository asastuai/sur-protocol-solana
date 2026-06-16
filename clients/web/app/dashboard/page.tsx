"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { useMarkets } from "@/hooks/data/use-markets";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useEngineView } from "@/hooks/data/use-engine-view";
import {
  formatBN,
  USDC_DECIMALS,
  PRICE_DECIMALS,
  SIZE_DECIMALS,
} from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { SkeletonTable } from "@/components/ui/Skeleton";
import {
  DossierHeader,
  DashedPanel,
  SectionLabel,
  Stamp,
} from "@/components/dossier/kit";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

function MarketOverview() {
  const { markets, loading, error } = useMarkets();

  if (loading) {
    return (
      <div className="overflow-hidden" aria-label="Loading markets…">
        <SkeletonTable rows={3} cols={4} />
      </div>
    );
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-rust">
        Failed to load markets: {error.message}
      </p>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex items-start gap-3 bg-smoke p-4 text-sm text-sur-muted">
        <span className="mt-0.5 shrink-0 text-gold">▸</span>
        <div>
          Markets not initialized on devnet yet — Phase 9 will run init from
          an admin wallet. Read paths are wired and will populate
          automatically once markets exist on-chain.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[10px] uppercase tracking-[0.18em] text-sur-muted">
          <tr className="border-b border-dashed border-ash">
            <th className="px-4 py-2 font-normal">Market</th>
            <th className="px-4 py-2 text-right font-normal">Mark</th>
            <th className="px-4 py-2 text-right font-normal">OI Long</th>
            <th className="px-4 py-2 text-right font-normal">OI Short</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr
              key={m.pda.toBase58()}
              className="border-b border-dashed border-ash last:border-b-0 hover:bg-smoke/40"
            >
              <td className="px-4 py-2.5 text-bone">{m.symbol}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-bone">
                ${formatBN(m.markPrice, PRICE_DECIMALS, 2)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-sur-muted">
                {formatBN(m.openInterestLong, SIZE_DECIMALS, 4)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-sur-muted">
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
  const { details, loading: viewLoading, error: viewError } =
    useEngineView(trader);

  if (!trader) {
    return (
      <div className="border border-dashed border-ash bg-smoke p-6 text-sm text-sur-muted">
        Connect wallet to see your account.
      </div>
    );
  }

  const anyError = balError ?? posError ?? viewError;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 border border-dashed border-ash md:grid-cols-4">
        <Stat
          label="Free balance"
          value={balLoading ? "…" : `$${formatBN(balance, USDC_DECIMALS, 2)}`}
          divider
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
          divider
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
          tone="gold"
          divider
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
        <SectionLabel>open positions</SectionLabel>
        {posLoading ? (
          <div
            className="overflow-hidden border border-dashed border-ash"
            aria-label="Loading positions…"
          >
            <SkeletonTable rows={2} cols={5} />
          </div>
        ) : positions.length === 0 ? (
          <DashedPanel title="Open positions" bodyClassName="p-4">
            <p className="text-sm text-sur-muted">No open positions.</p>
          </DashedPanel>
        ) : (
          <DashedPanel title="Open positions" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  <tr className="border-b border-dashed border-ash">
                    <th className="px-4 py-2 font-normal">Market</th>
                    <th className="px-4 py-2 font-normal">Side</th>
                    <th className="px-4 py-2 text-right font-normal">Size</th>
                    <th className="px-4 py-2 text-right font-normal">Entry</th>
                    <th className="px-4 py-2 text-right font-normal">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr
                      key={p.pda.toBase58()}
                      className="border-b border-dashed border-ash last:border-b-0"
                    >
                      <td className="px-4 py-2.5 text-bone">
                        {symbolFromIdBytes(p.marketId)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "text-[11px] uppercase tracking-widest",
                            p.isLong ? "text-gold" : "text-rust",
                          )}
                        >
                          {p.isLong ? "long" : "short"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sur-muted">
                        {formatBN(p.size, SIZE_DECIMALS, 4)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sur-muted">
                        ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-bone">
                        ${formatBN(p.margin, USDC_DECIMALS, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashedPanel>
        )}
      </div>

      {anyError && (
        <p className="text-xs text-rust">
          RPC error: {anyError.message}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "bone",
  divider = false,
}: {
  label: string;
  value: string;
  tone?: "bone" | "gold";
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "p-4",
        divider && "border-b border-dashed border-ash md:border-b-0 md:border-r",
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-xl tabular-nums",
          tone === "gold" ? "text-gold" : "text-bone",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-6 md:p-10">
      <DossierHeader
        path="dashboard"
        title="Dashboard"
        subtitle="solana devnet · read paths"
        stamps={
          <>
            <Stamp>Devnet // 2026</Stamp>
            <Stamp tone="muted">Read-only</Stamp>
          </>
        }
        right={<WalletMultiButton />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>markets ledger</SectionLabel>
          <DashedPanel title="Markets ledger" bodyClassName="p-0">
            <MarketOverview />
          </DashedPanel>
        </section>

        <section>
          <SectionLabel>my account</SectionLabel>
          <MyAccount />
        </section>
      </div>
    </div>
  );
}
