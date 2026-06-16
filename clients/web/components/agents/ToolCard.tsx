"use client";

import { useState } from "react";
import { Play, Lock, BookOpen } from "lucide-react";

import type { FieldSchema, ToolCategory } from "@/lib/mcp-tools";
import { cn } from "@/lib/cn";

interface Props {
  name: string;
  description: string;
  inputSchema: ReadonlyArray<FieldSchema>;
  outputSchema: ReadonlyArray<FieldSchema>;
  category: ToolCategory;
  /** Provided only for read tools — fires the equivalent on-chain read. */
  onTryIt?: () => Promise<unknown>;
}

function SchemaBlock({
  label,
  fields,
}: {
  label: string;
  fields: ReadonlyArray<FieldSchema>;
}) {
  if (fields.length === 0) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-sur-muted mb-1">
          {label}
        </div>
        <div className="text-[11px] text-sur-muted italic">no args</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-sur-muted mb-1">
        {label}
      </div>
      <pre className="text-[11px] leading-relaxed font-mono text-bone bg-ink border border-dashed border-ash px-2 py-1.5 overflow-x-auto">
        {`{\n`}
        {fields.map((f, i) => (
          <span key={f.name}>
            {`  `}
            <span className="text-gold">{f.name}</span>
            {`: `}
            <span className="text-sur-muted">{f.type}</span>
            {i < fields.length - 1 ? "," : ""}
            {f.note ? (
              <span className="text-sur-muted/70"> {`// ${f.note}`}</span>
            ) : null}
            {`\n`}
          </span>
        ))}
        {`}`}
      </pre>
    </div>
  );
}

// Match <Stamp> tones: gold (default) / rust / muted — square, dashed-free
// outline tags so the badges read as the same family as the rest of the kit.
const CATEGORY_BADGE: Record<ToolCategory, { label: string; cls: string }> = {
  read: {
    label: "read",
    cls: "border-gold text-gold",
  },
  write: {
    label: "write",
    cls: "border-rust text-rust",
  },
  intent: {
    label: "intent",
    cls: "border-sur-muted text-sur-muted",
  },
};

export function ToolCard({
  name,
  description,
  inputSchema,
  outputSchema,
  category,
  onTryIt,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleTry() {
    if (!onTryIt || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const out = await onTryIt();
      // Serialize BNs / PublicKeys via toString
      const json = JSON.stringify(
        out,
        (_k, v) => {
          if (v === null || v === undefined) return v;
          if (typeof v === "bigint") return v.toString();
          if (
            typeof v === "object" &&
            "toBase58" in (v as object) &&
            typeof (v as { toBase58: unknown }).toBase58 === "function"
          ) {
            return (v as { toBase58: () => string }).toBase58();
          }
          if (
            typeof v === "object" &&
            "toString" in (v as object) &&
            (v as { _bn?: unknown })._bn !== undefined
          ) {
            return (v as { toString: () => string }).toString();
          }
          return v;
        },
        2,
      );
      setResult(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const badge = CATEGORY_BADGE[category];

  return (
    <div className="border border-dashed border-ash bg-smoke p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="font-mono text-[13px] font-semibold text-bone break-all">
              {name}
            </code>
            <span
              className={cn(
                "px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] border",
                badge.cls,
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-[12px] text-sur-muted leading-snug">
            {description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SchemaBlock label="input" fields={inputSchema} />
        <SchemaBlock label="output" fields={outputSchema} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        {onTryIt ? (
          <button
            onClick={handleTry}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] border border-gold bg-gold text-ink hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play size={12} />
            {busy ? "Running…" : "Try it"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium text-sur-muted">
            <Lock size={11} />
            Requires signer
          </span>
        )}
        <a
          href="#connect-your-agent"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
        >
          <BookOpen size={11} />
          SDK
        </a>
      </div>

      {(result || err) && (
        <div className="border-t border-dashed border-ash pt-3">
          {err && (
            <div className="text-[11px] text-sur-red font-mono whitespace-pre-wrap break-words">
              {err}
            </div>
          )}
          {result && (
            <pre className="text-[11px] leading-relaxed font-mono text-bone bg-ink border border-dashed border-ash px-2 py-1.5 max-h-64 overflow-auto">
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
