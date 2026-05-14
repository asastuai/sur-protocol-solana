import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dark Pool",
  description: "Agent-to-agent OTC intent matching on SUR Protocol — Solana devnet.",
};

export default function DarkpoolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
