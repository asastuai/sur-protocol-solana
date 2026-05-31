"use client";

import Link from "next/link";
import {
  Lock,
  Brain,
  Zap,
  Coins,
  Boxes,
  TerminalSquare,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { MARKETS } from "@/lib/markets";
import { MarketCard } from "@/components/markets/MarketCard";
import { ProgramGrid } from "@/components/trust/ProgramGrid";

// Drive the live-markets row from the canonical market list so this page
// never drifts from on-chain truth (only BTC/SOL/ETH exist on Solana).
const FEATURED = MARKETS;

interface FeatureTile {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: ReadonlyArray<FeatureTile> = [
  {
    icon: Brain,
    title: "Agent Dark Pool",
    body: "Agents post and match intents off-book before settling on-chain.",
  },
  {
    icon: Boxes,
    title: "Persistent Reputation",
    body: "Every agent carries an on-chain reputation record across trades.",
  },
  {
    icon: Zap,
    title: "Atomic Settlement",
    body: "Commit then settle — fills clear in a single on-chain transaction.",
  },
  {
    icon: Coins,
    title: "Multi-asset Collateral",
    body: "A non-custodial vault backs your positions with on-chain margin.",
  },
  {
    icon: Lock,
    title: "11 On-chain Programs",
    body: "Engine, vault, oracle, dark pool and more — all verifiable on devnet.",
  },
  {
    icon: TerminalSquare,
    title: "MCP Tool API",
    body: "A tool surface that lets AI agents trade the protocol directly.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* ============================================================ */}
      {/*  1. HERO                                                     */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20">
        {/* Gradient glow */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(30,128,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 30% 70%, rgba(14,203,129,0.06) 0%, transparent 60%)",
          }}
        />
        {/* Masked grid */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(30,35,41,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(30,35,41,0.4) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
          }}
        />

        <div className="mx-auto max-w-4xl text-center animate-fade-in">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-sur-accent/20 bg-sur-accent/10 px-3 py-1 text-xs font-medium text-sur-accent">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-sur-green" />
            Live on Devnet
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Perpetual futures,
            <br />
            <span className="bg-gradient-to-r from-[#9945FF] via-[#8B5CF6] to-[#14F195] bg-clip-text text-transparent">
              agent-native, on Solana.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-sur-muted">
            A non-custodial vault, an agent dark pool, and atomic on-chain
            settlement. Trade perps yourself or let agents trade for you —
            every fill clears on-chain.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/trade"
              className="group inline-flex items-center gap-2 rounded-lg bg-sur-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
            >
              Open Trade
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-sur-border bg-sur-surface px-6 py-3 text-sm font-semibold text-sur-text transition-colors hover:bg-white/[0.04]"
            >
              Read docs
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. LIVE MARKETS                                             */}
      {/* ============================================================ */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-5xl animate-slide-up">
          <div className="mb-6 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-sur-muted">
              Live markets
            </h2>
            <Link
              href="/trade"
              className="inline-flex items-center gap-1 text-xs font-medium text-sur-accent transition-colors hover:text-sur-text"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED.map((market) => (
              <MarketCard key={market.symbol} market={market} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. FEATURE TILES                                           */}
      {/* ============================================================ */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-sur-muted">
            Built for humans and agents
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FeatureTile key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  4. TRUST STRIP                                             */}
      {/* ============================================================ */}
      <section className="px-6 pb-32">
        <div className="mx-auto max-w-5xl">
          <div className="panel p-6">
            <p className="mb-5 text-xs leading-relaxed text-sur-muted">
              Verifiable on devnet — every program below is deployed on-chain
              and links to Solana Explorer. Nothing here is a black box.
            </p>
            <ProgramGrid />
          </div>
        </div>
      </section>

      {/* Footer lives in the root layout — do not add one here. */}
    </div>
  );
}

function FeatureTile({ icon: Icon, title, body }: FeatureTile) {
  return (
    <div className="group rounded-xl border border-sur-border bg-sur-surface p-5 transition-colors hover:border-white/15 hover:bg-sur-surface-2">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sur-gradient text-white">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="mb-1.5 text-sm font-semibold text-sur-text">{title}</h3>
      <p className="text-xs leading-relaxed text-sur-muted">{body}</p>
    </div>
  );
}
