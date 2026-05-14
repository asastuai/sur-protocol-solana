import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test Programs",
  description: "Raw program reads — diagnostic page for SUR Protocol on Solana devnet.",
};

export default function TestProgramsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
