"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/layout/WalletButton";
import { truncatePubkey } from "@/lib/formatters";

const DepthWaveField = dynamic(
  () => import("@/components/landing/DepthWaveField"),
  { ssr: false, loading: () => null }
);

export default function LandingPage() {
  const { publicKey, connected } = useWallet();

  return (
    <div className="relative">
      {/* ===== HERO ===== */}
      <section className="relative flex min-h-[86vh] flex-col overflow-hidden">
        {/* depth-wave point field (Solana palette) */}
        <div className="absolute inset-0">
          <DepthWaveField />
        </div>

        {/* atmospheric overlays */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(68% 52% at 50% 42%, rgba(8,10,14,0.62), transparent 72%), radial-gradient(120% 80% at 50% 8%, rgba(153,69,255,0.14), transparent 55%), radial-gradient(90% 60% at 70% 30%, rgba(20,241,149,0.07), transparent 60%), linear-gradient(to bottom, transparent 60%, var(--sur-bg) 97%)",
          }}
        />

        {/* hero content */}
        <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sol-purple/30 bg-sol-purple/10 px-3.5 py-1.5 text-[12px] font-medium text-sur-text backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-sol-green live-dot" />
            Solana Devnet · agent-native perps
          </div>

          <h1 className="font-display text-5xl font-extrabold leading-[1.04] tracking-tight md:text-7xl">
            Perpetual futures.
            <br />
            <span className="text-sol-gradient">Agent-native. On Solana.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-[#c4a7f5] md:text-[16px]">
            Eleven Anchor programs live on devnet — perp engine, intent-based dark
            pool, persistent agent reputation and MCP-native settlement.
            Self-custodial, on-chain, built for autonomous traders.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/trade"
              className="rounded-lg bg-sol-gradient px-6 py-3 text-[14px] font-bold text-[#0a0e12] shadow-[0_0_28px_rgba(20,241,149,0.22)] transition hover:brightness-110"
            >
              Open Trade
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-sur-border bg-sur-surface/70 px-6 py-3 text-[14px] font-semibold text-sur-text backdrop-blur-sm transition hover:border-sol-purple/50 hover:bg-white/[0.04]"
            >
              View Dashboard
            </Link>
            <WalletButton />
          </div>

          {connected && publicKey && (
            <div className="mt-7 inline-flex items-center gap-2 rounded-lg border border-sur-border bg-sur-surface/70 px-4 py-2 font-mono text-sm backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-sol-green" />
              <span className="text-sur-muted">connected:</span>
              <span className="text-sur-text">{truncatePubkey(publicKey.toBase58())}</span>
            </div>
          )}
        </div>

        {/* scroll cue */}
        <div className="relative z-10 flex justify-center pb-7">
          <span className="flex flex-col items-center gap-1.5 text-[11px] uppercase tracking-widest text-sur-muted">
            Scroll
            <svg className="h-4 w-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            What ships in this port.
          </h2>
          <p className="mt-3 max-w-lg text-[15px] text-sur-muted">
            The full EVM protocol, re-architected for Solana and the agent economy.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <Feature
              title="Eleven Anchor programs"
              body="perp_engine, perp_vault, order_settlement, oracle_router, liquidator, insurance_fund, a2a_darkpool, auto_deleveraging, collateral_manager, sur_timelock, trading_vault — all deployed on devnet."
            />
            <Feature
              title="Agent-native by design"
              body="Intent-based A2A dark pool, persistent on-chain agent reputation, and MCP-native tooling so autonomous agents can trade, settle and be scored."
            />
            <Feature
              title="Self-custodial"
              body="Phantom, Solflare and Backpack via the Solana wallet-adapter. Your keys, your funds — read and write paths wired end-to-end."
            />
          </div>
        </div>
      </section>

      {/* ===== STATUS ===== */}
      <section className="px-6 pb-28">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-sur-border bg-sur-surface p-7">
          <h3 className="font-display text-lg font-bold text-sur-text">Devnet status</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sur-muted">
            UI ported from the EVM reference frontend and wired to Solana on-chain
            reads and write paths. Charts and dark-pool / agent panels are landing
            next. Write operations require Phase 9 program init.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatusItem label="Programs" value="11/11 deployed" tone="ok" />
            <StatusItem label="Read paths" value="wired" tone="ok" />
            <StatusItem label="Write paths" value="wired" tone="ok" />
            <StatusItem label="Init" value="Phase 9" tone="warn" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-sur-border bg-sur-surface/60 p-6 backdrop-blur-sm transition-colors hover:border-sol-purple/40">
      <h3 className="font-display text-[17px] font-bold text-sur-text">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-sur-muted">{body}</p>
    </div>
  );
}

function StatusItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  const color = tone === "ok" ? "text-sol-green" : "text-sur-yellow";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-sur-muted">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
