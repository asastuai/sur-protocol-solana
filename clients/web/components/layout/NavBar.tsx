"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WalletButton } from "./WalletButton";

const NAV_ITEMS = [
  { label: "Trade", href: "/trade" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Agents", href: "/agents" },
  { label: "Dark Pool", href: "/darkpool" },
  { label: "Dashboard", href: "/dashboard" },
] as const;

const MORE_ITEMS = [
  { label: "Docs", href: "/docs", desc: "Protocol documentation" },
  { label: "Support", href: "/support", desc: "FAQ & contact" },
  { label: "Privacy", href: "/privacy", desc: "Privacy policy" },
  { label: "Terms", href: "/terms", desc: "Terms of service" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const tab =
    "px-3.5 py-1.5 text-[11px] uppercase tracking-[0.16em] border transition-colors";

  return (
    <nav
      aria-label="Main navigation"
      className="relative flex h-12 flex-shrink-0 items-center justify-between border-b border-dashed border-ash bg-ink px-4 font-mono"
    >
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          className="-ml-2 mr-1 p-2 text-sur-muted hover:text-bone md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {mobileMenuOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            ) : (
              <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
            )}
          </svg>
        </button>

        <Link href="/" className="mr-4 flex items-center hover:opacity-90">
          <span className="text-[13px] font-bold tracking-[0.18em] text-gold">
            SUR<span className="text-bone">://</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${tab} ${
                  active
                    ? "border-gold bg-smoke text-bone"
                    : "border-transparent text-sur-muted hover:border-ash hover:text-bone"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              aria-expanded={moreOpen}
              aria-haspopup="true"
              className={`${tab} flex items-center gap-1.5 ${
                moreOpen ? "border-ash text-bone" : "border-transparent text-sur-muted hover:border-ash hover:text-bone"
              }`}
            >
              More
              <svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true" className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}>
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {moreOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 min-w-[230px] border border-dashed border-ash bg-smoke py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col px-4 py-2.5 hover:bg-ink"
                  >
                    <span className="text-[12px] uppercase tracking-[0.12em] text-bone">{item.label}</span>
                    <span className="text-[10px] text-sur-muted">{item.desc}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div id="mobile-menu" className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto border-b border-dashed border-ash bg-smoke md:hidden">
          <div className="py-2">
            {[...NAV_ITEMS, ...MORE_ITEMS].map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-5 py-3 text-[12px] uppercase tracking-[0.12em] ${
                    active ? "text-gold" : "text-bone hover:bg-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <span
          title="Solana devnet — programs deployed, uninitialized until Phase 9"
          className="hidden items-center gap-1.5 border border-gold/50 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-gold sm:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gold live-dot" />
          Devnet
        </span>
        <ThemeToggle />
        <WalletButton />
      </div>
    </nav>
  );
}
