"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/cn";
import {
  getAddressExplorerUrl,
  type ExplorerCluster,
} from "@/lib/explorer";

interface CopyAddressProps {
  /** Base58 string or PublicKey to display and copy. */
  address: string | PublicKey;
  /** Optional label rendered before the truncated address. */
  label?: string;
  /** Characters to keep on each side of the ellipsis (default 4). */
  chars?: number;
  /** Render the explorer external-link button (default true). */
  explorer?: boolean;
  /** Explorer cluster for the address link (default devnet). */
  cluster?: ExplorerCluster;
  className?: string;
}

function toBase58(address: string | PublicKey): string {
  return typeof address === "string" ? address : address.toBase58();
}

/** XXXX…YYYY — keeps `chars` on each side. Short strings pass through. */
function truncate(value: string, chars: number): string {
  if (value.length <= chars * 2 + 1) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

/**
 * Inline, copyable Solana address. Shows a truncated mono base58 string,
 * a copy button that swaps to a check on success, and an optional link to
 * the address on Solana Explorer.
 */
export function CopyAddress({
  address,
  label,
  chars = 4,
  explorer = true,
  cluster = "devnet",
  className,
}: CopyAddressProps) {
  const [copied, setCopied] = useState(false);
  const full = toBase58(address);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }, [full]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] text-sur-text",
        className,
      )}
    >
      {label && <span className="text-sur-muted">{label}</span>}
      <span className="font-mono tabular-nums" title={full}>
        {truncate(full, chars)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy address"}
        className="inline-flex items-center justify-center rounded p-0.5 text-sur-muted transition-colors hover:text-sur-text hover:bg-white/[0.06]"
      >
        {copied ? (
          <Check size={12} className="text-sur-green" aria-hidden />
        ) : (
          <Copy size={12} aria-hidden />
        )}
      </button>
      {explorer && (
        <a
          href={getAddressExplorerUrl(full, cluster)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View on Solana Explorer"
          className="inline-flex items-center justify-center rounded p-0.5 text-sur-muted transition-colors hover:text-sur-accent hover:bg-white/[0.06]"
        >
          <ExternalLink size={12} aria-hidden />
        </a>
      )}
    </span>
  );
}
