"use client";

// ============================================================
//      INDICATOR SETTINGS — per-instance param popover (presentational)
// ============================================================
// Given an active indicator instance + its IndicatorDef, renders one numeric
// input per ParamSpec and edits the params LIVE (calls onChange with the full
// updated map on every keystroke). A small close button + outside-click close.
// Owns no chart logic — the parent recomputes when params change.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { IndicatorDef } from "@/lib/chart-indicators";

export function IndicatorSettings({
  def,
  params,
  onChange,
  onClose,
}: {
  def: IndicatorDef;
  params: Record<string, number>;
  onChange: (params: Record<string, number>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click closes (same pattern as the menu / NavBar "More").
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-sur-border bg-sur-surface/95 backdrop-blur-md shadow-2xl animate-fade-in"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-sur-border">
        <span className="text-[10px] font-semibold text-sur-text">{def.label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="text-sur-muted hover:text-sur-text transition-colors"
        >
          <X size={12} aria-hidden />
        </button>
      </div>

      {def.params.length === 0 ? (
        <div className="px-2.5 py-2 text-[10px] text-sur-muted">Sin parámetros</div>
      ) : (
        <div className="flex flex-col gap-1.5 p-2.5">
          {def.params.map((p) => (
            <label key={p.key} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-sur-muted">{p.label}</span>
              <input
                type="number"
                value={params[p.key]}
                min={p.min}
                max={p.max}
                step={p.step}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return; // ignore empty / non-numeric
                  onChange({ ...params, [p.key]: v });
                }}
                className="w-16 rounded border border-sur-border bg-sur-surface px-1.5 py-0.5 text-right font-mono text-[10px] text-sur-text focus:border-sur-accent focus:outline-none"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default IndicatorSettings;
