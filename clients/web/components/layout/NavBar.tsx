"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WalletButton } from "@/components/layout/WalletButton";
import { SUR_GITHUB_URL, SUR_DOCS_URL } from "@/lib/constants";

type NavItem = { label: string; href: string };

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Trade", href: "/trade" },
  { label: "Markets", href: "/markets" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Vaults", href: "/vaults" },
  { label: "Agents", href: "/agents" },
  { label: "Dark Pool", href: "/darkpool" },
] as const;

const MORE_ITEMS: readonly (NavItem & { desc: string })[] = [
  { label: "Docs", href: "/docs", desc: "Protocol documentation" },
  { label: "Developers", href: "/developers", desc: "Agent SDK, API & MCP" },
  { label: "Support", href: "/support", desc: "FAQ & contact us" },
] as const;

/** True when `href` is the active section for the current pathname. */
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the "More" dropdown on outside click.
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile slide-down menu is open.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 border-b border-sur-border bg-sur-surface/70 backdrop-blur-md supports-[backdrop-filter]:bg-sur-surface/70"
    >
      {/* Left: hamburger + logo + primary nav */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          className="md:hidden p-2 -ml-2 mr-1 text-sur-muted hover:text-sur-text transition-colors"
        >
          {mobileMenuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>

        <Link
          href="/"
          aria-label="SUR Protocol home"
          className="flex items-center md:mr-6 mr-2 hover:opacity-90 transition-opacity"
        >
          <span className="font-mono font-bold text-sm tracking-wide text-sur-text">
            Sur <span className="text-gradient-solana">Protocol</span>
          </span>
        </Link>

        {NAV_ITEMS.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative hidden md:block px-3.5 py-2 text-[13px] font-medium rounded-md transition-colors ${
                active
                  ? "text-sur-text bg-sur-accent/10"
                  : "text-sur-muted hover:text-sur-text hover:bg-sur-border/40"
              }`}
            >
              {item.label}
              {active && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 right-3.5 -bottom-[7px] h-[2px] rounded-full"
                  style={{ background: "var(--sur-gradient)" }}
                />
              )}
            </Link>
          );
        })}

        {/* More dropdown (desktop) */}
        <div ref={moreRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-controls="more-dropdown"
            className={`px-3.5 py-2 text-[13px] font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              moreOpen
                ? "text-sur-text bg-sur-border/40"
                : "text-sur-muted hover:text-sur-text hover:bg-sur-border/40"
            }`}
          >
            More
            <ChevronDown
              size={13}
              aria-hidden
              className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>

          {moreOpen && (
            <div
              id="more-dropdown"
              role="menu"
              className="absolute top-full left-0 mt-2 min-w-[230px] py-1.5 rounded-lg border border-sur-border bg-sur-surface/95 backdrop-blur-md shadow-2xl z-50 animate-fade-in"
            >
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col px-4 py-2.5 hover:bg-sur-border/40 transition-colors"
                >
                  <span className="text-[13px] font-medium text-sur-text">{item.label}</span>
                  <span className="text-[11px] text-sur-muted">{item.desc}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          className="absolute top-full left-0 right-0 md:hidden z-50 border-b border-sur-border bg-sur-surface/95 backdrop-blur-md shadow-2xl animate-fade-in max-h-[75vh] overflow-y-auto"
        >
          <div className="py-2">
            {NAV_ITEMS.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-5 py-3 text-[13px] font-medium transition-colors ${
                    active
                      ? "text-sur-accent bg-sur-accent/5 border-l-2 border-sur-accent"
                      : "text-sur-text hover:bg-sur-border/40 border-l-2 border-transparent"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="border-t border-sur-border my-1.5" />

            {MORE_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-baseline gap-2 px-5 py-2.5 hover:bg-sur-border/40 transition-colors"
              >
                <span className="text-[13px] font-medium text-sur-text">{item.label}</span>
                <span className="text-[11px] text-sur-muted">{item.desc}</span>
              </Link>
            ))}

            <div className="border-t border-sur-border my-1.5" />

            <a
              href={SUR_GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-sur-text hover:bg-sur-border/40 transition-colors"
            >
              <Github size={14} aria-hidden />
              GitHub
            </a>
          </div>
        </div>
      )}

      {/* Right: Docs link + GitHub + theme + wallet */}
      <div className="flex items-center gap-2">
        <Link
          href={SUR_DOCS_URL}
          className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-md text-[13px] font-medium text-sur-muted hover:text-sur-text hover:bg-sur-border/40 transition-colors"
        >
          Docs
        </Link>
        <a
          href={SUR_GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="SUR Protocol on GitHub (opens in new tab)"
          title="GitHub"
          className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-md text-sur-muted hover:text-sur-text hover:bg-sur-border/40 transition-colors"
        >
          <Github size={16} aria-hidden />
        </a>
        <ThemeToggle />
        <WalletButton />
      </div>
    </nav>
  );
}
