"use client";

// ============================================================
//  /trade — core trading screen (Solana devnet)
// ============================================================
//
// Polished trading-v2 panels wired to LIVE on-chain hooks. The root layout
// already renders the NavBar (logo + wallet connect) and DevnetBanner, so this
// page renders NO TradingHeader — just an in-page market bar + the panels.
//
// HONEST DEVNET TRUTHS surfaced in the UI (see OperatorDisclaimer + labels):
//   - open/close require the connected wallet to be a registered engine
//     OPERATOR. This is NOT non-custodial single-sig trading.
//   - the order book + trade tape are SIMULATED off-chain (no on-chain CLOB).
//   - no funding-rate UI (Solana Market has no funding field).
//   - chart + sparklines use the client-side on-chain mark sampler.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { LiveChart } from "@/components/trading/LiveChart";
import {
  OrderBookPanel,
  PositionsPanel as V2PositionsPanel,
  TradeForm,
  MarketSelectorPanel,
} from "@/components/trading-v2";

import {
  useMarketsBridge,
  usePositionsBridge,
  useSimOrderBook,
  sizeToBn,
} from "@/components/trade/TradeBridge";

import { useOpenPosition } from "@/hooks/tx/use-open-position";
import { useClosePosition } from "@/hooks/tx/use-close-position";
import { useDepositUSDC } from "@/hooks/tx/use-deposit-usdc";
import { useWithdrawUSDC } from "@/hooks/tx/use-withdraw-usdc";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";

import { MARKETS } from "@/lib/markets";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { SurPdas } from "@/lib/pdas";
import { USDC_DECIMALS, formatBN, bnToNumber } from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/cn";

import { CopyAddress } from "@/components/ui/CopyAddress";

import type { Market, TradeFormData } from "@/lib/front-types";

const USDC_SCALE = 10 ** USDC_DECIMALS;
const DEFAULT_SYMBOL = "BTC-USD";
const VALID_SYMBOLS = new Set(MARKETS.map((m) => m.symbol));

// ============================================================
//  Page shell — reads ?symbol, switches between desktop/mobile
// ============================================================

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

function TradeScreen() {
  const searchParams = useSearchParams();
  const { connected, publicKey } = useWallet();
  const isMobile = useIsMobile();

  // ?symbol — validated against the 3 real markets, else BTC-USD.
  const urlSymbol = searchParams.get("symbol") ?? "";
  const [symbol, setSymbol] = useState(
    VALID_SYMBOLS.has(urlSymbol) ? urlSymbol : DEFAULT_SYMBOL,
  );
  useEffect(() => {
    if (VALID_SYMBOLS.has(urlSymbol)) setSymbol(urlSymbol);
  }, [urlSymbol]);

  const trader = connected ? publicKey ?? undefined : undefined;

  // --- on-chain → trading-v2 prop bridges ---
  const { markets, selectedMarket, selectedMeta, selectedState } =
    useMarketsBridge(symbol);
  const { positions, pdaById, marketIdById, refetch: refetchPositions } =
    usePositionsBridge(trader, markets);
  const { orderBook, recentTrades } = useSimOrderBook(
    selectedMarket?.markPrice ?? 0,
    symbol,
  );

  const { balance: vaultBalanceBn, refetch: refetchBalance } =
    useVaultBalance(trader);
  const availableBalance = useMemo(
    () => bnToNumber(vaultBalanceBn, USDC_DECIMALS),
    [vaultBalanceBn],
  );

  const selectedMarketId = selectedMeta?.marketId ?? new Uint8Array(32);

  // --- tx hooks ---
  const openPosition = useOpenPosition();
  const closePosition = useClosePosition();
  const [submitting, setSubmitting] = useState(false);

  const onSelectMarket = useCallback((m: Market) => setSymbol(m.symbol), []);

  // Submit a market order → perp_engine.open_position. Fill = current mark.
  const handleSubmitOrder = useCallback(
    async (data: TradeFormData) => {
      if (submitting) return;
      if (!connected) {
        toast.error("Wallet not connected", {
          description: "Connect a Solana wallet to open a position.",
        });
        return;
      }
      if (!selectedMeta) {
        toast.error("Unknown market");
        return;
      }
      const markBn = selectedState?.markPrice;
      if (!markBn || markBn.isZero()) {
        toast.warning("Market not initialized on-chain", {
          description:
            "No on-chain mark price yet — orders revert until Phase 9 init runs.",
        });
        return;
      }
      const sizeBn = sizeToBn(data.size);
      if (!sizeBn) {
        toast.error("Enter a valid size");
        return;
      }
      if (vaultBalanceBn && vaultBalanceBn.isZero()) {
        toast.warning("Deposit USDC first", {
          description: "Use the Funds panel before opening a position.",
        });
        return;
      }

      setSubmitting(true);
      try {
        const sig = await openPosition({
          marketId: selectedMeta.marketId,
          isLong: data.side === "long",
          size: sizeBn,
          fillPrice: markBn, // demo: fill at current on-chain mark
          leverage: data.leverage,
        });
        toast.success(`${data.side.toUpperCase()} ${symbol} confirmed`, {
          description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
          action: {
            label: "explorer",
            onClick: () =>
              window.open(getExplorerUrl(sig, "devnet"), "_blank"),
          },
          duration: 8000,
        });
        refetchPositions();
        refetchBalance();
      } catch (err) {
        const { message, description } = formatError(err);
        toast.error(message, { description, duration: 10_000 });
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      connected,
      selectedMeta,
      selectedState,
      vaultBalanceBn,
      openPosition,
      symbol,
      refetchPositions,
      refetchBalance,
    ],
  );

  // Close a position (full close — v0.3 has no partial). Fill = current mark.
  const handleClosePosition = useCallback(
    async (positionId: string) => {
      const marketId = marketIdById.get(positionId);
      if (!marketId) return;
      // Resolve the mark price for THIS position's market (may differ from the
      // selected market). Fall back to the selected market's mark.
      const posSymbol = positions.find((p) => p.id === positionId)?.symbol;
      const posMarket = markets.find((m) => m.symbol === posSymbol);
      const markNum = posMarket?.markPrice ?? selectedMarket?.markPrice ?? 0;
      const fillPrice =
        markNum > 0
          ? new BN(Math.round(markNum * 10 ** 6))
          : selectedState?.markPrice ?? new BN(0);

      try {
        const sig = await closePosition({ marketId, fillPrice });
        toast.success(`Close ${posSymbol ?? ""} confirmed`, {
          description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
          action: {
            label: "explorer",
            onClick: () =>
              window.open(getExplorerUrl(sig, "devnet"), "_blank"),
          },
          duration: 8000,
        });
        refetchPositions();
        refetchBalance();
      } catch (err) {
        const { message, description } = formatError(err);
        toast.error(message, { description, duration: 10_000 });
      }
    },
    [
      marketIdById,
      positions,
      markets,
      selectedMarket,
      selectedState,
      closePosition,
      refetchPositions,
      refetchBalance,
    ],
  );

  // pdaById is wired for explorer links on positions (passed to the table via
  // CopyAddress in a future iteration); referenced here to keep it live.
  void pdaById;

  // --- shared panel nodes (reused by desktop + mobile) ---

  const chartNode = (
    <LiveChart symbol={selectedMarket.symbol} />
  );

  const bookNode = (
    <div className="flex h-full flex-col">
      <SimulatedBadge />
      <div className="min-h-0 flex-1">
        <OrderBookPanel
          orderBook={orderBook}
          recentTrades={recentTrades}
          currentPrice={selectedMarket?.price ?? 0}
          priceChange24h={selectedMarket?.change24h ?? 0}
        />
      </div>
    </div>
  );

  const orderNode = selectedMarket ? (
    <div className="flex h-full flex-col">
      <OperatorDisclaimer trader={trader} />
      <div className="min-h-0 flex-1">
        <TradeForm
          market={selectedMarket}
          availableBalance={availableBalance}
          onSubmit={handleSubmitOrder}
        />
      </div>
      <DepositWithdrawInline
        vaultBalanceUi={
          vaultBalanceBn ? formatBN(vaultBalanceBn, USDC_DECIMALS, 2) : "0.00"
        }
        connected={connected}
        onDone={() => {
          refetchBalance();
        }}
      />
      {submitting && (
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Submitting order…
        </div>
      )}
    </div>
  ) : null;

  const positionsNode = (
    <V2PositionsPanel
      positions={positions}
      orders={[]}
      onClosePosition={handleClosePosition}
    />
  );

  if (isMobile) {
    return (
      <MobileLayout
        symbol={symbol}
        markets={markets}
        selectedMarket={selectedMarket}
        onSelectMarket={onSelectMarket}
        chartNode={chartNode}
        bookNode={bookNode}
        orderNode={orderNode}
        positionsNode={positionsNode}
        positionCount={positions.length}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[600px] flex-col bg-background">
      <MarketBar market={selectedMarket} />
      <div className="flex min-h-0 flex-1">
        {/* Left rail — market selector */}
        <aside className="hidden w-64 flex-shrink-0 lg:block">
          <MarketSelectorPanel
            markets={markets}
            selectedMarket={selectedMarket}
            onSelectMarket={onSelectMarket}
          />
        </aside>

        {/* Center + book + order entry */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 border-b border-border">
            <div className="flex min-w-[280px] flex-[3] flex-col border-r border-border bg-card">
              {chartNode}
            </div>
            <div className="hidden min-w-[300px] max-w-[400px] flex-[2] border-r border-border bg-card xl:block">
              {bookNode}
            </div>
          </div>
          <div className="h-56 flex-shrink-0 overflow-auto bg-card">
            {positionsNode}
          </div>
        </section>

        {/* Right rail — order entry + funds */}
        <aside className="hidden w-[360px] flex-shrink-0 overflow-y-auto border-l border-border bg-card scrollbar-thin md:block">
          {orderNode}
        </aside>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={<TradeFallback />}>
      <TradeScreen />
    </Suspense>
  );
}

function TradeFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
      Loading trade screen…
    </div>
  );
}

// ============================================================
//  Mobile layout — tabbed (Chart / Trade / Book / Positions)
// ============================================================

type MobileTab = "chart" | "order" | "book" | "positions";

function MobileLayout({
  symbol,
  markets,
  selectedMarket,
  onSelectMarket,
  chartNode,
  bookNode,
  orderNode,
  positionsNode,
  positionCount,
}: {
  symbol: string;
  markets: Market[];
  selectedMarket: Market | undefined;
  onSelectMarket: (m: Market) => void;
  chartNode: React.ReactNode;
  bookNode: React.ReactNode;
  orderNode: React.ReactNode;
  positionsNode: React.ReactNode;
  positionCount: number;
}) {
  const [tab, setTab] = useState<MobileTab>("chart");
  const [showMarkets, setShowMarkets] = useState(false);

  const TABS: { id: MobileTab; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "order", label: "Trade" },
    { id: "book", label: "Book" },
    { id: "positions", label: "Positions" },
  ];

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col bg-background">
      {/* Market bar — tap to open the selector sheet */}
      <button
        onClick={() => setShowMarkets((v) => !v)}
        className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {symbol}
          </span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              (selectedMarket?.change24h ?? 0) >= 0 ? "text-long" : "text-short",
            )}
          >
            {selectedMarket && selectedMarket.markPrice > 0
              ? `$${selectedMarket.markPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {showMarkets ? "Close" : "Switch market"}
        </span>
      </button>

      {showMarkets && (
        <div className="max-h-[55vh] overflow-y-auto border-b border-border">
          <MarketSelectorPanel
            markets={markets}
            selectedMarket={selectedMarket ?? markets[0]}
            onSelectMarket={(m) => {
              onSelectMarket(m);
              setShowMarkets(false);
            }}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-border bg-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-3 text-[11px] font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-primary bg-primary/5 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "positions" && positionCount > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[8px] text-primary">
                {positionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {tab === "chart" && <div className="h-full">{chartNode}</div>}
        {tab === "order" && <div className="h-full">{orderNode}</div>}
        {tab === "book" && <div className="h-full">{bookNode}</div>}
        {tab === "positions" && <div className="h-full">{positionsNode}</div>}
      </div>
    </div>
  );
}

// ============================================================
//  In-page pieces (no funding-rate UI anywhere)
// ============================================================

/** Compact market bar: symbol, mark, index, OI. NO funding rate. */
function MarketBar({ market }: { market: Market | undefined }) {
  if (!market) return null;
  const hasPrice = market.markPrice > 0;
  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-6 border-b border-border bg-card px-4 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {market.symbol}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            market.change24h >= 0 ? "text-long" : "text-short",
          )}
        >
          {hasPrice
            ? `$${market.markPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
            : "—"}
        </span>
      </div>
      <div className="hidden items-center gap-6 md:flex">
        <div>
          <span className="text-muted-foreground">Mark </span>
          <span className="font-mono tabular-nums text-foreground">
            {hasPrice
              ? `$${market.markPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Index </span>
          <span className="font-mono tabular-nums text-foreground">
            {market.indexPrice > 0
              ? `$${market.indexPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">OI </span>
          <span className="font-mono tabular-nums text-foreground">
            {market.openInterest > 0
              ? `$${(market.openInterest / 1_000_000).toFixed(2)}M`
              : "—"}
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-long" />
        <span className="text-[10px] text-muted-foreground">Solana devnet</span>
      </div>
    </div>
  );
}

/** "simulated / off-chain" label for the order-book panel. */
function SimulatedBadge() {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-1.5">
      <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-yellow-500">
        Simulated
      </span>
      <span className="text-[10px] text-muted-foreground">
        Off-chain demo book — SUR settles via commit/settle, not a live CLOB
      </span>
    </div>
  );
}

/** Honest operator-signer devnet disclaimer rendered above order entry. */
function OperatorDisclaimer({ trader }: { trader: import("@solana/web3.js").PublicKey | undefined }) {
  const [operatorPda] = useMemo(() => {
    if (!trader) return [undefined] as const;
    return SurPdas.engineOperator(trader);
  }, [trader]);

  return (
    <div className="border-b border-border bg-yellow-500/[0.06] px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-yellow-500">
          Devnet demo
        </span>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Open/close are <span className="text-foreground">operator-signed</span>:
          your wallet signs as both trader and engine operator. This is a devnet
          demo, not non-custodial single-sig trading. Your wallet must be a
          registered engine operator.
        </p>
      </div>
      {trader && operatorPda && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">Operator PDA</span>
          <CopyAddress address={operatorPda} chars={4} cluster="devnet" />
        </div>
      )}
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">Engine</span>
        <CopyAddress address={PROGRAM_IDS.perp_engine} chars={4} cluster="devnet" />
      </div>
    </div>
  );
}

/** Inline deposit/withdraw wired to perp_vault, with explorer toasts. */
function DepositWithdrawInline({
  vaultBalanceUi,
  connected,
  onDone,
}: {
  vaultBalanceUi: string;
  connected: boolean;
  onDone: () => void;
}) {
  const deposit = useDepositUSDC();
  const withdraw = useWithdrawUSDC();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const amountBn = useMemo(() => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new BN(Math.round(n * USDC_SCALE));
  }, [amount]);

  async function handleSubmit() {
    if (!amountBn || busy) return;
    if (!connected) {
      toast.error("Wallet not connected", {
        description: "Connect a Solana wallet to deposit or withdraw.",
      });
      return;
    }
    setBusy(true);
    try {
      const sig =
        tab === "deposit" ? await deposit(amountBn) : await withdraw(amountBn);
      toast.success(
        `${tab === "deposit" ? "Deposit" : "Withdraw"} confirmed`,
        {
          description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
          action: {
            label: "explorer",
            onClick: () =>
              window.open(getExplorerUrl(sig, "devnet"), "_blank"),
          },
          duration: 8000,
        },
      );
      setAmount("");
      onDone();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Funds
        </span>
        <span className="font-mono text-[11px] tabular-nums text-foreground">
          ${vaultBalanceUi} USDC
        </span>
      </div>
      <div className="mb-2 flex overflow-hidden rounded bg-input">
        {(["deposit", "withdraw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setAmount("");
            }}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-semibold capitalize transition-colors",
              tab === t
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="relative mb-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          disabled={busy}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-right font-mono text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          $
        </span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={busy || !amountBn || !connected}
        className={cn(
          "w-full rounded-lg py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          tab === "deposit"
            ? "bg-long/20 text-long hover:bg-long/30"
            : "bg-short/20 text-short hover:bg-short/30",
        )}
      >
        {busy
          ? tab === "deposit"
            ? "Depositing…"
            : "Withdrawing…"
          : !connected
            ? "Connect Wallet"
            : !amountBn
              ? "Enter Amount"
              : tab === "deposit"
                ? `Deposit ${amount} USDC`
                : `Withdraw ${amount} USDC`}
      </button>
    </div>
  );
}
