"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { ToolCard } from "@/components/agents/ToolCard";
import {
  DossierHeader,
  DashedPanel,
  SectionLabel,
  Stamp,
  Leader,
} from "@/components/dossier/kit";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { useMarkets } from "@/hooks/data/use-markets";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useOpenIntents } from "@/hooks/data/use-open-intents";
import { useAgentReputation } from "@/hooks/data/use-agent-reputation";

const DOCTRINE = [
  {
    n: "I.",
    title: "Persistent reputation",
    body: "Every dark pool fill, cancel, and expiry is anchored to the operative's wallet on-chain. Handlers can gate by score before accepting an intent.",
  },
  {
    n: "II.",
    title: "Intents, not orderbooks",
    body: "Operatives post what they want — size, side, price band, reputation floor. Other operatives respond off-orderbook. No public quote footprint until settlement.",
  },
  {
    n: "III.",
    title: "Atomic settlement",
    body: "One Solana tx opens both legs of the trade, transfers fees, and updates reputation. No leg risk, no waiting on a relayer.",
  },
];

export default function AgentsPage() {
  const { publicKey } = useWallet();

  // Tool list collapses on mobile. Default open (SSR + no-JS + desktop see the
  // full list); after mount we collapse it on narrow viewports so the long
  // schema list doesn't dominate the 390px screen. Desktop hides the toggle.
  const [toolsOpen, setToolsOpen] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setToolsOpen(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const markets = useMarkets();
  const vault = useVaultBalance(publicKey ?? undefined);
  const positions = useOpenPositions(publicKey ?? undefined);
  const intents = useOpenIntents();
  const reputation = useAgentReputation(publicKey ?? undefined);

  const tryList = useCallback(async () => {
    await markets.refetch();
    return markets.markets.map((m) => ({
      symbol: m.symbol,
      marketId: Array.from(m.marketId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      markPrice: m.markPrice.toString(),
      indexPrice: m.indexPrice.toString(),
      openInterestLong: m.openInterestLong.toString(),
      openInterestShort: m.openInterestShort.toString(),
    }));
  }, [markets]);

  const tryBalance = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet to fetch your balance.");
    await vault.refetch();
    return {
      trader: publicKey.toBase58(),
      balance: vault.balance?.toString() ?? "0",
    };
  }, [publicKey, vault]);

  const tryPosition = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet to fetch positions.");
    await positions.refetch();
    return positions.positions.map((p) => ({
      market: Array.from(p.marketId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      size: p.size.toString(),
      entryPrice: p.entryPrice.toString(),
      margin: p.margin.toString(),
      lastUpdated: p.lastUpdated.toString(),
    }));
  }, [publicKey, positions]);

  const tryReputation = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet to fetch reputation.");
    await reputation.refetch();
    return {
      agent: publicKey.toBase58(),
      score: reputation.score,
      completedTrades: reputation.completedTrades.toString(),
      totalVolume: reputation.totalVolume.toString(),
      expiredIntents: reputation.expiredIntents.toString(),
      cancelledResponses: reputation.cancelledResponses.toString(),
      isNew: reputation.isNew,
    };
  }, [publicKey, reputation]);

  const tryListIntents = useCallback(async () => {
    await intents.refetch();
    return intents.intents.map((i) => ({
      id: i.id.toString(),
      agent: i.agent.toBase58(),
      isBuy: i.isBuy,
      size: i.size.toString(),
      maxPrice: i.maxPrice.toString(),
      expiresAt: i.expiresAt.toString(),
    }));
  }, [intents]);

  const TRY_HANDLERS: Record<string, () => Promise<unknown>> = {
    "sur.list_markets": tryList,
    "sur.get_balance": tryBalance,
    "sur.get_position": tryPosition,
    "sur.get_reputation": tryReputation,
    "sur.list_open_intents": tryListIntents,
  };

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-10">
      <DossierHeader
        path="agents"
        title="Agents"
        subtitle="Operative API — every SUR primitive issued as a typed MCP tool for autonomous handlers."
        stamps={
          <>
            <Stamp>Devnet // 2026</Stamp>
            <Stamp tone="muted">Read-only</Stamp>
          </>
        }
      />

      {/* Briefing */}
      <section className="mb-10">
        <DashedPanel title="Briefing">
          <p className="max-w-2xl text-[13px] leading-relaxed text-bone">
            Every primitive on SUR — deposit, open position, post intent, accept
            intent — is exposed as a typed MCP tool. Drop your operative in, hand
            it a wallet, and it routes capital across markets with no handler in
            the loop.
          </p>
        </DashedPanel>
      </section>

      {/* Doctrine — agent-native rationale, as case notes */}
      <section className="mb-10">
        <SectionLabel>operating doctrine</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {DOCTRINE.map((d) => (
            <div
              key={d.title}
              className="border border-dashed border-ash p-4"
            >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-gold">{d.n}</span>
                <span className="text-[13px] text-bone">{d.title}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-sur-muted">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tool surface — the dossier of available tools */}
      <section className="mb-10">
        <DashedPanel
          title="Tool surface"
          bodyClassName="p-5 md:p-6"
        >
          <div className="mb-4 hidden items-baseline justify-between border-b border-dashed border-ash pb-3 text-[11px] uppercase tracking-[0.18em] text-sur-muted lg:flex">
            <span className="text-gold">// issued tools</span>
            <span className="flex items-center gap-2">
              <Leader />
              <span className="tabular-nums">{MCP_TOOLS.length} tools across 3 programs</span>
            </span>
          </div>
          {/* Collapsed by default on mobile to keep the long schema list from
              dominating the small viewport; the matchMedia effect forces it
              open at lg and up, where the summary toggle is also hidden. */}
          <details
            open={toolsOpen}
            onToggle={(e) => setToolsOpen(e.currentTarget.open)}
            className="group [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="mb-4 flex cursor-pointer list-none items-center justify-between border-b border-dashed border-ash pb-3 text-[11px] uppercase tracking-[0.18em] text-sur-muted lg:hidden">
              <span className="text-gold">// issued tools</span>
              <span className="flex items-center gap-2 tabular-nums">
                {MCP_TOOLS.length} tools
                <span
                  aria-hidden
                  className="text-gold transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {MCP_TOOLS.map((tool) => (
                <div key={tool.name} className="min-w-0">
                  <ToolCard
                    name={tool.name}
                    description={tool.description}
                    inputSchema={tool.input}
                    outputSchema={tool.output}
                    category={tool.category}
                    onTryIt={
                      tool.category === "read"
                        ? TRY_HANDLERS[tool.name]
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </details>
        </DashedPanel>
      </section>

      {/* Connect your agent — field manual */}
      <section id="connect-your-agent" className="mb-10">
        <DashedPanel title="Field manual">
          <SectionLabel>deploy your operative</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                TypeScript — @asastuai/sur-sdk
              </div>
              <pre className="overflow-x-auto border border-dashed border-ash bg-smoke p-3 text-[12px] leading-relaxed text-bone">
{`import { SurClient } from "@asastuai/sur-sdk";

const sur = new SurClient({ cluster: "devnet", wallet });

// Read tools
const markets = await sur.listMarkets();
const balance = await sur.getBalance(wallet.publicKey);

// Intent flow
const { signature, intentId } = await sur.postIntent({
  marketId: markets[0].marketId,
  isBuy: true,
  size: BigInt(10_000_000),       // 0.1 BTC
  minPrice: BigInt(50_000_000_000),
  maxPrice: BigInt(51_000_000_000),
  durationSecs: 600n,
});`}
              </pre>
            </div>
            <div className="min-w-0">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                Python — sur-sdk
              </div>
              <pre className="overflow-x-auto border border-dashed border-ash bg-smoke p-3 text-[12px] leading-relaxed text-bone">
{`from sur_sdk import SurClient

sur = SurClient(cluster="devnet", keypair=kp)

markets = sur.list_markets()
balance = sur.get_balance(kp.pubkey())

sig = sur.post_intent(
    market_id=markets[0].market_id,
    is_buy=True,
    size=10_000_000,            # 0.1 BTC
    min_price=50_000_000_000,
    max_price=51_000_000_000,
    duration_secs=600,
)`}
              </pre>
            </div>
          </div>
        </DashedPanel>
      </section>

      <section className="border-t border-dashed border-ash pt-5 text-[10px] uppercase tracking-[0.2em] text-sur-muted">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-gold">// note</span>
          <Leader />
          <span className="normal-case tracking-normal text-[12px] leading-relaxed text-sur-muted">
            Programs are deployed on Solana devnet. Write tools require init
            (Phase 9) to land — read tools return empty results gracefully until
            then.
          </span>
        </div>
      </section>
    </div>
  );
}
