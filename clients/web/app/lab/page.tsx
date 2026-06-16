"use client";

/**
 * SPIKE / EXPERIMENT — "folders / dossier" theme for SUR.
 * Reference: the SAW site (terminal boot, sober, "open the portfolio").
 * Isolated at /lab — does NOT touch the real dashboard. Sample data, clearly
 * labelled as a prototype. If approved, we roll the language across the app.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import { useClock, Stamp, Leader, DashedPanel } from "@/components/dossier/kit";

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
    <div className="lab-scan lab-grain min-h-screen overflow-x-hidden bg-ink font-mono text-bone">
      {/* ===== BOOT OVERLAY ===== */}
      {phase === "boot" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink px-6">
          <div className="w-full max-w-xl text-[13px] leading-relaxed">
            <div className="mb-5 text-gold">
              SUR://portfolio_console <span className="text-bone">— solana devnet</span>
            </div>
            {BOOT_LINES.map((line, i) => (
              <div
                key={line}
                className="flex items-baseline"
                style={{ opacity: i < step ? 1 : 0.15, transition: "opacity .15s" }}
              >
                <span className="text-bone">{line}</span>
                <Leader />
                <span className={i < step ? "text-gold" : "text-ash"}>
                  {i < step ? "ok" : "··"}
                </span>
              </div>
            ))}
            <div className="mt-5 text-bone">
              {step >= BOOT_LINES.length ? "opening portfolio" : "scanning"}
              <span className="lab-cursor text-gold">_</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== DOSSIER ===== */}
      {phase === "open" && (
        <div className="lab-reveal mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
          {/* status bar */}
          <div className="mb-7 flex items-center justify-between border-b border-dashed border-ash pb-3 text-[11px] uppercase tracking-[0.18em] text-sur-muted">
            <span className="text-gold">SUR://portfolio_console</span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
                devnet
              </span>
              <span>{clock}</span>
              <span className="hidden sm:inline">read-only</span>
            </span>
          </div>

          {/* folder tab + cover */}
          <DashedPanel title="Portfolio" bodyClassName="p-6 md:p-8">
            {/* cover heading */}
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl tracking-tight text-bone md:text-5xl">
                  Portfolio Dossier
                </h1>
                <p className="mt-1 text-[12px] text-sur-muted">
                  handler · {clock} · solana devnet
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Stamp>Devnet // 2026</Stamp>
                <Stamp tone="rust">Prototype</Stamp>
                <Stamp tone="muted">Sample data</Stamp>
              </div>
            </div>

            {/* summary sheet */}
            <div className="grid grid-cols-2 border border-dashed border-ash md:grid-cols-4">
              {[
                { k: "Total equity", v: `$${SAMPLE.equity}`, tone: "text-bone" },
                { k: "Free balance", v: `$${SAMPLE.free}`, tone: "text-bone" },
                { k: "Unrealized PnL", v: `$${SAMPLE.upnl}`, tone: "text-gold" },
                { k: "Open positions", v: String(SAMPLE.positions), tone: "text-bone" },
              ].map((s, i) => (
                <div
                  key={s.k}
                  className="border-dashed border-ash p-4"
                  style={{ borderRightWidth: i < 3 ? 1 : 0 }}
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                    {s.k}
                  </div>
                  <div className={`mt-1.5 text-xl tabular-nums ${s.tone}`}>
                    {s.v}
                  </div>
                </div>
              ))}
            </div>

            {/* positions as case files */}
            <div className="mt-8">
              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-gold">
                // open positions
              </div>
              <div className="border border-dashed border-ash">
                {SAMPLE.rows.map((r, i) => (
                  <div
                    key={r.mkt}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px] ${
                      i === 0 ? "" : "border-t border-dashed border-ash"
                    }`}
                  >
                    <span className="text-gold">{r.n}</span>
                    <span className="w-24 text-bone">{r.mkt}</span>
                    <span
                      className={`text-[11px] uppercase tracking-widest ${
                        r.long ? "text-gold" : "text-rust"
                      }`}
                    >
                      {r.long ? "long" : "short"}
                    </span>
                    <Leader />
                    <span className="tabular-nums text-sur-muted">{r.size}</span>
                    <span className="tabular-nums text-sur-muted">@ ${r.entry}</span>
                    <span className="tabular-nums text-bone">${r.margin}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* markets ledger */}
            <div className="mt-8">
              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-gold">
                // markets ledger
              </div>
              <div className="overflow-x-auto border border-dashed border-ash">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-4 border-b border-dashed border-ash px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-sur-muted">
                    <span>Market</span>
                    <span className="text-right">Mark</span>
                    <span className="text-right">OI Long</span>
                    <span className="text-right">OI Short</span>
                  </div>
                  {SAMPLE.markets.map((m, i) => (
                    <div
                      key={m.sym}
                      className={`grid grid-cols-4 px-4 py-2.5 text-[13px] ${
                        i === 0 ? "" : "border-t border-dashed border-ash"
                      }`}
                    >
                      <span className="text-bone">{m.sym}</span>
                      <span className="text-right tabular-nums text-bone">
                        ${m.mark}
                      </span>
                      <span className="text-right tabular-nums text-sur-muted">
                        {m.oiL}
                      </span>
                      <span className="text-right tabular-nums text-sur-muted">
                        {m.oiS}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DashedPanel>

          {/* footer */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ash pt-4 text-[10px] uppercase tracking-[0.2em] text-sur-muted/70">
            <span>SUR // Solana Devnet // dossier compiled {clock}</span>
            <Link href="/" className="text-gold hover:underline">
              ← back to /
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
