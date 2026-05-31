import { cn } from "@/lib/cn";
import { PROGRAM_IDS, type ProgramName } from "@/lib/program-ids";
import { CopyAddress } from "@/components/ui/CopyAddress";

interface ProgramGridProps {
  className?: string;
}

// Human-readable labels for each on-chain program. Keys mirror PROGRAM_IDS.
const PROGRAM_LABELS: Record<ProgramName, string> = {
  a2a_darkpool: "A2A Darkpool",
  perp_vault: "Perp Vault",
  oracle_router: "Oracle Router",
  perp_engine: "Perp Engine",
  sur_timelock: "Timelock",
  liquidator: "Liquidator",
  insurance_fund: "Insurance Fund",
  auto_deleveraging: "Auto-Deleveraging",
  collateral_manager: "Collateral Manager",
  trading_vault: "Trading Vault",
  order_settlement: "Order Settlement",
};

/**
 * Renders all 11 SUR program IDs as a verifiable, copyable grid. Every entry
 * links to Solana Explorer so anyone can audit the deployed bytecode — this
 * is the trust surface for "the protocol is exactly what it claims to be".
 */
export function ProgramGrid({ className }: ProgramGridProps) {
  const entries = Object.entries(PROGRAM_IDS) as Array<
    [ProgramName, (typeof PROGRAM_IDS)[ProgramName]]
  >;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-sur-text">
          Programs on devnet — verifiable
        </h2>
        <span className="text-[11px] text-sur-muted">{entries.length} programs</span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, id]) => (
          <li
            key={name}
            className="flex flex-col gap-1.5 rounded-lg border border-sur-border bg-sur-surface p-3 transition-colors hover:border-white/15"
          >
            <span className="text-[12px] font-medium text-sur-text">
              {PROGRAM_LABELS[name]}
            </span>
            <CopyAddress address={id} chars={6} cluster="devnet" />
          </li>
        ))}
      </ul>
    </section>
  );
}
