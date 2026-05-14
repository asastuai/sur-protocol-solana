import { BN } from "@coral-xyz/anchor";

// On-chain precisions
export const PRICE_DECIMALS = 6;
export const SIZE_DECIMALS = 8;
export const USDC_DECIMALS = 6;

export function formatBN(
  n: BN | undefined | null,
  decimals: number,
  fractionDigits = 2,
): string {
  if (!n) return "—";
  const negative = n.isNeg();
  const abs = negative ? n.neg() : n;
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = abs.div(divisor).toString();
  const frac = abs.mod(divisor).toString().padStart(decimals, "0");
  const truncFrac = frac.slice(0, fractionDigits).padEnd(fractionDigits, "0");
  const out = fractionDigits > 0 ? `${whole}.${truncFrac}` : whole;
  return negative ? `-${out}` : out;
}

export function bnToNumber(n: BN | undefined | null, decimals: number): number {
  if (!n) return 0;
  // BN.toNumber blows up over 2^53. Go through string when too large.
  const s = formatBN(n, decimals, decimals);
  return parseFloat(s);
}

export function fmtUsd(n: number, fractionDigits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function fmtUsdSigned(n: number, fractionDigits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtUsd(n, fractionDigits)}`;
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtSize(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function fmtPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function truncatePubkey(pk: string, head = 4, tail = 4): string {
  if (pk.length <= head + tail + 1) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}
