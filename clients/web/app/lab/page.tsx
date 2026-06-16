"use client";

/**
 * SPIKE / EXPERIMENT — "folders / dossier" theme for SUR.
 * Reference: the SAW site (terminal boot, sober, "open the portfolio").
 * Isolated at /lab — does NOT touch the real dashboard. Sample data, clearly
 * labelled as a prototype. If approved, we roll the language across the app.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const INK = "#0a0a0a";
const BONE = "#e8e4d8";
const GOLD = "#c9a96e";
const ASH = "#2a2a2a";
const RUST = "#b7410e";

const BOOT_LINES = [
  "establishing rpc link",
  "authenticating handler",
  "indexing markets",
  "decrypting positions",
  "compiling portfolio dossier",
];

const SAMPLE = {
  equity: "12,480.55",
  free: "3,200.00",
  upnl: "+842.10",
  positions: 3,
  rows: [
    { n: "I.", mkt: "SOL-PERP", long: true, size: "120.0000", entry: "172.40", margin: "1,200.00" },
    { n: "II.", mkt: "BTC-PERP", long: false, size: "0.8500", entry: "64,200.00", margin: "2,100.00" },
    { n: "III.", mkt: "ETH-PERP", long: true, size: "4.2000", entry: "3,410.00", margin: "900.00" },
  ],
  markets: [
    { sym: "SOL-PERP", mark: "172.40", oiL: "48,210", oiS: "39,884" },
    { sym: "BTC-PERP", mark: "64,200.00", oiL: "812.4", oiS: "905.1" },
    { sym: "ETH-PERP", mark: "3,410.00", oiL: "11,240", oiS: "9,870" },
  ],
};

function useClock() {
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

function Leader() {
  return (
    <span
      aria-hidden
      className="mx-3 flex-1 self-end border-b border-dotted"
      style={{ borderColor: "#4a4636", marginBottom: 4 }}
    />
  );
}

function Stamp({ children, tone = GOLD }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]"
      style={{ border: `1px solid ${tone}`, color: tone }}
    >
      {children}
    </span>
  );
}

export default function LabPage() {
  const [phase, setPhase] = useState<"boot" | "open">("boot");
  const [step, setStep] = useState(0);
  const clock = useClock();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(BOOT_LINES.length);
      setPhase("open");
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= BOOT_LINES.length) {
        clearInterval(id);
        setTimeout(() => setPhase("open"), 480);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="lab-scan lab-grain min-h-screen font-mono"
      style={{ background: INK, color: BONE }}
    >
      {/* ===== BOOT OVERLAY ===== */}
      {phase === "boot" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: INK }}
        >
          <div className="w-full max-w-xl text-[13px] leading-relaxed">
            <div className="mb-5" style={{ color: GOLD }}>
              SUR://portfolio_console <span style={{ color: BONE }}>— solana devnet</span>
            </div>
            {BOOT_LINES.map((line, i) => (
              <div
                key={line}
                className="flex items-baseline"
                style={{ opacity: i < step ? 1 : 0.15, transition: "opacity .15s" }}
              >
                <span style={{ color: BONE }}>{line}</span>
                <Leader />
                <span style={{ color: i < step ? GOLD : ASH }}>
                  {i < step ? "ok" : "··"}
                </span>
              </div>
            ))}
            <div className="mt-5" style={{ color: BONE }}>
              {step >= BOOT_LINES.length ? "opening portfolio" : "scanning"}
              <span className="lab-cursor" style={{ color: GOLD }}>
                _
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ===== DOSSIER ===== */}
      {phase === "open" && (
        <div className="lab-reveal mx-auto max-w-5xl px-5 py-8 md:px-8">
          {/* status bar */}
          <div
            className="mb-7 flex items-center justify-between border-b border-dashed pb-3 text-[11px] uppercase tracking-[0.18em]"
            style={{ borderColor: ASH, color: "#8a8678" }}
          >
            <span style={{ color: GOLD }}>SUR://portfolio_console</span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: GOLD }}
                />
                devnet
              </span>
              <span>{clock}</span>
              <span className="hidden sm:inline">read-only</span>
            </span>
          </div>

          {/* folder tab + cover */}
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 border border-b-0 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em]"
              style={{ borderColor: GOLD, color: GOLD, background: "#12110d" }}
            >
              ▸ Portfolio
            </div>
            <div
              className="border border-dashed p-6 md:p-8"
              style={{ borderColor: GOLD }}
            >
              {/* cover heading */}
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1
                    className="text-3xl md:text-5xl tracking-tight"
                    style={{ fontFamily: "Georgia, ui-serif, serif", color: BONE }}
                  >
                    Portfolio Dossier
                  </h1>
                  <p className="mt-1 text-[12px]" style={{ color: "#8a8678" }}>
                    handler · {clock} · solana devnet
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Stamp>Devnet // 2026</Stamp>
                  <Stamp tone={RUST}>Prototype</Stamp>
                  <Stamp tone="#8a8678">Sample data</Stamp>
                </div>
              </div>

              {/* summary sheet */}
              <div
                className="grid grid-cols-2 border border-dashed md:grid-cols-4"
                style={{ borderColor: ASH }}
              >
                {[
                  { k: "Total equity", v: `$${SAMPLE.equity}`, tone: BONE },
                  { k: "Free balance", v: `$${SAMPLE.free}`, tone: BONE },
                  { k: "Unrealized PnL", v: `$${SAMPLE.upnl}`, tone: GOLD },
                  { k: "Open positions", v: String(SAMPLE.positions), tone: BONE },
                ].map((s, i) => (
                  <div
                    key={s.k}
                    className="border-dashed p-4"
                    style={{
                      borderColor: ASH,
                      borderRightWidth: i < 3 ? 1 : 0,
                    }}
                  >
                    <div
                      className="text-[10px] uppercase tracking-[0.18em]"
                      style={{ color: "#8a8678" }}
                    >
                      {s.k}
                    </div>
                    <div className="mt-1.5 text-xl tabular-nums" style={{ color: s.tone }}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>

              {/* positions as case files */}
              <div className="mt-8">
                <div
                  className="mb-3 text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: GOLD }}
                >
                  // open positions
                </div>
                <div className="border border-dashed" style={{ borderColor: ASH }}>
                  {SAMPLE.rows.map((r, i) => (
                    <div
                      key={r.mkt}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]"
                      style={{
                        borderTop: i === 0 ? "none" : `1px dashed ${ASH}`,
                      }}
                    >
                      <span style={{ color: GOLD }}>{r.n}</span>
                      <span className="w-24" style={{ color: BONE }}>
                        {r.mkt}
                      </span>
                      <span
                        className="text-[11px] uppercase tracking-widest"
                        style={{ color: r.long ? GOLD : RUST }}
                      >
                        {r.long ? "long" : "short"}
                      </span>
                      <Leader />
                      <span className="tabular-nums" style={{ color: "#8a8678" }}>
                        {r.size}
                      </span>
                      <span className="tabular-nums" style={{ color: "#8a8678" }}>
                        @ ${r.entry}
                      </span>
                      <span className="tabular-nums" style={{ color: BONE }}>
                        ${r.margin}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* markets ledger */}
              <div className="mt-8">
                <div
                  className="mb-3 text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: GOLD }}
                >
                  // markets ledger
                </div>
                <div className="border border-dashed" style={{ borderColor: ASH }}>
                  <div
                    className="grid grid-cols-4 px-4 py-2 text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: "#8a8678", borderBottom: `1px dashed ${ASH}` }}
                  >
                    <span>Market</span>
                    <span className="text-right">Mark</span>
                    <span className="text-right">OI Long</span>
                    <span className="text-right">OI Short</span>
                  </div>
                  {SAMPLE.markets.map((m, i) => (
                    <div
                      key={m.sym}
                      className="grid grid-cols-4 px-4 py-2.5 text-[13px]"
                      style={{ borderTop: i === 0 ? "none" : `1px dashed ${ASH}` }}
                    >
                      <span style={{ color: BONE }}>{m.sym}</span>
                      <span className="text-right tabular-nums" style={{ color: BONE }}>
                        ${m.mark}
                      </span>
                      <span className="text-right tabular-nums" style={{ color: "#8a8678" }}>
                        {m.oiL}
                      </span>
                      <span className="text-right tabular-nums" style={{ color: "#8a8678" }}>
                        {m.oiS}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* footer */}
          <div
            className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-dashed pt-4 text-[10px] uppercase tracking-[0.2em]"
            style={{ borderColor: ASH, color: "#6f6c61" }}
          >
            <span>SUR // Solana Devnet // dossier compiled {clock}</span>
            <Link href="/" className="hover:underline" style={{ color: GOLD }}>
              ← back to /
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
