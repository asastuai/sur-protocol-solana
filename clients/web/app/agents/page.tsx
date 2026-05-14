"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Bot, ShieldCheck, Network, Zap } from "lucide-react";

import { ToolCard } from "@/components/agents/ToolCard";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { useMarkets } from "@/hooks/data/use-markets";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { useOpenPositions } from "@/hooks/data/use-open-positions";
import { useOpenIntents } from "@/hooks/data/use-open-intents";
import { useAgentReputation } from "@/hooks/data/use-agent-reputation";

export default function AgentsPage() {
  const { publicKey } = useWallet();

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
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <section className="mb-12">
        <div className="flex items-center gap-2 text-sur-accent text-[11px] uppercase tracking-widest font-semibold mb-3">
          <Bot size={14} />
          <span>Agent API</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-sur-text mb-3 leading-tight">
          SUR Agent API — built for LLM agents to trade autonomously
        </h1>
        <p className="text-sur-muted max-w-2xl text-[14px] leading-relaxed">
          Every primitive on SUR — deposit, open position, post intent, accept
          intent — is exposed as a typed MCP tool. Drop your agent in, give it
          a wallet, and it can route capital across markets without a human in
          the loop.
        </p>
      </section>

      {/* Why agent-native */}
      <section className="mb-12 grid gap-4 grid-cols-1 md:grid-cols-3">
        <div className="bg-sur-surface border border-sur-border rounded-lg p-4">
          <ShieldCheck className="text-sur-accent mb-2" size={18} />
          <h3 className="font-semibold text-sur-text text-[14px] mb-1">
            Persistent reputation
          </h3>
          <p className="text-[12px] text-sur-muted leading-relaxed">
            Every dark pool fill, cancel, and expiry is anchored to your
            wallet on-chain. Counterparties can gate by score before
            accepting your intents.
          </p>
        </div>
        <div className="bg-sur-surface border border-sur-border rounded-lg p-4">
          <Network className="text-sur-accent mb-2" size={18} />
          <h3 className="font-semibold text-sur-text text-[14px] mb-1">
            Intents, not orderbooks
          </h3>
          <p className="text-[12px] text-sur-muted leading-relaxed">
            Agents post what they want — size, side, price band, reputation
            floor. Other agents respond off-orderbook. No public quote
            footprint until settlement.
          </p>
        </div>
        <div className="bg-sur-surface border border-sur-border rounded-lg p-4">
          <Zap className="text-sur-accent mb-2" size={18} />
          <h3 className="font-semibold text-sur-text text-[14px] mb-1">
            Atomic settlement
          </h3>
          <p className="text-[12px] text-sur-muted leading-relaxed">
            One Solana tx opens both legs of the trade, transfers fees, and
            updates reputation. No leg risk, no waiting on a relayer.
          </p>
        </div>
      </section>

      {/* Tool surface */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-sur-text">Tool surface</h2>
          <span className="text-[11px] text-sur-muted">
            {MCP_TOOLS.length} tools across 3 programs
          </span>
        </div>
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {MCP_TOOLS.map((tool) => (
            <ToolCard
              key={tool.name}
              name={tool.name}
              description={tool.description}
              inputSchema={tool.input}
              outputSchema={tool.output}
              category={tool.category}
              onTryIt={
                tool.category === "read" ? TRY_HANDLERS[tool.name] : undefined
              }
            />
          ))}
        </div>
      </section>

      {/* Connect your agent */}
      <section id="connect-your-agent" className="mb-12">
        <h2 className="text-lg font-semibold text-sur-text mb-4">
          Connect your agent
        </h2>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-sur-muted mb-2 font-semibold">
              TypeScript — @asastuai/sur-sdk
            </div>
            <pre className="text-[12px] leading-relaxed font-mono text-sur-text bg-sur-surface border border-sur-border rounded-lg p-3 overflow-x-auto">
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
          <div>
            <div className="text-[11px] uppercase tracking-wider text-sur-muted mb-2 font-semibold">
              Python — sur-sdk
            </div>
            <pre className="text-[12px] leading-relaxed font-mono text-sur-text bg-sur-surface border border-sur-border rounded-lg p-3 overflow-x-auto">
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
      </section>

      <section className="border-t border-sur-border pt-6">
        <p className="text-[12px] text-sur-muted leading-relaxed">
          Programs are deployed on Solana devnet. Write tools require init
          (Phase 9) to land — read tools return empty results gracefully
          until then.
        </p>
      </section>
    </div>
  );
}
