import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description: "SUR Protocol documentation — programs, hooks, intent flow, and devnet status.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
