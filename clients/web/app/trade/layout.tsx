import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade",
  description: "Open and close perpetual positions on SUR Protocol — Solana devnet.",
};

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
