"use client";

import { CheckCircle2, Loader2, ExternalLink, XCircle } from "lucide-react";
import { getExplorerUrl } from "@/lib/explorer";

export type TxState = "pending" | "confirmed" | "failed";

interface Props {
  signature?: string;
  state: TxState;
  label?: string;
  error?: string;
}

/**
 * Inline status card for multi-step tx flows where a toast alone is too
 * transient. Renders pending / confirmed / failed states with an explorer
 * link once we have a signature.
 */
export function TxStatus({ signature, state, label, error }: Props) {
  const explorer = signature ? getExplorerUrl(signature, "devnet") : null;

  if (state === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-sur-border bg-sur-surface text-[11px] text-sur-muted">
        <Loader2 size={12} className="animate-spin text-sur-accent" />
        <span>{label ?? "Submitting…"}</span>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-sur-red/30 bg-sur-red/5 text-[11px] text-sur-red">
        <XCircle size={12} className="mt-0.5 flex-shrink-0" />
        <span className="break-words">{error ?? label ?? "Transaction failed"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-sur-green/30 bg-sur-green/5 text-[11px] text-sur-green">
      <CheckCircle2 size={12} aria-hidden />
      <span className="flex-1">{label ?? "Confirmed"}</span>
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline font-mono"
        >
          {signature?.slice(0, 6)}…
          <ExternalLink size={10} aria-hidden />
        </a>
      )}
    </div>
  );
}
