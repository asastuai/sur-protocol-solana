"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X, ChevronDown } from "lucide-react";

const STORAGE_KEY = "sur_devnet_banner_dismissed_v2";
const FAUCET_URL = "https://faucet.solana.com";
const RPC_URL = "https://api.devnet.solana.com";
const CLUSTER = "devnet";

export function DevnetBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
    } catch {
      // localStorage unavailable — show the banner by default.
    }
  }, []);

  // Close the cluster popover on outside click.
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  if (!mounted || dismissed) return null;

  const onDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // intentional no-op
    }
  };

  return (
    <div
      role="status"
      className="w-full border-b border-sur-yellow/25 bg-sur-yellow/10 text-sur-yellow"
    >
      <div className="max-w-7xl mx-auto px-4 h-8 flex items-center gap-3 text-[11px]">
        {/* Connection pulse */}
        <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-sur-green opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sur-green" />
        </span>

        <p className="flex-1 min-w-0 truncate leading-none">
          <span className="font-semibold">Devnet</span>
          <span className="opacity-80"> — test funds only. Nothing here has real value.</span>
        </p>

        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="hidden sm:inline-flex items-center gap-1 font-semibold hover:underline whitespace-nowrap"
        >
          Get devnet SOL
          <ExternalLink size={10} aria-hidden />
        </a>

        {/* Cluster / RPC popover */}
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1 font-semibold hover:underline whitespace-nowrap"
          >
            {CLUSTER}
            <ChevronDown
              size={11}
              aria-hidden
              className={`transition-transform ${popoverOpen ? "rotate-180" : ""}`}
            />
          </button>

          {popoverOpen && (
            <div
              role="dialog"
              aria-label="Cluster details"
              className="absolute top-full right-0 mt-2 w-64 p-3 rounded-lg border border-sur-border bg-sur-surface text-sur-text shadow-2xl z-50 animate-fade-in"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sur-muted">
                  Cluster
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sur-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-sur-green live-dot" />
                  Connected
                </span>
              </div>

              <dl className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sur-muted">Network</dt>
                  <dd className="font-mono text-sur-text">{CLUSTER}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sur-muted flex-shrink-0">RPC</dt>
                  <dd className="font-mono text-sur-text truncate" title={RPC_URL}>
                    api.devnet.solana.com
                  </dd>
                </div>
              </dl>

              <a
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-sur-accent hover:underline"
              >
                Solana faucet
                <ExternalLink size={10} aria-hidden />
              </a>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss devnet banner"
          className="opacity-70 hover:opacity-100 transition-opacity p-0.5 -mr-1 flex-shrink-0"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}
