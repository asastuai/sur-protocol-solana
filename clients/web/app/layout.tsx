import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/layout/NavBar";
import { Announcements } from "@/components/layout/Announcements";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { DevnetBanner } from "@/components/layout/DevnetBanner";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "SUR Protocol — Agent-native perpetuals on Solana",
    template: "%s · SUR Protocol",
  },
  description:
    "Agent-native perpetual futures on Solana. On-chain settlement, intent-based dark pool, persistent agent reputation. Live on devnet.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    type: "website",
    title: "SUR Protocol — Agent-native perpetuals on Solana",
    description:
      "Agent-native perpetual futures on Solana. On-chain settlement, intent-based dark pool, persistent agent reputation.",
    images: ["/og.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "SUR Protocol — Agent-native perpetuals on Solana",
    description:
      "Agent-native perpetual futures on Solana. On-chain settlement, intent-based dark pool, persistent agent reputation.",
    images: ["/og.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sur-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');document.documentElement.classList.remove('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-sur-accent focus:text-white focus:rounded focus:text-sm focus:font-semibold focus:outline-none"
        >
          Skip to main content
        </a>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <DevnetBanner />
            <NavBar />
            <ErrorBoundary fallbackPage="this page">
              <main id="main-content" className="flex-1 min-h-0" role="main">
                {children}
              </main>
            </ErrorBoundary>
            <Footer />
            <Announcements />
          </div>
        </Providers>
      </body>
    </html>
  );
}
