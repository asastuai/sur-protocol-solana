import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "FAQ and contact for SUR Protocol on Solana devnet.",
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
