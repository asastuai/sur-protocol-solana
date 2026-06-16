"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import "@solana/wallet-adapter-react-ui/styles.css";

// Backpack is detected automatically via the Wallet Standard registry,
// so no explicit adapter is needed (the @solana/wallet-adapter-backpack
// package was deprecated when Backpack moved to wallet-standard).
// Mirror the app theme onto sonner. The theme lives in the `data-theme`
// attribute on <html> (set by ThemeToggle + the inline boot script in
// layout.tsx, persisted under the `sur-theme` localStorage key). We read it
// on mount and watch the attribute so toasts follow theme changes without
// a custom event bus.
function useSurTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const read = (): "dark" | "light" =>
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";

    setTheme(read());

    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const toasterTheme = useSurTheme();
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  // One QueryClient per browser session — created lazily so it survives
  // HMR and never leaks between renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            gcTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            {children}
            <Toaster
              position="bottom-right"
              theme={toasterTheme}
              offset={16}
            />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
