"use client";

import { useState, useEffect } from "react";

interface Announcement {
  id: string;
  text: string;
  type: "info" | "warning" | "success" | "promo";
  link?: { label: string; href: string };
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "solana-devnet-2026",
    text: "SUR Protocol Solana port is live on devnet. Read paths wired; write paths pending Phase 9 init.",
    type: "promo",
    link: { label: "Open Trade", href: "/trade" },
  },
  {
    id: "risk-warning",
    text: "Trading perpetual futures involves substantial risk. Only trade with funds you can afford to lose.",
    type: "warning",
    link: { label: "Learn More", href: "/terms" },
  },
];

const STORAGE_KEY = "sur_dismissed_announcements";
const PROMO_ID = "solana-devnet-2026";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // intentional no-op — localStorage may be unavailable in privacy modes
  }
}

export function Announcements() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getDismissed();
    // The promo is a one-time notice: mark it seen as soon as it renders so
    // returning visitors never get it floating over content again. The user
    // can still dismiss it manually this session via the close button.
    if (!stored.has(PROMO_ID)) {
      const next = new Set(stored);
      next.add(PROMO_ID);
      saveDismissed(next);
    }
    setDismissed(stored);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const visible = ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const current = visible[0];

  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(current.id);
    setDismissed(next);
    saveDismissed(next);
  };

  const colors = {
    info: { bg: "bg-sur-accent/10", border: "border-sur-accent/20", text: "text-sur-accent", icon: "ℹ" },
    warning: { bg: "bg-sur-yellow/10", border: "border-sur-yellow/20", text: "text-sur-yellow", icon: "⚠" },
    success: { bg: "bg-sur-green/10", border: "border-sur-green/20", text: "text-sur-green", icon: "✓" },
    // promo: theme-var driven (sol-purple) so it stays on-brand and light-mode safe
    promo: { bg: "", border: "", text: "", icon: "★" },
  } as const;

  const c = colors[current.type];
  const isPromo = current.type === "promo";
  const promoStyle = isPromo
    ? {
        backgroundColor: "color-mix(in srgb, var(--sol-purple) 10%, transparent)",
        borderColor: "color-mix(in srgb, var(--sol-purple) 24%, transparent)",
        color: "var(--sol-purple)",
      }
    : undefined;
  const remaining = visible.length - 1;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
      <div
        className={`${c.bg} ${c.border} border rounded-lg shadow-2xl backdrop-blur-sm`}
        style={isPromo ? { backgroundColor: promoStyle!.backgroundColor, borderColor: promoStyle!.borderColor } : undefined}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="text-sm flex-shrink-0 mt-0.5">{c.icon}</span>

          <div className="flex-1 min-w-0">
            <p
              className={`text-xs ${c.text} leading-relaxed`}
              style={isPromo ? { color: promoStyle!.color } : undefined}
            >
              {current.text}
            </p>
            {current.link && (
              <a
                href={current.link.href}
                className={`text-[10px] ${c.text} font-semibold hover:underline mt-1 inline-block`}
                style={isPromo ? { color: promoStyle!.color } : undefined}
              >
                {current.link.label} &rarr;
              </a>
            )}
            {remaining > 0 && (
              <span className="text-[9px] text-sur-muted ml-2">+{remaining} more</span>
            )}
          </div>

          <button
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="text-sur-muted hover:text-sur-text transition-colors flex-shrink-0 p-0.5"
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
