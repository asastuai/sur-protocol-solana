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
      <div>
        <div className="text-[10px] uppercase tracking-wider text-sur-muted mb-1">
          {label}
        </div>
        <div className="text-[11px] text-sur-muted italic">no args</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-sur-muted mb-1">
        {label}
      </div>
      <pre className="text-[11px] leading-relaxed font-mono text-sur-text bg-sur-bg/60 border border-sur-border rounded px-2 py-1.5 overflow-x-auto">
        {`{\n`}
        {fields.map((f, i) => (
          <span key={f.name}>
            {`  `}
            <span className="text-sur-accent">{f.name}</span>
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

const CATEGORY_BADGE: Record<ToolCategory, { label: string; cls: string }> = {
  read: {
    label: "read",
    cls: "bg-sur-green/15 text-sur-green border-sur-green/30",
  },
  write: {
    label: "write",
    cls: "bg-sur-yellow/15 text-sur-yellow border-sur-yellow/30",
  },
  intent: {
    label: "intent",
    cls: "bg-sur-accent/15 text-sur-accent border-sur-accent/30",
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
    <div className="bg-sur-surface border border-sur-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="font-mono text-[13px] font-semibold text-sur-text">
              {name}
            </code>
            <span
              className={cn(
                "px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border",
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded bg-sur-accent text-white hover:bg-sur-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          className="inline-flex items-center gap-1 text-[11px] text-sur-muted hover:text-sur-text transition-colors"
        >
          <BookOpen size={11} />
          SDK
        </a>
      </div>

      {(result || err) && (
        <div className="border-t border-sur-border pt-3">
          {err && (
            <div className="text-[11px] text-sur-red font-mono whitespace-pre-wrap break-words">
              {err}
            </div>
          )}
          {result && (
            <pre className="text-[11px] leading-relaxed font-mono text-sur-text bg-sur-bg/60 border border-sur-border rounded px-2 py-1.5 max-h-64 overflow-auto">
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
