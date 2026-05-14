import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy policy for SUR Protocol on Solana devnet.",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
