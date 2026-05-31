import { cn } from "@/lib/cn";

interface SolanaBadgeProps {
  className?: string;
  /** Render only the wordmark without the "Powered by" prefix. */
  compact?: boolean;
}

/**
 * Small "Powered by Solana" pill. The "Solana" wordmark uses the official
 * Solana brand gradient (#9945FF -> #14F195) as clipped text, framed by a
 * subtle gradient-tinted border.
 */
export function SolanaBadge({ className, compact = false }: SolanaBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-sur-surface-2 px-2.5 py-1 text-[11px] font-medium",
        className,
      )}
    >
      {!compact && <span className="text-sur-muted">Powered by</span>}
      <span
        className="bg-clip-text font-semibold text-transparent"
        style={{
          backgroundImage: "linear-gradient(135deg, #9945FF, #14F195)",
        }}
      >
        Solana
      </span>
    </span>
  );
}
