"use client";

import type { CSSProperties } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${className}`}
      style={style}
    />
  );
}

export function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <Skeleton className={`h-3 ${width}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-sur-surface border border-sur-border rounded-xl p-4 space-y-3">
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-2 w-20" />
    </div>
  );
}

export function SkeletonTable({ rows = 3, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3 border-b border-sur-border/30">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-3 ${c === 0 ? "w-20" : c === cols - 1 ? "w-16" : "w-14"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
