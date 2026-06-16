import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — Not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-ink px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-gold">
          // 404
        </div>
        <div className="border border-dashed border-ash bg-smoke p-8 md:p-10">
          <h1 className="font-display text-4xl tracking-tight text-bone md:text-5xl">
            File not found
          </h1>
          <p className="mt-4 text-sm text-sur-muted">
            This record does not exist in the SUR dossier, or it has been moved.
          </p>
          <div className="mt-6 flex items-center justify-between border-t border-dashed border-ash pt-4 text-[11px] uppercase tracking-[0.18em] text-sur-muted">
            <span className="text-gold">SUR://404</span>
            <Link
              href="/"
              className="inline-block border border-gold px-3 py-1.5 uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-ink"
            >
              Return to index
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
