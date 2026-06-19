# @sur/api — points / leaderboard / onboarding

Off-chain service for the SUR devnet beta: indexes on-chain trading events,
computes points, serves the leaderboard, and onboards (whitelists) wallets.

> **Status: build-ahead.** Scaffolded but not yet runnable end-to-end — it needs
> (1) the SUR programs re-deployed on devnet (blocked on SBPFv3 activation, see
> `../../scripts/check-sbpfv3.sh`), (2) a Postgres/Supabase `DATABASE_URL`, and
> (3) `npm install`. Design: `../../docs/POINTS-SYSTEM.md`.

## Layout

```
db/schema.sql      Postgres schema (raw_events, trades, liquidations,
                   wallets, epochs, points_ledger, leaderboard view)
src/config.ts      env + program ids (fresh re-deploy ids)
src/db.ts          pg pool
src/indexer.ts     getSignaturesForAddress + EventParser -> raw_events + projections
src/points.ts      deterministic per-epoch recompute (capped net-PnL formula)
src/server.ts      GET /leaderboard /points/:wallet /epochs ; POST /beta/signup
```

## Run (once unblocked)

```
cp .env.example .env   # fill DATABASE_URL, SOLANA_RPC_URL, ADMIN_SECRET_KEY, ...
npm install
npm run migrate        # apply db/schema.sql
npm run indexer        # poll + mirror events
npm run points <id>    # recompute an epoch
npm run dev            # API server
```

## Principles

- `raw_events` + projections are write-once truth; `points_ledger` is
  append-only and a pure function of raw × `epochs.config` → recomputable,
  gaming retro-correctable.
- Anti-gaming for paper money: capped net realized PnL (not gross volume),
  survival, hold-time, sybil/wash clustering. Volume is vanity-only.
- Secrets (admin/relayer keys) in env only; devnet-only blast radius.
