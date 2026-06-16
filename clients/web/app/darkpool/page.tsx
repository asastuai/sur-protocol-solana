"use client";

import { useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Shield, Clock } from "lucide-react";

import { usePostIntent } from "@/hooks/tx/use-post-intent";
import { useAcceptAndSettleIntent } from "@/hooks/tx/use-accept-and-settle-intent";
import { useOpenIntents, type OpenIntent } from "@/hooks/data/use-open-intents";
import { useAgentReputation } from "@/hooks/data/use-agent-reputation";
import { MARKETS } from "@/lib/markets";
import { PRICE_DECIMALS, SIZE_DECIMALS, formatBN, truncatePubkey } from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { SkeletonTable } from "@/components/ui/Skeleton";
import {
  DossierHeader,
  DashedPanel,
  SectionLabel,
  Stamp,
  Leader,
  useClock,
} from "@/components/dossier/kit";

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
  if (remaining <= 0) return <span className="text-rust">expired</span>;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="tabular-nums text-bone">
      {m}m {s.toString().padStart(2, "0")}s
    </span>
  );
}

function IntentRow({
  intent,
  walletConnected,
  isOwn,
  onAccept,
}: {
  intent: OpenIntent;
  walletConnected: boolean;
  isOwn: boolean;
  onAccept: (intent: OpenIntent) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const symbol = symbolFromMarketId(intent.marketId) || "—";

  // Re-evaluate expiry every second so the Accept button disables itself the
  // moment the intent lapses (the on-chain accept tx would otherwise revert).
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const isExpired = intent.expiresAt.toNumber() <= now;

  // The on-chain Intent struct does NOT carry a min-counterparty-reputation
  // field yet (ships in program v0.4 — see programs/a2a_darkpool/MAPPING.md).
  // We surface a placeholder readout but enforce nothing here.
  const canAccept = walletConnected && !isOwn && !isExpired;

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
    <tr className="border-b border-dashed border-ash last:border-b-0 transition-colors hover:bg-smoke/40">
      <td className="px-3 py-2.5 text-[12px] text-sur-muted">
        {truncatePubkey(intent.agent.toBase58())}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-bone">{symbol}</td>
      <td className="px-3 py-2.5">
        <span
          className={`text-[10px] uppercase tracking-[0.2em] ${
            intent.isBuy ? "text-gold" : "text-rust"
          }`}
        >
          {intent.isBuy ? "long" : "short"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] tabular-nums text-bone">
        {formatBN(intent.size, SIZE_DECIMALS, 4)}
      </td>
      <td className="px-3 py-2.5 text-[12px] tabular-nums text-bone">
        ${formatBN(intent.maxPrice, PRICE_DECIMALS, 2)}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-sur-muted">
        <Clock size={11} className="-mt-px mr-1 inline" aria-hidden="true" />
        <ExpiryTimer expiresAt={intent.expiresAt} />
      </td>
      <td
        className="px-3 py-2.5 text-[12px] tabular-nums text-sur-muted/60"
        title="Min counterparty reputation is not enforced on-chain yet (ships in program v0.4)."
      >
        n/a
      </td>
      <td className="px-3 py-2.5 text-right">
        {isOwn ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
            your intent
          </span>
        ) : !walletConnected ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
            connect wallet
          </span>
        ) : isExpired ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-rust">
            expired
          </span>
        ) : (
          <button
            onClick={handleAccept}
            disabled={busy}
            className="rounded-none border border-gold px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-gold transition-colors hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
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
  const clock = useClock();

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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 font-mono md:px-8">
      <DossierHeader
        path="darkpool"
        title="Dark Pool"
        subtitle={`A2A OTC desk · handler · ${clock} · solana devnet`}
        stamps={
          <>
            <Stamp>Devnet // 2026</Stamp>
            <Stamp tone="muted">Classified</Stamp>
          </>
        }
      />

      {/* Brief */}
      <DashedPanel title="Brief" className="mb-8" bodyClassName="p-5 md:p-6">
        <h2 className="font-display text-xl tracking-tight text-bone md:text-2xl">
          Agents trade OTC with persistent reputation
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sur-muted">
          Post an intent off-orderbook. Other agents respond. Settlement is
          atomic — both legs open in a single Solana tx, and your reputation
          score updates with every fill.
        </p>
      </DashedPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Post intent */}
        <aside className="h-fit">
          <DashedPanel title="Post Intent" bodyClassName="p-5">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel>order ticket</SectionLabel>
              {connected && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  <Shield size={11} aria-hidden="true" />
                  rep {reputation.isNew ? "—" : reputation.score}
                </span>
              )}
            </div>

            {!connected && (
              <div className="mb-4 border border-dashed border-ash p-2 text-[11px] text-sur-muted">
                Connect a wallet to post intents.
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  Market
                </label>
                <select
                  value={marketSymbol}
                  onChange={(e) => setMarketSymbol(e.target.value)}
                  disabled={!connected}
                  className="w-full rounded-none border border-ash bg-smoke px-2 py-1.5 text-[12px] text-bone outline-none focus:border-gold disabled:opacity-50"
                >
                  {MARKETS.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.symbol}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  Side
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide("long")}
                    disabled={!connected}
                    className={`rounded-none border py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors disabled:opacity-50 ${
                      side === "long"
                        ? "border-gold bg-gold text-ink"
                        : "border-ash bg-smoke text-sur-muted hover:border-gold"
                    }`}
                  >
                    Long
                  </button>
                  <button
                    onClick={() => setSide("short")}
                    disabled={!connected}
                    className={`rounded-none border py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors disabled:opacity-50 ${
                      side === "short"
                        ? "border-rust bg-rust text-bone"
                        : "border-ash bg-smoke text-sur-muted hover:border-gold"
                    }`}
                  >
                    Short
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  Size ({market?.baseAsset ?? ""})
                </label>
                <input
                  type="number"
                  value={sizeStr}
                  onChange={(e) => setSizeStr(e.target.value)}
                  disabled={!connected}
                  placeholder="0.1"
                  className="w-full rounded-none border border-ash bg-smoke px-2 py-1.5 text-[12px] text-bone outline-none focus:border-gold disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  Price (USD)
                </label>
                <input
                  type="number"
                  value={maxPriceStr}
                  onChange={(e) => setMaxPriceStr(e.target.value)}
                  disabled={!connected}
                  placeholder="50000"
                  className="w-full rounded-none border border-ash bg-smoke px-2 py-1.5 text-[12px] text-bone outline-none focus:border-gold disabled:opacity-50"
                />
                <span className="mt-1 block text-[9px] text-sur-muted/70">
                  single-price intent — min and max price are posted equal
                </span>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                    Min counterparty reputation
                  </label>
                  <span className="inline-flex items-center rounded-none border border-ash px-1.5 py-0.5 text-[8px] uppercase tracking-[0.18em] text-sur-muted/70">
                    v0.4
                  </span>
                </div>
                <input
                  type="number"
                  value={minRepStr}
                  onChange={(e) => setMinRepStr(e.target.value)}
                  disabled
                  placeholder="—"
                  aria-disabled="true"
                  className="w-full cursor-not-allowed rounded-none border border-dashed border-ash bg-smoke px-2 py-1.5 text-[12px] text-bone opacity-50 outline-none"
                />
                <span className="mt-1 block text-[9px] text-sur-muted/70">
                  not yet enforced on-chain — ships in program v0.4
                </span>
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                  Expiry (minutes)
                </label>
                <input
                  type="number"
                  value={expiryMinsStr}
                  onChange={(e) => setExpiryMinsStr(e.target.value)}
                  disabled={!connected}
                  placeholder="10"
                  className="w-full rounded-none border border-ash bg-smoke px-2 py-1.5 text-[12px] text-bone outline-none focus:border-gold disabled:opacity-50"
                />
              </div>

              <button
                onClick={handlePost}
                disabled={!canSubmit || busy}
                className="w-full rounded-none border border-gold bg-gold py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition-colors hover:bg-transparent hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Posting…" : "Post intent"}
              </button>
            </div>
          </DashedPanel>
        </aside>

        {/* Open intents */}
        <section>
          <DashedPanel title="Open Intents" bodyClassName="p-0">
            <div className="flex items-center justify-between border-b border-dashed border-ash px-4 py-3">
              <SectionLabel>order book</SectionLabel>
              <span className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                {loading ? "loading…" : `${intents.length} open`}
              </span>
            </div>

            {error && (
              <div className="px-4 py-6 text-[12px] text-rust">
                {error.message}
              </div>
            )}

            {!error && loading && intents.length === 0 && (
              <div aria-label="Loading intents">
                <SkeletonTable rows={3} cols={8} />
              </div>
            )}

            {!error && !loading && intents.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <Stamp tone="muted">Empty desk</Stamp>
                <p className="text-[12px] text-sur-muted">
                  No open intents on devnet yet. Post the first one — or wait
                  until Phase 9 init lands.
                </p>
                <Leader />
              </div>
            )}

            {!error && intents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-dashed border-ash">
                    <tr className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                      <th className="px-3 py-2 font-normal">Poster</th>
                      <th className="px-3 py-2 font-normal">Market</th>
                      <th className="px-3 py-2 font-normal">Side</th>
                      <th className="px-3 py-2 font-normal">Size</th>
                      <th className="px-3 py-2 font-normal">Max price</th>
                      <th className="px-3 py-2 font-normal">Expires</th>
                      <th className="px-3 py-2 font-normal">Min rep</th>
                      <th className="px-3 py-2 text-right font-normal">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intents.map((i) => (
                      <IntentRow
                        key={i.pda.toBase58()}
                        intent={i}
                        walletConnected={connected}
                        isOwn={publicKey?.equals(i.agent) ?? false}
                        onAccept={handleAccept}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashedPanel>
        </section>
      </div>

      {/* Footer */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ash pt-4 text-[10px] uppercase tracking-[0.2em] text-sur-muted">
        <span>SUR // Solana Devnet // dark pool compiled {clock}</span>
        <Stamp tone="muted">Atomic settlement</Stamp>
      </div>
    </div>
  );
}
