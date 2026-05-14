import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "SUR Protocol devnet overview — markets, account, and on-chain reads.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
