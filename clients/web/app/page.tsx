"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/layout/WalletButton";
import { truncatePubkey } from "@/lib/formatters";

export default function LandingPage() {
  const { publicKey, connected } = useWallet();

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(30,128,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 30% 70%, rgba(14,203,129,0.06) 0%, transparent 60%)",
          }}
        />
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

        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sur-accent/10 border border-sur-accent/20 text-xs text-sur-accent font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-sur-green live-dot" />
            Solana devnet — read paths live
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
            Perpetual futures.
            <br />
            <span className="bg-gradient-to-r from-sur-accent via-blue-400 to-sur-green bg-clip-text text-transparent">
              Agent-native. On Solana.
            </span>
          </h1>

          <p className="text-lg text-sur-muted max-w-2xl mx-auto leading-relaxed mb-10">
            Eleven Anchor programs deployed on devnet. Read paths to markets,
            vault balance, positions, and engine view are wired end-to-end.
            Write paths ready behind Phase 9 init.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-12">
            <Link
              href="/trade"
              className="px-6 py-3 rounded-lg bg-sur-accent text-white text-sm font-semibold hover:brightness-110 transition-all"
            >
              Open Trade
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 rounded-lg bg-sur-surface border border-sur-border text-sur-text text-sm font-semibold hover:bg-white/[0.04] transition-colors"
            >
              View Dashboard
            </Link>
            <WalletButton />
          </div>

          {connected && publicKey && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sur-surface border border-sur-border font-mono text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-sur-green" />
              <span className="text-sur-muted">connected:</span>
              <span className="text-sur-text">
                {truncatePubkey(publicKey.toBase58())}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm font-semibold text-sur-muted uppercase tracking-wider mb-8 text-center">
            What ships in this port
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature
              title="Anchor programs"
              body="Eleven SUR programs deployed on devnet: perp_engine, perp_vault, order_settlement, oracle_router, liquidator, insurance_fund, a2a_darkpool, auto_deleveraging, collateral_manager, sur_timelock, trading_vault."
            />
            <Feature
              title="Wallet-adapter"
              body="Phantom, Solflare, Backpack — wired through the Solana wallet-adapter stack. Devnet-only for now. No Privy, no social login."
            />
            <Feature
              title="Read + write paths"
              body="useMarkets, useVaultBalance, useOpenPositions, useEngineView for read. useDepositUSDC, useWithdrawUSDC, useOpenPosition, useClosePosition for write."
            />
          </div>
        </div>
      </section>

      {/* Status section */}
      <section className="px-6 pb-32">
        <div className="max-w-4xl mx-auto bg-sur-surface border border-sur-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-sur-text mb-3">
            Phase 5 status
          </h3>
          <p className="text-sm text-sur-muted leading-relaxed mb-4">
            UI ported from the EVM reference frontend. Layout, components,
            and pages are wired to Solana on-chain reads via the Phase 3
            hooks and to write paths via the Phase 4 tx hooks. Charts
            (Phase 6) and dark-pool / agent panels (Phase 7) are stubbed.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
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
    <div className="bg-sur-surface border border-sur-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-sur-text mb-2">{title}</h3>
      <p className="text-xs text-sur-muted leading-relaxed">{body}</p>
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
  const color = tone === "ok" ? "text-sur-green" : "text-sur-yellow";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-sur-muted">
        {label}
      </div>
      <div className={`text-sm font-medium ${color} mt-1`}>{value}</div>
    </div>
  );
}
