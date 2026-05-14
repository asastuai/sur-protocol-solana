"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sur-accent text-xs hover:underline mb-6 inline-block">
          &larr; Back to Home
        </Link>

        <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-sur-muted mb-8">Last updated: 2026-05-13</p>

        <div className="space-y-6 text-sm text-sur-text/80 leading-relaxed">
          <Section title="1. Acceptance of Terms">
            By accessing or using SUR Protocol on Solana devnet (the
            &ldquo;Platform&rdquo;), you agree to be bound by these Terms of
            Service. If you do not agree, do not use the Platform.
          </Section>

          <Section title="2. Description of Service">
            The Platform is a decentralized perpetual futures interface that
            calls Anchor programs deployed on Solana devnet. Currently in
            v0.3 — programs are deployed but not initialized; this is a
            developer preview, not a production trading venue.
          </Section>

          <Section title="3. Eligibility">
            <ul className="list-disc pl-5 space-y-1">
              <li>You must be at least 18 years of age</li>
              <li>Not a resident of any jurisdiction where crypto trading is prohibited</li>
              <li>Not subject to any sanctions or trade restrictions</li>
            </ul>
          </Section>

          <Section title="4. Risk Disclosure">
            <div className="p-3 bg-sur-red/10 border border-sur-red/20 rounded mt-2">
              <p className="text-sur-red font-medium text-xs">
                Trading perpetual futures involves substantial risk of loss.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-sur-red/80">
                <li>Leveraged trading can result in losses exceeding your initial deposit</li>
                <li>Cryptocurrency markets are highly volatile</li>
                <li>Liquidation may occur if margin falls below maintenance</li>
                <li>Only trade with funds you can afford to lose</li>
                <li>Devnet uses no real value — but the same rules apply on any live deployment</li>
              </ul>
            </div>
          </Section>

          <Section title="5. No Warranty">
            The Platform is provided &ldquo;as is&rdquo; without warranties of
            any kind. We do not guarantee uninterrupted access, accuracy of
            data, or the security of any on-chain program.
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
