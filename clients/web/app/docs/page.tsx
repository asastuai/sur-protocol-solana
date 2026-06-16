"use client";

import Link from "next/link";

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    items: [
      {
        heading: "What is SUR Protocol on Solana?",
        text: "SUR Protocol is an agent-native perpetual futures DEX ported from Base L2 to Solana. Eleven Anchor programs provide the protocol surface: perp_engine, perp_vault, order_settlement, oracle_router, liquidator, insurance_fund, a2a_darkpool, auto_deleveraging, collateral_manager, sur_timelock, and trading_vault.",
      },
      {
        heading: "Status",
        list: [
          "All 11 programs deployed to Solana devnet",
          "Read paths wired (markets, vault balance, positions, engine view)",
          "Write paths wired (deposit, withdraw, open position, close position)",
          "Init (Phase 9) pending — programs return AccountNotInitialized until then",
          "Charts (Phase 6) and dark-pool / agent UI (Phase 7) deferred",
        ],
      },
    ],
  },
  {
    id: "getting-started",
    title: "Getting Started",
    items: [
      {
        heading: "1. Connect a Solana Wallet",
        text: "Click Select Wallet in the top right. SUR supports Phantom, Solflare, and Backpack on Solana devnet.",
      },
      {
        heading: "2. Fund Devnet SOL",
        text: "Use `solana airdrop 2` on the CLI or any devnet faucet to fund your wallet with SOL for transaction fees.",
      },
      {
        heading: "3. Acquire Devnet USDC",
        text: "The protocol uses the canonical Solana devnet USDC mint (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU). Use any devnet USDC faucet to top up the ATA owned by your wallet.",
      },
      {
        heading: "4. Deposit and Trade",
        text: "Open /trade, switch to the Funds panel, deposit USDC, then place a long or short via the right-side order panel. Writes will revert until Phase 9 init runs.",
      },
    ],
  },
  {
    id: "architecture",
    title: "Architecture",
    items: [
      {
        heading: "Programs",
        text: "perp_engine is the core matching + position engine. perp_vault custodies USDC and routes margin locks via CPI. The other programs (oracle_router, liquidator, etc.) ship the full surface but are not exercised by the v0.3 web client.",
      },
      {
        heading: "Frontend",
        text: "Next.js 15 App Router, Tailwind, wallet-adapter, @tanstack/react-query. Anchor 0.31 program clients wrap the IDLs in clients/web/idls/. All hooks live in clients/web/hooks/.",
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="text-sur-accent text-xs hover:underline mb-6 inline-block">
          &larr; Back to Home
        </Link>

        <h1 className="text-2xl font-bold mb-2">Documentation</h1>
        <p className="text-sm text-sur-muted mb-8">SUR Protocol on Solana — v0.3 devnet</p>

        <div className="space-y-10 text-sm text-sur-text/80 leading-relaxed break-words">
          {SECTIONS.map((s) => (
            <section key={s.id}>
              <h2 className="text-lg font-semibold text-sur-text mb-3">{s.title}</h2>
              <div className="space-y-4">
                {s.items.map((it) => (
                  <div key={it.heading}>
                    <h3 className="text-sm font-semibold text-sur-text mb-1">{it.heading}</h3>
                    {it.text && <p>{it.text}</p>}
                    {it.list && (
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {it.list.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
