"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown } from "lucide-react";

import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useMarkets } from "@/hooks/data/use-markets";
import { useClosePosition } from "@/hooks/tx/use-close-position";
import {
  formatBN,
  bnToNumber,
  fmtUsdSigned,
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  USDC_DECIMALS,
} from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { SkeletonTable } from "@/components/ui/Skeleton";

function symbolFromMarketIdBytes(idBytes: Uint8Array): string {
  let end = idBytes.length;
  while (end > 0 && idBytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(idBytes.subarray(0, end));
}

export function PositionsPanel() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { positions, loading, refetch } = useOpenPositions(trader);
  const { markets } = useMarkets();
  const closePosition = useClosePosition();
  const [closing, setClosing] = useState<string | null>(null);

  const marketsBySymbol = useMemo(
    () => new Map(markets.map((m) => [m.symbol, m])),
    [markets],
  );

  async function handleClose(
    pdaBase58: string,
    marketId: Uint8Array,
    symbol: string,
  ) {
    if (closing) return;
    const onChain = marketsBySymbol.get(symbol);
    const fillPrice = onChain?.markPrice;
    // Don't send a sentinel price — without a real on-chain mark there is no
    // honest fill price, so the close button is gated (see disabled state).
    if (!fillPrice || fillPrice.isZero()) {
      toast.warning("No on-chain mark price yet", {
        description: "Close is unavailable until this market has an on-chain mark.",
      });
      return;
    }
    setClosing(pdaBase58);
    try {
      const sig = await closePosition({ marketId, fillPrice });
      toast.success("Close confirmed", {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
      });
      refetch();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setClosing(null);
    }
  }

  if (!connected) {
    return (
      <div className="p-4 text-xs text-sur-muted text-center">
        Connect wallet to view positions.
      </div>
    );
  }

  if (loading) {
    return (
      <div aria-label="Loading positions">
        <SkeletonTable rows={2} cols={8} />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="p-4 text-xs text-sur-muted text-center">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] text-sur-muted uppercase tracking-wider">
            {["Market", "Side", "Size", "Entry", "Mark", "uPnL", "Margin", ""].map((h, i) => (
              <th
                key={h + i}
                className={`${i < 2 ? "text-left" : "text-right"} px-3 py-2 font-medium`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const symbol = symbolFromMarketIdBytes(p.marketId);
            const pda = p.pda.toBase58();
            const onChain = marketsBySymbol.get(symbol);
            const markBn = onChain?.markPrice;
            const hasMark = !!markBn && !markBn.isZero();
            const markNum = hasMark ? bnToNumber(markBn, PRICE_DECIMALS) : 0;
            const entryNum = bnToNumber(p.entryPrice, PRICE_DECIMALS);
            const sizeNum = bnToNumber(p.size.abs(), SIZE_DECIMALS);
            const dir = p.isLong ? 1 : -1;
            const uPnl = hasMark ? (markNum - entryNum) * sizeNum * dir : null;
            return (
              <tr
                key={pda}
                className="border-t border-sur-border/30 hover:bg-white/[0.02]"
              >
                <td className="px-3 py-2 font-medium">{symbol}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      p.isLong
                        ? "bg-sur-green/10 text-sur-green"
                        : "bg-sur-red/10 text-sur-red"
                    }`}
                  >
                    {p.isLong ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {p.isLong ? "LONG" : "SHORT"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatBN(p.size.abs(), SIZE_DECIMALS, 4)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  ${formatBN(p.entryPrice, PRICE_DECIMALS, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-bone/90">
                  {hasMark ? `$${markNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono tabular-nums",
                    uPnl === null ? "text-sur-muted" : uPnl >= 0 ? "text-sur-green" : "text-sur-red",
                  )}
                >
                  {uPnl === null ? "—" : fmtUsdSigned(uPnl)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  ${formatBN(p.margin, USDC_DECIMALS, 2)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleClose(pda, p.marketId, symbol)}
                    disabled={closing !== null || !hasMark}
                    title={!hasMark ? "No on-chain mark price yet" : undefined}
                    className="px-2 py-1 text-[10px] font-semibold rounded-none bg-sur-red/15 text-sur-red border border-sur-red/30 hover:bg-sur-red/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {closing === pda ? "…" : "Close"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
