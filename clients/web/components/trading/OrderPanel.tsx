"use client";

import { useState, useMemo } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { useOpenPosition } from "@/hooks/tx/use-open-position";
import { useMarketState } from "@/hooks/data/use-market-state";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { findMarket } from "@/lib/markets";
import {
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  formatBN,
} from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";

type Side = "long" | "short";

const SIZE_SCALE = 10 ** SIZE_DECIMALS;
const PRICE_SCALE = 10 ** PRICE_DECIMALS;

interface Props {
  symbol: string;
}

export function OrderPanel({ symbol }: Props) {
  const { connected, publicKey } = useWallet();
  const market = findMarket(symbol);
  const { market: state } = useMarketState(
    market?.marketId ?? new Uint8Array(32),
  );
  const { balance: vaultBalance } = useVaultBalance(
    connected ? publicKey ?? undefined : undefined,
  );
  const openPosition = useOpenPosition();

  const [side, setSide] = useState<Side>("long");
  const [sizeStr, setSizeStr] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [busy, setBusy] = useState(false);

  const maxLev = market?.maxLeverage ?? 50;

  const sizeNum = parseFloat(sizeStr);
  const sizeBn = useMemo(() => {
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) return null;
    return new BN(Math.round(sizeNum * SIZE_SCALE));
  }, [sizeNum]);

  const markPriceBn = state?.markPrice;
  const markPriceUi = markPriceBn
    ? `$${formatBN(markPriceBn, PRICE_DECIMALS, 2)}`
    : "—";

  // For demo we use markPrice as fill price; in a real CLOB this would
  // come from the matching engine. On devnet the operator validates it.
  const fillPriceBn = markPriceBn ?? new BN(0);

  // Estimated notional in USDC
  const notional = useMemo(() => {
    if (!sizeBn || !markPriceBn) return null;
    // notional = size * price; both are scaled. Result has SIZE+PRICE decimals.
    // Convert to USDC (6 decimals): divide by 10^(SIZE_DECIMALS+PRICE_DECIMALS-USDC_DECIMALS) = 10^8.
    return sizeBn.mul(markPriceBn).div(new BN(10).pow(new BN(SIZE_DECIMALS)));
  }, [sizeBn, markPriceBn]);

  const isValid = sizeBn !== null && markPriceBn !== undefined && market !== undefined;

  async function handleSubmit() {
    if (!isValid || busy || !market || !sizeBn) return;
    if (!connected) {
      toast.error("Wallet not connected", {
        description: "Connect a Solana wallet to open a position.",
      });
      return;
    }
    // Pre-flight: must have vault balance before opening a position.
    if (vaultBalance && vaultBalance.isZero()) {
      toast.warning("You need to deposit USDC first", {
        description: "Use the Funds panel to deposit before opening a position.",
      });
      return;
    }
    setBusy(true);
    try {
      const sig = await openPosition({
        marketId: market.marketId,
        isLong: side === "long",
        size: sizeBn,
        fillPrice: fillPriceBn,
        leverage,
      });
      toast.success(`${side.toUpperCase()} ${symbol} confirmed`, {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      setSizeStr("");
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-sur-border flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sur-muted">
          Order
        </span>
        <span className="text-[10px] text-sur-muted">
          Mark <span className="text-sur-text tabular-nums">{markPriceUi}</span>
        </span>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("long")}
            className={`py-2 text-xs font-bold rounded transition-colors ${
              side === "long"
                ? "bg-sur-green text-black"
                : "bg-sur-bg text-sur-muted hover:text-sur-text border border-sur-border"
            }`}
          >
            LONG
          </button>
          <button
            onClick={() => setSide("short")}
            className={`py-2 text-xs font-bold rounded transition-colors ${
              side === "short"
                ? "bg-sur-red text-white"
                : "bg-sur-bg text-sur-muted hover:text-sur-text border border-sur-border"
            }`}
          >
            SHORT
          </button>
        </div>

        <div>
          <label className="text-[10px] text-sur-muted mb-1 block uppercase tracking-wider">
            Size ({market?.baseAsset ?? "—"})
          </label>
          <input
            type="number"
            value={sizeStr}
            onChange={(e) => setSizeStr(e.target.value)}
            placeholder="0.0000"
            min="0"
            step="0.0001"
            disabled={busy}
            className="w-full bg-sur-bg border border-sur-border rounded px-3 py-2 text-sm font-mono text-right focus:border-sur-accent transition-colors placeholder:text-sur-muted/50 disabled:opacity-50"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] text-sur-muted uppercase tracking-wider">
              Leverage
            </label>
            <span className="text-[11px] font-mono text-sur-text">{leverage}x</span>
          </div>
          <input
            type="range"
            min="1"
            max={maxLev}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            disabled={busy}
            className="w-full accent-sur-accent"
          />
          <div className="flex justify-between text-[9px] text-sur-muted mt-0.5">
            <span>1x</span>
            <span>{maxLev}x</span>
          </div>
        </div>

        <div className="text-[10px] text-sur-muted space-y-0.5 pt-2 border-t border-sur-border">
          <div className="flex justify-between">
            <span>Notional</span>
            <span className="font-mono text-sur-text">
              {notional
                ? `$${formatBN(notional, PRICE_DECIMALS, 2)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Fill Price (demo)</span>
            <span className="font-mono text-sur-text">{markPriceUi}</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !isValid || !connected}
          className={`w-full py-2.5 rounded text-xs font-bold transition-colors ${
            side === "long"
              ? "bg-sur-green text-black hover:bg-sur-green/90"
              : "bg-sur-red text-white hover:bg-sur-red/90"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {busy
            ? "Submitting…"
            : !connected
              ? "Connect Wallet"
              : !sizeBn
                ? "Enter Size"
                : !markPriceBn
                  ? "Market Uninit"
                  : `${side === "long" ? "LONG" : "SHORT"} ${symbol}`}
        </button>

        <p className="text-[9px] text-sur-muted leading-relaxed">
          Programs are deployed but markets are uninitialized on devnet.
          Phase 9 will init from an admin wallet — orders submitted before
          then will revert with AccountNotInitialized.
        </p>
      </div>
    </div>
  );
}
