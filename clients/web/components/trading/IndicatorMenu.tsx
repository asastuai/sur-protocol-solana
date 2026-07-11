"use client";

// ============================================================
//        INDICATOR MENU — "Indicadores" dropdown (presentational)
// ============================================================
// A pure dropdown: a pill button that opens a grouped list of every available
// indicator (overlays under "Superpuestos", oscillators under "Osciladores").
// Clicking a row calls `onAdd(type)`. The menu stays OPEN after adding so the
// user can stack several. Outside-click closes it (same pattern as NavBar's
// "More" dropdown). It owns no indicator state — the parent does.

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { INDICATOR_LIST, type IndicatorDef } from "@/lib/chart-indicators";

const OVERLAYS = INDICATOR_LIST.filter((d) => d.category === "overlay");
const OSCILLATORS = INDICATOR_LIST.filter((d) => d.category === "oscillator");

export function IndicatorMenu({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (mirror NavBar's "More" dropdown).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "px-2 py-0.5 text-[11px] rounded font-medium transition-colors flex items-center gap-1",
          open
            ? "bg-sur-accent/15 text-sur-accent"
            : "text-sur-muted hover:text-sur-text",
        )}
      >
        Indicadores
        <ChevronDown
          size={11}
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 min-w-[200px] py-1 rounded-lg border border-sur-border bg-sur-surface/95 backdrop-blur-md shadow-2xl z-50 animate-fade-in"
        >
          <MenuGroup title="Superpuestos" defs={OVERLAYS} onAdd={onAdd} />
          <div className="my-1 border-t border-sur-border" />
          <MenuGroup title="Osciladores" defs={OSCILLATORS} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

/** One labeled group of indicator rows. */
function MenuGroup({
  title,
  defs,
  onAdd,
}: {
  title: string;
  defs: IndicatorDef[];
  onAdd: (type: string) => void;
}) {
  return (
    <div>
      <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-sur-muted/70 select-none">
        {title}
      </div>
      {defs.map((def) => (
        <button
          key={def.type}
          type="button"
          role="menuitem"
          onClick={() => onAdd(def.type)} // keep the menu open — stack freely
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-sur-text hover:bg-sur-border/40 transition-colors"
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: def.plots[0]?.color }}
          />
          <span className="font-medium">{def.label}</span>
        </button>
      ))}
    </div>
  );
}

export default IndicatorMenu;
