"use client";

/**
 * Dossier kit — shared building blocks for the SUR "folders / terminal" theme
 * (matched to Secret Agent Wallet). Use these across every page so the look
 * stays consistent and tweaks happen in one place.
 *
 * Palette tokens (from tailwind/globals): ink, smoke, ash, bone, gold, rust,
 * plus sur-text / sur-muted. Font: mono by default, font-display = serif.
 */

import { useEffect, useState, type ReactNode } from "react";

export function useClock(): string {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setT(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/** Rubber-stamp tag. tone: gold (default) | rust | muted */
export function Stamp({
  children,
  tone = "gold",
}: {
  children: ReactNode;
  tone?: "gold" | "rust" | "muted";
}) {
  const c =
    tone === "rust"
      ? "border-rust text-rust"
      : tone === "muted"
        ? "border-sur-muted text-sur-muted"
        : "border-gold text-gold";
  return (
    <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${c}`}>
      {children}
    </span>
  );
}

/** Section label like `// open positions` */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-gold">
      // {children}
    </div>
  );
}

/** Dotted leader that fills horizontal space (the folders "detail" line) */
export function Leader() {
  return (
    <span
      aria-hidden
      className="mx-3 flex-1 self-end border-b border-dotted"
      style={{ borderColor: "#4a4636", marginBottom: 4 }}
    />
  );
}

/** Dashed-bordered panel with an optional folder tab on top. */
export function DashedPanel({
  title,
  children,
  className = "",
  bodyClassName = "p-5 md:p-6",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {title && (
        <div className="inline-flex items-center gap-2 border border-b-0 border-gold px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold" style={{ background: "#12110d" }}>
          ▸ {title}
        </div>
      )}
      <div className={`border border-dashed border-ash ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Terminal-style page header. Renders the `SUR://path` line + devnet/clock
 * status, a serif title, optional subtitle and stamps, and a dashed rule.
 */
export function DossierHeader({
  path,
  title,
  subtitle,
  stamps,
  right,
}: {
  path: string;
  title: string;
  subtitle?: string;
  stamps?: ReactNode;
  right?: ReactNode;
}) {
  const clock = useClock();
  return (
    <header className="mb-8">
      <div className="mb-5 flex items-center justify-between border-b border-dashed border-ash pb-3 text-[11px] uppercase tracking-[0.18em] text-sur-muted">
        <span className="text-gold">SUR://{path}</span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
            devnet
          </span>
          <span className="tabular-nums">{clock}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-bone md:text-5xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[12px] text-sur-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stamps}
          {right}
        </div>
      </div>
    </header>
  );
}
