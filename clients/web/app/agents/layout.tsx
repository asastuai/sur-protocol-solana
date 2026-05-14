import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents",
  description: "Agent API — typed MCP tools for autonomous trading on SUR Protocol.",
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
