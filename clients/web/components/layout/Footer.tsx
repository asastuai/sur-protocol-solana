import Link from "next/link";
import { Github, ExternalLink } from "lucide-react";
import { PROGRAM_IDS } from "@/lib/program-ids";
import { SolanaBadge } from "@/components/trust/SolanaBadge";
import {
  SUR_GITHUB_URL,
  SUR_DOCS_URL,
  SUR_X_URL,
  SUR_DISCORD_URL,
} from "@/lib/constants";

const PROGRAM_COUNT = Object.keys(PROGRAM_IDS).length;
const YEAR = new Date().getFullYear();

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

const PRODUCT_LINKS: FooterLink[] = [
  { label: "Trade", href: "/trade" },
  { label: "Markets", href: "/markets" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Vaults", href: "/vaults" },
];

const DEVELOPER_LINKS: FooterLink[] = [
  { label: "Docs", href: SUR_DOCS_URL },
  { label: "Developers", href: "/developers" },
  { label: "GitHub", href: SUR_GITHUB_URL, external: true },
];

// Community links are sourced from constants; omit any that lack a real URL
// rather than render dead `#` placeholders.
const COMMUNITY_LINKS: FooterLink[] = [];
if (SUR_X_URL) COMMUNITY_LINKS.push({ label: "X", href: SUR_X_URL, external: true });
if (SUR_DISCORD_URL) {
  COMMUNITY_LINKS.push({ label: "Discord", href: SUR_DISCORD_URL, external: true });
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sur-muted mb-3">
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[13px] text-sur-text/80 hover:text-sur-text transition-colors"
              >
                {link.label === "GitHub" && <Github size={13} aria-hidden />}
                {link.label}
                <ExternalLink size={10} aria-hidden className="opacity-50" />
              </a>
            ) : (
              <Link
                href={link.href}
                className="text-[13px] text-sur-text/80 hover:text-sur-text transition-colors"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-sur-border bg-sur-surface/40">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand + Solana badge */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
            <Link href="/" aria-label="SUR Protocol home" className="hover:opacity-90 transition-opacity">
              <span className="font-mono font-bold text-sm tracking-widest text-sur-accent">
                SUR<span className="text-sur-text"> PROTOCOL</span>
              </span>
            </Link>
            <p className="text-[12px] leading-relaxed text-sur-muted max-w-[28ch]">
              Agent-native perpetual futures, settled on-chain on Solana.
            </p>
            <SolanaBadge />
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Developers" links={DEVELOPER_LINKS} />
          <FooterColumn title="Community" links={COMMUNITY_LINKS} />
        </div>

        {/* Programs-live line */}
        <div className="mt-10 pt-6 border-t border-sur-border">
          <Link
            href="/docs#contracts"
            className="inline-flex items-center gap-2 text-[12px] text-sur-muted hover:text-sur-text transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sur-green live-dot" aria-hidden />
            {PROGRAM_COUNT} programs live on devnet
          </Link>

          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-sur-muted">
            <span>© {YEAR} SUR Protocol. All rights reserved.</span>
            <span className="opacity-80">
              Devnet deployment — test funds only, not for production use.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
