/**
 * Indexer — mirrors SUR program events into Postgres (raw_events + projections).
 *
 * Strategy (crash-safe, idempotent):
 *   for each program id:
 *     sigs = getSignaturesForAddress(programId, { until: cursor.last_signature })
 *     for each tx (oldest first): getTransaction -> Anchor EventParser over logs
 *       -> upsert raw_events on (signature, event_index)
 *       -> project into trades / liquidations
 *     advance indexer_cursor LAST (so a crash re-processes, never skips)
 *
 * NOT logsSubscribe as source of truth (drops on reconnect, no backfill).
 * Index BY PROGRAM ID — trades are operator-signed, so per-wallet scans miss them.
 *
 * BUILD-AHEAD: the event decode/projection below is scaffolded against the SUR
 * IDLs; it can only run once the programs are re-deployed and emitting events on
 * devnet (blocked on SBPFv3 activation — see scripts/check-sbpfv3.sh).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { config, PROGRAM_IDS } from "./config.js";
import { db } from "./db.js";

const conn = new Connection(config.rpcUrl, "confirmed");

// MANDATORY filter: drop a2a A2ATradeSettled co-emitted with SettlementPreviewMode.
function isPreview(events: { name: string }[]): boolean {
  return events.some((e) => e.name === "SettlementPreviewMode");
}

async function getCursor(programId: string): Promise<string | undefined> {
  const r = await db.query(
    "select last_signature from indexer_cursor where program_id = $1",
    [programId],
  );
  return r.rows[0]?.last_signature ?? undefined;
}

async function setCursor(programId: string, sig: string, slot: number) {
  await db.query(
    `insert into indexer_cursor(program_id, last_signature, last_slot, updated_at)
     values ($1,$2,$3, now())
     on conflict (program_id) do update set last_signature=$2, last_slot=$3, updated_at=now()`,
    [programId, sig, slot],
  );
}

export async function indexProgram(name: keyof typeof PROGRAM_IDS) {
  const programId = new PublicKey(PROGRAM_IDS[name]);
  const until = await getCursor(PROGRAM_IDS[name]);
  const sigs = await conn.getSignaturesForAddress(programId, { until }, "confirmed");
  if (sigs.length === 0) return 0;

  // oldest first so the cursor only moves forward over confirmed work
  for (const s of sigs.reverse()) {
    if (s.err) continue;
    // TODO(deploy): getTransaction(maxSupportedTransactionVersion:0) -> EventParser
    //   over tx.meta.logMessages with the vendored IDL, then:
    //   - upsert raw_events (signature, event_index, ...) with is_preview flag
    //   - project PositionOpened/Modified/Closed -> trades
    //   - project CollateralLiquidated/BadDebt -> liquidations
    await setCursor(PROGRAM_IDS[name], s.signature, s.slot);
  }
  return sigs.length;
}

export async function runIndexerOnce() {
  let total = 0;
  for (const name of Object.keys(PROGRAM_IDS) as (keyof typeof PROGRAM_IDS)[]) {
    total += await indexProgram(name);
  }
  return total;
}

// `npm run indexer` — poll loop
if (import.meta.url === `file://${process.argv[1]}`) {
  const tick = async () => {
    try {
      const n = await runIndexerOnce();
      if (n) console.log(`indexed ${n} signatures`);
    } catch (e) {
      console.error("indexer tick error:", e);
    }
  };
  void tick();
  setInterval(() => void tick(), 10_000);
}

export { isPreview };
