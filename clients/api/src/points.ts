/**
 * Points engine — deterministic per-epoch recompute.
 *
 * points_ledger = pure function of (raw projections x epochs.config x formula_version).
 * Recompute = DELETE this epoch's rows for the formula_version, then re-INSERT.
 * That makes the formula tunable and farming retro-correctable.
 *
 * Anti-gaming (paper money): reward CAPPED net realized PnL, not gross volume;
 * multiply by survival; gate on min hold-time + min notional; penalize
 * self-liquidation; down-weight operator-direct (non-CLOB) trades. Sybil/wash
 * clustering runs as a separate pass writing sybil_clawback rows.
 */
import { db } from "./db.js";

export interface EpochConfig {
  w_net_pnl: number;
  pnl_cap: number; // per-wallet per-epoch cap on net PnL points (e.g. a few x 5000 start)
  w_survival: number;
  w_hold: number;
  min_hold_secs: number; // e.g. 600–900
  w_diversity: number;
  min_notional: number; // dust filter
  self_liq_penalty: number;
  operator_direct_weight: number; // <1, down-weight direct path until CLOB live
}

export const DEFAULT_CONFIG: EpochConfig = {
  w_net_pnl: 1,
  pnl_cap: 20_000,
  w_survival: 0.5,
  w_hold: 0.2,
  min_hold_secs: 600,
  w_diversity: 0.3,
  min_notional: 10,
  self_liq_penalty: 0.5,
  operator_direct_weight: 0.25,
};

/** Saturating diminishing-returns cap: bounds any single wallet's PnL points. */
export function fCap(netPnl: number, cap: number): number {
  if (netPnl <= 0) return 0;
  // smooth saturation toward `cap`
  return cap * (1 - Math.exp(-netPnl / cap));
}

/**
 * Recompute one epoch's ledger. BUILD-AHEAD: reads the `trades`/`liquidations`
 * projections the indexer fills; runnable once real devnet trades exist.
 */
export async function recomputeEpoch(epochId: number) {
  const ep = await db.query("select * from epochs where id = $1", [epochId]);
  if (ep.rows.length === 0) throw new Error(`epoch ${epochId} not found`);
  const cfg: EpochConfig = { ...DEFAULT_CONFIG, ...(ep.rows[0].config ?? {}) };
  const fv: string = ep.rows[0].formula_version;
  const { starts_at, ends_at } = ep.rows[0];

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from points_ledger where epoch_id = $1 and formula_version = $2",
      [epochId, fv],
    );

    // Per-wallet net realized PnL in window (operator-direct down-weighted),
    // dust-filtered, hold-time gated. (Hold-time pairing is done in the
    // projection step; here we sum eligible realized_pnl.)
    const rows = await client.query(
      `select wallet,
              sum(coalesce(realized_pnl,0) *
                  case when operator_direct then $3 else 1 end) as net_pnl
         from trades
        where kind in ('close','modify')
          and block_time >= $1 and block_time < $2
          and abs(coalesce(notional,0)) >= $4
        group by wallet`,
      [starts_at, ends_at, cfg.operator_direct_weight, cfg.min_notional],
    );

    for (const r of rows.rows) {
      const pts = cfg.w_net_pnl * fCap(Number(r.net_pnl), cfg.pnl_cap);
      if (pts <= 0) continue;
      await client.query(
        `insert into points_ledger(epoch_id, wallet, category, points, tier, formula_version, basis)
         values ($1,$2,'net_pnl',$3,'eligible',$4,$5)`,
        [epochId, r.wallet, pts, fv, JSON.stringify({ net_pnl: r.net_pnl, cap: cfg.pnl_cap })],
      );
    }

    // self-liquidation penalty
    await client.query(
      `insert into points_ledger(epoch_id, wallet, category, points, tier, formula_version, basis)
       select $1, wallet, 'self_liq', -$2 * count(*), 'eligible', $3,
              jsonb_build_object('liquidations', count(*))
         from liquidations
        where block_time >= $4 and block_time < $5
        group by wallet`,
      [epochId, cfg.self_liq_penalty, fv, starts_at, ends_at],
    );

    // TODO(next): survival multiplier, hold-time bonus, diversity, sybil clawback pass.
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = Number(process.argv[2] ?? 0);
  recomputeEpoch(id).then(() => {
    console.log(`recomputed epoch ${id}`);
    process.exit(0);
  });
}
