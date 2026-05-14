import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Your SUR Protocol balances, open positions, and trade history on Solana devnet.",
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
