"use client";

import Link from "next/link";
import { Github, FileText, ExternalLink } from "lucide-react";

import { GITHUB_URL } from "@/lib/links";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-dashed border-ash bg-ink font-mono">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-4 text-[10px] uppercase tracking-[0.18em] text-sur-muted sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gold">SUR://</span>
          <span>solana devnet · v0.3 · handler read-only</span>
        </div>

        <nav aria-label="Footer links" className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 transition-colors hover:text-gold"
          >
            <Github size={12} aria-hidden />
            GitHub
            <ExternalLink size={9} aria-hidden className="opacity-60" />
          </a>
          <Link href="/docs" className="inline-flex items-center gap-1 transition-colors hover:text-gold">
            <FileText size={12} aria-hidden />
            Docs
          </Link>
        </nav>
      </div>
    </footer>
  );
}
