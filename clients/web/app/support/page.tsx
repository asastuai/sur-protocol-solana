"use client";

import { useState } from "react";
import Link from "next/link";

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: "What is SUR Protocol on Solana?",
    a: "An agent-native perpetual futures DEX. v0.3 ships eleven Anchor programs on devnet plus a Next.js web client wired to the read + write paths.",
  },
  {
    q: "Why do my transactions fail?",
    a: "Programs are deployed but markets and vault config are not initialized on-chain yet. Phase 9 will run init from an admin wallet. Until then, writes fail with AccountNotInitialized — that is expected.",
  },
  {
    q: "Which wallets are supported?",
    a: "Phantom, Solflare, and Backpack on Solana devnet. We do not use Privy or any social-login layer in v1.",
  },
  {
    q: "Where do I get devnet USDC?",
    a: "We use the canonical Solana devnet USDC mint (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU). Use any community devnet faucet to fund the ATA owned by your wallet.",
  },
  {
    q: "Where is the source code?",
    a: "GitHub. See the project README for the monorepo layout — programs in /programs, web client in /clients/web, SDK in /clients/sdk.",
  },
];

export default function SupportPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sur-accent text-xs hover:underline mb-6 inline-block">
          &larr; Back to Home
        </Link>

        <h1 className="text-2xl font-bold mb-2">Support</h1>
        <p className="text-sm text-sur-muted mb-8">
          Frequently asked questions about SUR Protocol on Solana.
        </p>

        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div
              key={f.q}
              className="bg-sur-surface border border-sur-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-white/[0.02] transition-colors"
              >
                <span>{f.q}</span>
                <svg
                  width="14"
                  height="8"
                  viewBox="0 0 14 8"
                  fill="none"
                  className={`text-sur-muted transition-transform ${open === i ? "rotate-180" : ""}`}
                >
                  <path
                    d="M1 1L7 7L13 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {open === i && (
                <div className="px-4 pb-4 text-sm text-sur-muted leading-relaxed border-t border-sur-border/50">
                  <div className="pt-3">{f.a}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
