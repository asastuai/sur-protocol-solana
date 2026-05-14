"use client";

import Link from "next/link";
import { Github, FileText, MessageCircle, Twitter, ExternalLink } from "lucide-react";

const GITHUB_URL = "https://github.com/asastuai/sur-protocol-solana";

export function Footer() {
  return (
    <footer className="border-t border-sur-border bg-sur-surface/40 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-sur-muted">
          <span className="font-mono font-bold tracking-widest text-sur-accent">
            SUR
          </span>
          <span>· Solana devnet · v0.3</span>
        </div>

        <nav
          aria-label="Footer links"
          className="flex items-center gap-3 text-[11px] text-sur-muted"
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-sur-text transition-colors"
          >
            <Github size={12} aria-hidden />
            GitHub
            <ExternalLink size={9} aria-hidden className="opacity-60" />
          </a>
          <Link
            href="/docs"
            className="inline-flex items-center gap-1 hover:text-sur-text transition-colors"
          >
            <FileText size={12} aria-hidden />
            Docs
          </Link>
          <a
            href="#"
            aria-disabled="true"
            title="Discord coming soon"
            className="inline-flex items-center gap-1 opacity-60 cursor-not-allowed"
          >
            <MessageCircle size={12} aria-hidden />
            Discord
          </a>
          <a
            href="#"
            aria-disabled="true"
            title="Twitter coming soon"
            className="inline-flex items-center gap-1 opacity-60 cursor-not-allowed"
          >
            <Twitter size={12} aria-hidden />
            Twitter
          </a>
        </nav>
      </div>
    </footer>
  );
}
