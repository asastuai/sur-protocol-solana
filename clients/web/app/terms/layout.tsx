import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of service for SUR Protocol on Solana devnet.",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
