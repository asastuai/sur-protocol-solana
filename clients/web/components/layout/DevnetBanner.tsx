"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

const STORAGE_KEY = "sur_devnet_banner_dismissed_v1";

export function DevnetBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setDismissed(true);
    } catch {
      // localStorage unavailable — show banner by default
    }
  }, []);

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
      className="w-full bg-sur-yellow/10 border-b border-sur-yellow/30 text-sur-yellow"
    >
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-3 text-[11px]">
        <span aria-hidden className="text-sm leading-none">🛠</span>
        <p className="flex-1 leading-relaxed">
          <span className="font-semibold">Devnet</span>
          <span className="opacity-80"> · Phase 9 init pending — write operations will fail until programs are initialized.</span>
        </p>
        <a
          href="https://faucet.solana.com"
          target="_blank"
          rel="noreferrer noopener"
          className="hidden sm:inline-flex items-center gap-1 font-semibold hover:underline"
        >
          Need devnet SOL?
          <ExternalLink size={10} aria-hidden />
        </a>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss devnet banner"
          className="opacity-70 hover:opacity-100 transition-opacity p-0.5 -mr-1"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}
