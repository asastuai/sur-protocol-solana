"use client";

import { useState, useMemo } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { useOpenPosition } from "@/hooks/tx/use-open-position";
import { useMarketState } from "@/hooks/data/use-market-state";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useBinanceStats } from "@/hooks/data/use-binance-stats";
import { findMarket } from "@/lib/markets";
import {
  PRICE_DECIMALS,
  SIZE_DECIMALS,
  formatBN,
  bnToNumber,
  fmtUsd,
} from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/cn";
import { FeasBadge, type Feasibility } from "./OrderTypeBadge";

type Side = "long" | "short";
type OrderType = "market" | "limit" | "stop";
type StopKind = "market" | "limit";
type SizeUnit = "base" | "usd";

const SIZE_SCALE = 10 ** SIZE_DECIMALS;

const TYPE_META: Record<OrderType, { label: string; feasibility: Feasibility }> = {
  market: { label: "Market", feasibility: "live" },
  limit: { label: "Limit", feasibility: "soon" },
  stop: { label: "Stop", feasibility: "client" },
};

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
  const stats = useBinanceStats(symbol);
  const openPosition = useOpenPosition();

  const [side, setSide] = useState<Side>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [stopKind, setStopKind] = useState<StopKind>("market");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("base");
  const [sizeStr, setSizeStr] = useState("");
  const [limitStr, setLimitStr] = useState("");
  const [triggerStr, setTriggerStr] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [tif, setTif] = useState<"gtc" | "ioc">("gtc");
  const [attachTp, setAttachTp] = useState(false);
  const [attachSl, setAttachSl] = useState(false);
  const [tpStr, setTpStr] = useState("");
  const [slStr, setSlStr] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // --- price references -----------------------------------------------------
  // Live reference price (Binance) — used for notional / demo fill display so
  // the form agrees with the header strip instead of showing "—" on devnet.
  const refPrice = stats.price > 0 ? stats.price : 0;
  // On-chain mark — the price the engine actually settles a Market order at.
  // Undefined/zero on uninitialized devnet markets (gates submission).
  const onChainMark = state?.markPrice;
  const hasOnChainMark = !!onChainMark && !onChainMark.isZero();

  // --- size math (human units) ---------------------------------------------
  const freeUsd = useMemo(
    () => bnToNumber(vaultBalance ?? null, 6),
    [vaultBalance],
  );
  const sizeInput = parseFloat(sizeStr);
  const sizeBaseNum = useMemo(() => {
    if (!Number.isFinite(sizeInput) || sizeInput <= 0) return 0;
    if (sizeUnit === "usd") return refPrice > 0 ? sizeInput / refPrice : 0;
    return sizeInput;
  }, [sizeInput, sizeUnit, refPrice]);

  const notionalUsd = sizeBaseNum * refPrice;
  const sizeBn = useMemo(() => {
    if (sizeBaseNum <= 0) return null;
    return new BN(Math.round(sizeBaseNum * SIZE_SCALE));
  }, [sizeBaseNum]);

  function applyPct(pct: number) {
    if (refPrice <= 0 || freeUsd <= 0) return;
    const targetUsd = (pct / 100) * freeUsd;
    if (sizeUnit === "usd") {
      setSizeStr(targetUsd.toFixed(2));
    } else {
      setSizeStr((targetUsd / refPrice).toFixed(4));
    }
  }

  const markPriceUi = hasOnChainMark
    ? `$${formatBN(onChainMark, PRICE_DECIMALS, 2)}`
    : "—";
  const refPriceUi = refPrice > 0 ? fmtUsd(refPrice) : "—";

  const oiLong = state ? formatBN(state.openInterestLong, SIZE_DECIMALS, 2) : "—";
  const oiShort = state ? formatBN(state.openInterestShort, SIZE_DECIMALS, 2) : "—";

  const isMarket = orderType === "market";
  const showLimitPrice = orderType === "limit" || (orderType === "stop" && stopKind === "limit");
  const showTrigger = orderType === "stop";
  const typeFeas = TYPE_META[orderType].feasibility;

  // Only Market is wired to the chain today. Everything else is presented
  // honestly (badged) and its submit is gated — we never route a non-market
  // order through open_position pretending it rests on a book or triggers
  // on-chain.
  const canSubmitMarket =
    isMarket && sizeBn !== null && hasOnChainMark && market !== undefined && connected;

  async function handleSubmit() {
    if (!isMarket) return; // non-market types are gated in the UI
    if (!canSubmitMarket || busy || !market || !sizeBn || !onChainMark) return;
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
        fillPrice: onChainMark,
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

  function submitLabel(): string {
    if (!connected) return "Connect Wallet";
    if (!isMarket) {
      return typeFeas === "client"
        ? `${TYPE_META[orderType].label} — client trigger (soon)`
        : `${TYPE_META[orderType].label} — not wired yet`;
    }
    if (busy) return "Submitting…";
    if (!sizeBn) return "Enter Size";
    if (!hasOnChainMark) return "Market Uninit";
    return `${side === "long" ? "LONG" : "SHORT"} ${symbol}`;
  }

  const submitDisabled = busy || !canSubmitMarket;

  return (
    <div className="flex flex-col font-mono">
      {/* Order-type tabs */}
      <div className="flex items-center gap-1 border-b border-dashed border-ash px-3 py-2">
        {(Object.keys(TYPE_META) as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] rounded-none border transition-colors",
              orderType === t
                ? "border-gold text-gold bg-gold/10"
                : "border-transparent text-sur-muted hover:text-bone",
            )}
          >
            {TYPE_META[t].label}
            {orderType === t && <FeasBadge feasibility={TYPE_META[t].feasibility} />}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-3">
        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("long")}
            className={cn(
              "py-2 text-xs font-bold rounded-none transition-colors",
              side === "long"
                ? "bg-sur-green text-black"
                : "bg-ink text-sur-muted hover:text-bone border border-dashed border-ash",
            )}
          >
            LONG
          </button>
          <button
            onClick={() => setSide("short")}
            className={cn(
              "py-2 text-xs font-bold rounded-none transition-colors",
              side === "short"
                ? "bg-sur-red text-white"
                : "bg-ink text-sur-muted hover:text-bone border border-dashed border-ash",
            )}
          >
            SHORT
          </button>
        </div>

        {/* Stop sub-kind */}
        {orderType === "stop" && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-sur-muted uppercase tracking-[0.14em]">Trigger →</span>
            {(["market", "limit"] as StopKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setStopKind(k)}
                className={cn(
                  "px-2 py-0.5 border rounded-none uppercase tracking-[0.14em] transition-colors",
                  stopKind === k
                    ? "border-gold text-gold"
                    : "border-dashed border-ash text-sur-muted hover:text-bone",
                )}
              >
                stop-{k}
              </button>
            ))}
          </div>
        )}

        {/* Size + unit toggle */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-[0.14em] text-sur-muted">
              Size
            </label>
            <div className="flex items-center gap-0.5">
              {(["base", "usd"] as SizeUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setSizeUnit(u)}
                  className={cn(
                    "px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] rounded-none transition-colors",
                    sizeUnit === u ? "bg-smoke text-bone" : "text-sur-muted hover:text-bone",
                  )}
                >
                  {u === "base" ? (market?.baseAsset ?? "BASE") : "USD"}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            value={sizeStr}
            onChange={(e) => setSizeStr(e.target.value)}
            placeholder={sizeUnit === "usd" ? "0.00" : "0.0000"}
            min="0"
            step={sizeUnit === "usd" ? "0.01" : "0.0001"}
            disabled={busy}
            className="w-full rounded-none border border-dashed border-ash bg-ink px-3 py-2 text-right text-sm font-mono text-bone transition-colors placeholder:text-sur-muted/50 focus:border-gold disabled:opacity-50"
          />
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => applyPct(p)}
                disabled={freeUsd <= 0 || refPrice <= 0}
                className="rounded-none border border-dashed border-ash py-1 text-[9px] text-sur-muted transition-colors hover:border-gold hover:text-gold disabled:opacity-30"
              >
                {p === 100 ? "MAX" : `${p}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Limit price (limit / stop-limit) */}
        {showLimitPrice && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-sur-muted">
              Limit Price <FeasBadge feasibility="soon" />
            </label>
            <input
              type="number"
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              placeholder={refPriceUi.replace("$", "")}
              className="w-full rounded-none border border-dashed border-ash bg-ink px-3 py-2 text-right text-sm font-mono text-bone placeholder:text-sur-muted/40 focus:border-gold"
            />
          </div>
        )}

        {/* Trigger price (stop) */}
        {showTrigger && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-sur-muted">
              Trigger Price <FeasBadge feasibility="client" />
            </label>
            <input
              type="number"
              value={triggerStr}
              onChange={(e) => setTriggerStr(e.target.value)}
              placeholder={refPriceUi.replace("$", "")}
              className="w-full rounded-none border border-dashed border-ash bg-ink px-3 py-2 text-right text-sm font-mono text-bone placeholder:text-sur-muted/40 focus:border-gold"
            />
            <p className="mt-1 text-[9px] leading-relaxed text-sur-muted">
              Fires from a client-side watch of mark price — no on-chain
              guarantee; only triggers while this session is online.
            </p>
          </div>
        )}

        {/* Advanced */}
        <div className="border-t border-dashed border-ash pt-2">
          <button
            onClick={() => setAdvOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.16em] text-sur-muted hover:text-bone"
          >
            <span>// advanced</span>
            <span className={cn("transition-transform", advOpen && "rotate-180")}>▾</span>
          </button>
          {advOpen && (
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-center justify-between text-[11px] text-sur-muted">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    onChange={(e) => setReduceOnly(e.target.checked)}
                    className="accent-gold"
                  />
                  Reduce-only
                </span>
                <FeasBadge feasibility="soon" />
              </label>

              {orderType === "limit" && (
                <>
                  <label className="flex cursor-pointer items-center justify-between text-[11px] text-sur-muted">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={postOnly}
                        onChange={(e) => setPostOnly(e.target.checked)}
                        className="accent-gold"
                      />
                      Post-only
                    </span>
                    <FeasBadge feasibility="soon" />
                  </label>
                  <div className="flex items-center justify-between text-[11px] text-sur-muted">
                    <span className="flex items-center gap-2">
                      Time in force
                      <FeasBadge feasibility="soon" />
                    </span>
                    <div className="flex gap-0.5">
                      {(["gtc", "ioc"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setTif(v)}
                          className={cn(
                            "px-1.5 py-0.5 text-[9px] uppercase rounded-none border transition-colors",
                            tif === v ? "border-gold text-gold" : "border-dashed border-ash hover:text-bone",
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Attach TP / SL on entry (client trigger) */}
              <div className="space-y-2 border-t border-dashed border-ash pt-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-sur-muted">
                  Attach TP / SL <FeasBadge feasibility="client" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-sur-muted">
                  <input type="checkbox" checked={attachTp} onChange={(e) => setAttachTp(e.target.checked)} className="accent-sur-green" />
                  Take profit
                </label>
                {attachTp && (
                  <input
                    type="number"
                    value={tpStr}
                    onChange={(e) => setTpStr(e.target.value)}
                    placeholder="TP price"
                    className="w-full rounded-none border border-dashed border-ash bg-ink px-3 py-1.5 text-right text-xs font-mono text-bone placeholder:text-sur-muted/40 focus:border-gold"
                  />
                )}
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-sur-muted">
                  <input type="checkbox" checked={attachSl} onChange={(e) => setAttachSl(e.target.checked)} className="accent-sur-red" />
                  Stop loss
                </label>
                {attachSl && (
                  <input
                    type="number"
                    value={slStr}
                    onChange={(e) => setSlStr(e.target.value)}
                    placeholder="SL price"
                    className="w-full rounded-none border border-dashed border-ash bg-ink px-3 py-1.5 text-right text-xs font-mono text-bone placeholder:text-sur-muted/40 focus:border-gold"
                  />
                )}
                <p className="text-[9px] leading-relaxed text-sur-muted">
                  TP/SL close the whole position via a client-side trigger
                  (partial close isn&apos;t supported on-chain yet).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Context / readouts */}
        <div className="space-y-0.5 border-t border-dashed border-ash pt-2 text-[10px] text-sur-muted">
          <Readout label="Notional" value={notionalUsd > 0 ? fmtUsd(notionalUsd) : "—"} />
          <Readout
            label="Fill price"
            value={isMarket ? markPriceUi : refPriceUi}
            hint={isMarket ? "on-chain mark" : "live ref"}
          />
          <Readout label="Live ref" value={refPriceUi} hint="binance" />
          <Readout label="Margin" value="set by market" hint="initial_margin_bps" />
          <Readout label="Max lev" value={`${market?.maxLeverage ?? "—"}x`} />
          <div className="flex justify-between">
            <span>OI L / S</span>
            <span className="font-mono tabular-nums text-bone/80">{oiLong} / {oiShort}</span>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitDisabled}
          className={cn(
            "w-full rounded-none py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            side === "long"
              ? "bg-sur-green text-black hover:bg-sur-green/90"
              : "bg-sur-red text-white hover:bg-sur-red/90",
          )}
        >
          {submitLabel()}
        </button>

        <p className="text-[9px] leading-relaxed text-sur-muted">
          Programs are deployed but markets are uninitialized on devnet. Phase 9
          initializes from an admin wallet — Market orders submitted before then
          revert with AccountNotInitialized. Limit / Stop / TP-SL are shown for
          shape and are not yet executable (see badges).
        </p>
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="flex items-baseline gap-1.5">
        {hint && <span className="text-[8px] uppercase tracking-[0.1em] text-sur-muted/60">{hint}</span>}
        <span className="font-mono tabular-nums text-bone/90">{value}</span>
      </span>
    </div>
  );
}
