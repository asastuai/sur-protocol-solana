"use client";

import Link from "next/link";

import { GITHUB_URL } from "@/lib/links";

export default function PrivacyPage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="text-sur-accent text-xs hover:underline mb-6 inline-block">
          &larr; Back to Home
        </Link>

        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-sur-muted mb-8">Last updated: 2026-05-13</p>

        <div className="space-y-6 text-sm text-sur-text/80 leading-relaxed break-words">
          <Section title="1. Introduction">
            SUR Protocol operates a decentralized perpetual futures trading
            platform on Solana. This Privacy Policy explains how we collect,
            use, and protect information when you use the platform.
          </Section>

          <Section title="2. Information We Collect">
            <p className="font-medium text-sur-text mt-2">On-chain data</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Public Solana addresses (Ed25519 pubkeys) that interact with our programs</li>
              <li>On-chain transaction data (deposits, withdrawals, position events)</li>
              <li>This data is inherently public on the Solana ledger</li>
            </ul>
            <p className="font-medium text-sur-text mt-3">Technical data</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>IP address and approximate geolocation when you load the app</li>
              <li>Browser type, device type, and operating system</li>
            </ul>
            <p className="font-medium text-sur-text mt-3">We do not collect</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Personal identification (name, email, phone)</li>
              <li>Private keys, seed phrases, or wallet credentials</li>
            </ul>
          </Section>

          <Section title="3. How We Use Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>To serve the application and respond to RPC requests</li>
              <li>To analyze aggregate usage and improve the platform</li>
              <li>To investigate abuse or technical failures</li>
            </ul>
          </Section>

          <Section title="4. Third Parties">
            <p>
              The application talks to the Solana devnet cluster over public
              RPC. Wallet adapters (Phantom, Solflare, Backpack) handle key
              custody on your device — we never see private keys.
            </p>
          </Section>

          <Section title="5. Contact">
            <p>
              Questions about this policy?{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sur-accent hover:underline"
              >
                Open an issue on the GitHub repo
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-sur-text mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
