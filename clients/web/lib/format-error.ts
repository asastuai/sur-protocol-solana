// Centralized error-shape formatter for tx hook callers. Turns the raw
// errors thrown from anchor + web3.js into a `{ message, description }`
// pair that sonner can render cleanly.
//
// Common shapes we surface:
//   - "Wallet not connected" thrown manually by tx hooks
//   - SendTransactionError / SimulationError with a `logs` field — we
//     extract the Anchor error name when present
//   - AccountNotInitialized / not initialized — devnet pre-Phase-9
//   - Everything else: best-effort message + original toString as desc

export interface FormattedError {
  message: string;
  description?: string;
}

const ANCHOR_ERROR_RE = /AnchorError.*?Error Code:\s*([A-Za-z0-9_]+)/;
const PROGRAM_ERROR_RE = /Program log:\s*Error:\s*(.+)/;

function extractFromLogs(logs: readonly string[] | undefined): string | null {
  if (!logs || logs.length === 0) return null;
  for (const line of logs) {
    const a = line.match(ANCHOR_ERROR_RE);
    if (a) return a[1];
    const p = line.match(PROGRAM_ERROR_RE);
    if (p) return p[1].trim();
  }
  return null;
}

export function formatError(err: unknown): FormattedError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);

  // Wallet not connected — thrown explicitly by the tx hooks.
  if (/wallet not connected/i.test(raw)) {
    return {
      message: "Wallet not connected",
      description: "Connect a Solana wallet to continue.",
    };
  }

  // Account not initialized — current devnet state for SUR programs.
  if (/AccountNotInitialized|account.*not.*initialized/i.test(raw)) {
    return {
      message: "Devnet not initialized yet",
      description: "Phase 9 will run init from an admin wallet. Write operations will start landing after that.",
    };
  }

  // Solana SendTransactionError / SimulationError — surface logs if present.
  // err.logs is the standard shape on @solana/web3.js errors.
  const maybeLogs =
    err && typeof err === "object" && "logs" in err
      ? (err as { logs?: readonly string[] }).logs
      : undefined;
  const fromLogs = extractFromLogs(maybeLogs);

  if (/transaction simulation failed|simulation failed/i.test(raw)) {
    return {
      message: fromLogs ? `Simulation failed: ${fromLogs}` : "Simulation failed",
      description: fromLogs ? raw : undefined,
    };
  }

  if (fromLogs) {
    return { message: fromLogs, description: raw };
  }

  // User rejected wallet signature.
  if (/user rejected|user denied|reject(ed)?/i.test(raw)) {
    return {
      message: "Signature rejected",
      description: "You declined the wallet prompt.",
    };
  }

  return { message: raw.slice(0, 120) };
}
