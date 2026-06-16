"use client";

/**
 * Feasibility badge — single source of truth for honestly labeling how an
 * order type / control maps to what the SUR Anchor backend actually
 * guarantees on-chain today. No control in the trade desk should silently
 * imply on-chain behavior the program can't enforce.
 *
 *   live    → fully wired on-chain (perp_engine.open_position). No badge by
 *             default; pass showLive to render a subtle "live" tag.
 *   soon    → the program path or client rail isn't wired yet (Limit needs a
 *             matcher + signer rail; reduce-only / post-only need a new field).
 *   client  → a client/keeper-side trigger with NO on-chain guarantee; only
 *             fires while a session/keeper is online (Stop / TP / SL).
 */

import { cn } from "@/lib/cn";

export type Feasibility = "live" | "soon" | "client";

const MAP: Record<
  Feasibility,
  { label: string; cls: string; title: string }
> = {
  live: {
    label: "live",
    cls: "border-sur-green/50 text-sur-green",
    title: "Wired on-chain — settles via perp_engine.open_position",
  },
  soon: {
    label: "soon",
    cls: "border-rust text-rust",
    title: "Not wired yet — needs program work / client rail before it can execute",
  },
  client: {
    label: "client trigger",
    cls: "border-gold text-gold",
    title:
      "Client-side trigger — no on-chain guarantee; only fires while this session/keeper is online",
  },
};

export function FeasBadge({
  feasibility,
  showLive = false,
  className,
}: {
  feasibility: Feasibility;
  showLive?: boolean;
  className?: string;
}) {
  if (feasibility === "live" && !showLive) return null;
  const m = MAP[feasibility];
  return (
    <span
      title={m.title}
      className={cn(
        "inline-block whitespace-nowrap border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em]",
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  );
}
