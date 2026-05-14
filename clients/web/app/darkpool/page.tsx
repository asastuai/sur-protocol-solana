"use client";

import { useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Lock, Shield, Clock, TrendingUp, TrendingDown } from "lucide-react";

import { usePostIntent } from "@/hooks/tx/use-post-intent";
import { useAcceptAndSettleIntent } from "@/hooks/tx/use-accept-and-settle-intent";
import { useOpenIntents, type OpenIntent } from "@/hooks/data/use-open-intents";
import { useAgentReputation } from "@/hooks/data/use-agent-reputation";
import { MARKETS } from "@/lib/markets";
import { PRICE_DECIMALS, SIZE_DECIMALS, formatBN, truncatePubkey } from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { SkeletonTable } from "@/components/ui/Skeleton";

const SIZE_SCALE = 10 ** SIZE_DECIMALS;
const PRICE_SCALE = 10 ** PRICE_DECIMALS;

type Side = "long" | "short";

function symbolFromMarketId(id: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(id).replace(/\0/g, "");
}

function ExpiryTimer({ expiresAt }: { expiresAt: BN }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = expiresAt.toNumber() - now;
  if (remaining <= 0) return <span className="text-sur-red">expired</span>;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="tabular-nums text-sur-text">
      {m}m {s.toString().padStart(2, "0")}s
    </span>
  );
}

function IntentRow({
  intent,
  walletScore,
  walletConnected,
  isOwn,
  onAccept,
}: {
  intent: OpenIntent;
  walletScore: number;
  walletConnected: boolean;
  isOwn: boolean;
  onAccept: (intent: OpenIntent) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const symbol = symbolFromMarketId(intent.marketId) || "—";
  // The on-chain Intent doesn't carry a min-counterparty-reputation field
  // (that ships in v0.4 — see programs/a2a_darkpool/MAPPING.md). For now
  // we display the agent's own snapshot reputation cap as a placeholder.
  const minRep = 0;

  const repOk = !walletConnected || walletScore >= minRep;
  const canAccept = walletConnected && !isOwn && repOk;

  async function handleAccept() {
    if (!canAccept || busy) return;
    setBusy(true);
    try {
      await onAccept(intent);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-sur-border last:border-b-0 hover:bg-sur-border/20 transition-colors">
      <td className="px-3 py-2.5 text-[12px] font-mono text-sur-muted">
        {truncatePubkey(intent.agent.toBase58())}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-sur-text">{symbol}</td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            intent.isBuy
              ? "bg-sur-green/15 text-sur-green"
              : "bg-sur-red/15 text-sur-red"
          }`}
        >
          {intent.isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {intent.isBuy ? "long" : "short"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] tabular-nums text-sur-text">
        {formatBN(intent.size, SIZE_DECIMALS, 4)}
      </td>
      <td className="px-3 py-2.5 text-[12px] tabular-nums text-sur-text">
        ${formatBN(intent.maxPrice, PRICE_DECIMALS, 2)}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-sur-muted">
        <Clock size={11} className="inline mr-1 -mt-px" />
        <ExpiryTimer expiresAt={intent.expiresAt} />
      </td>
      <td className="px-3 py-2.5 text-[12px] text-sur-muted tabular-nums">
        {minRep}
      </td>
      <td className="px-3 py-2.5 text-right">
        {isOwn ? (
          <span className="text-[11px] text-sur-muted italic">your intent</span>
        ) : !walletConnected ? (
          <span className="text-[11px] text-sur-muted">connect wallet</span>
        ) : !repOk ? (
          <span className="text-[11px] text-sur-red">low reputation</span>
        ) : (
          <button
            onClick={handleAccept}
            disabled={busy}
            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-sur-accent text-white hover:bg-sur-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "…" : "Accept + Settle"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function DarkpoolPage() {
  const { publicKey, connected } = useWallet();
  const postIntent = usePostIntent();
  const acceptIntent = useAcceptAndSettleIntent();
  const { intents, loading, error, refetch } = useOpenIntents();
  const reputation = useAgentReputation(publicKey ?? undefined);

  const [marketSymbol, setMarketSymbol] = useState(MARKETS[0]?.symbol ?? "BTC-USD");
  const [side, setSide] = useState<Side>("long");
  const [sizeStr, setSizeStr] = useState("");
  const [maxPriceStr, setMaxPriceStr] = useState("");
  const [minRepStr, setMinRepStr] = useState("0");
  const [expiryMinsStr, setExpiryMinsStr] = useState("10");
  const [busy, setBusy] = useState(false);

  const market = useMemo(
    () => MARKETS.find((m) => m.symbol === marketSymbol),
    [marketSymbol],
  );

  const sizeBn = useMemo(() => {
    const n = parseFloat(sizeStr);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new BN(Math.round(n * SIZE_SCALE));
  }, [sizeStr]);

  const maxPriceBn = useMemo(() => {
    const n = parseFloat(maxPriceStr);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new BN(Math.round(n * PRICE_SCALE));
  }, [maxPriceStr]);

  const expirySecs = useMemo(() => {
    const m = parseFloat(expiryMinsStr);
    if (!Number.isFinite(m) || m <= 0) return null;
    return new BN(Math.round(m * 60));
  }, [expiryMinsStr]);

  const canSubmit =
    connected && !!market && sizeBn !== null && maxPriceBn !== null && expirySecs !== null;

  async function handlePost() {
    if (!canSubmit || busy || !market || !sizeBn || !maxPriceBn || !expirySecs) return;
    setBusy(true);
    try {
      const sig = await postIntent({
        marketId: market.marketId,
        isBuy: side === "long",
        size: sizeBn,
        // min_price is unused in the v0 UX — set equal to maxPrice so the
        // program's `min <= max` constraint always holds.
        minPrice: maxPriceBn,
        maxPrice: maxPriceBn,
        durationSecs: expirySecs,
      });
      toast.success("Intent posted", {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      setSizeStr("");
      refetch();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(intent: OpenIntent) {
    try {
      const sig = await acceptIntent(intent);
      toast.success("Response posted", {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      refetch();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    }
  }

  // Note: the on-chain Intent struct doesn't expose minRep yet (placeholder
  // in the row). We still surface the input so the UX is forward-compatible
  // with v0.4. Suppress unused warning by reading the value.
  void minRepStr;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-2 text-sur-accent text-[11px] uppercase tracking-widest font-semibold mb-3">
          <Lock size={14} />
          <span>A2A Dark Pool</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-sur-text mb-3 leading-tight">
          Agents trade OTC with persistent reputation
        </h1>
        <p className="text-sur-muted max-w-2xl text-[14px] leading-relaxed">
          Post an intent off-orderbook. Other agents respond. Settlement is
          atomic — both legs open in a single Solana tx, and your reputation
          score updates with every fill.
        </p>
      </section>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[360px_1fr]">
        {/* Post intent */}
        <aside className="bg-sur-surface border border-sur-border rounded-lg p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-sur-text">
              Post intent
            </h2>
            {connected && (
              <span className="inline-flex items-center gap-1 text-[10px] text-sur-muted">
                <Shield size={11} />
                rep {reputation.isNew ? "—" : reputation.score}
              </span>
            )}
          </div>

          {!connected && (
            <div className="mb-3 text-[11px] text-sur-muted bg-sur-bg/60 border border-sur-border rounded p-2">
              Connect a wallet to post intents.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Market
              </label>
              <select
                value={marketSymbol}
                onChange={(e) => setMarketSymbol(e.target.value)}
                disabled={!connected}
                className="w-full bg-sur-bg border border-sur-border rounded px-2 py-1.5 text-[12px] text-sur-text disabled:opacity-50"
              >
                {MARKETS.map((m) => (
                  <option key={m.symbol} value={m.symbol}>
                    {m.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Side
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide("long")}
                  disabled={!connected}
                  className={`py-1.5 text-[11px] font-bold rounded transition-colors disabled:opacity-50 ${
                    side === "long"
                      ? "bg-sur-green text-black"
                      : "bg-sur-bg text-sur-muted border border-sur-border"
                  }`}
                >
                  LONG
                </button>
                <button
                  onClick={() => setSide("short")}
                  disabled={!connected}
                  className={`py-1.5 text-[11px] font-bold rounded transition-colors disabled:opacity-50 ${
                    side === "short"
                      ? "bg-sur-red text-black"
                      : "bg-sur-bg text-sur-muted border border-sur-border"
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Size ({market?.baseAsset ?? ""})
              </label>
              <input
                type="number"
                value={sizeStr}
                onChange={(e) => setSizeStr(e.target.value)}
                disabled={!connected}
                placeholder="0.1"
                className="w-full bg-sur-bg border border-sur-border rounded px-2 py-1.5 text-[12px] text-sur-text disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Max price (USD)
              </label>
              <input
                type="number"
                value={maxPriceStr}
                onChange={(e) => setMaxPriceStr(e.target.value)}
                disabled={!connected}
                placeholder="50000"
                className="w-full bg-sur-bg border border-sur-border rounded px-2 py-1.5 text-[12px] text-sur-text disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Min counterparty reputation (0-1000)
              </label>
              <input
                type="number"
                value={minRepStr}
                onChange={(e) => setMinRepStr(e.target.value)}
                disabled={!connected}
                placeholder="500"
                className="w-full bg-sur-bg border border-sur-border rounded px-2 py-1.5 text-[12px] text-sur-text disabled:opacity-50"
              />
              <span className="text-[9px] text-sur-muted/70">
                ships in program v0.4 — UI accepts it now
              </span>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-sur-muted mb-1">
                Expiry (minutes)
              </label>
              <input
                type="number"
                value={expiryMinsStr}
                onChange={(e) => setExpiryMinsStr(e.target.value)}
                disabled={!connected}
                placeholder="10"
                className="w-full bg-sur-bg border border-sur-border rounded px-2 py-1.5 text-[12px] text-sur-text disabled:opacity-50"
              />
            </div>

            <button
              onClick={handlePost}
              disabled={!canSubmit || busy}
              className="w-full py-2 text-[12px] font-semibold rounded bg-sur-accent text-white hover:bg-sur-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Posting…" : "Post intent"}
            </button>
          </div>
        </aside>

        {/* Open intents */}
        <section className="bg-sur-surface border border-sur-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-sur-border flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-sur-text">
              Open intents
            </h2>
            <span className="text-[11px] text-sur-muted">
              {loading ? "loading…" : `${intents.length} open`}
            </span>
          </div>

          {error && (
            <div className="px-4 py-6 text-[12px] text-sur-red">
              {error.message}
            </div>
          )}

          {!error && loading && intents.length === 0 && (
            <div aria-label="Loading intents">
              <SkeletonTable rows={3} cols={8} />
            </div>
          )}

          {!error && !loading && intents.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-sur-muted">
              No open intents on devnet yet. Post the first one — or wait
              until Phase 9 init lands.
            </div>
          )}

          {!error && intents.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-sur-border bg-sur-bg/30">
                  <tr className="text-[10px] uppercase tracking-wider text-sur-muted">
                    <th className="px-3 py-2 font-semibold">Poster</th>
                    <th className="px-3 py-2 font-semibold">Market</th>
                    <th className="px-3 py-2 font-semibold">Side</th>
                    <th className="px-3 py-2 font-semibold">Size</th>
                    <th className="px-3 py-2 font-semibold">Max price</th>
                    <th className="px-3 py-2 font-semibold">Expires</th>
                    <th className="px-3 py-2 font-semibold">Min rep</th>
                    <th className="px-3 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {intents.map((i) => (
                    <IntentRow
                      key={i.pda.toBase58()}
                      intent={i}
                      walletScore={reputation.isNew ? 500 : reputation.score}
                      walletConnected={connected}
                      isOwn={publicKey?.equals(i.agent) ?? false}
                      onAccept={handleAccept}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
