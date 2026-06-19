-- SUR points/leaderboard schema (Postgres / Supabase).
-- raw_events + projections are WRITE-ONCE truth; points_ledger is APPEND-ONLY
-- and a pure function of (raw_events x epochs.config x formula_version), so the
-- whole ledger can be dropped+recomputed and gaming retro-corrected.

-- ── indexer state ────────────────────────────────────────────────────────────
create table if not exists indexer_cursor (
  program_id      text primary key,
  last_signature  text,
  last_slot       bigint,
  updated_at      timestamptz not null default now()
);

-- immutable mirror of every decoded program event
create table if not exists raw_events (
  signature    text        not null,
  event_index  int         not null,
  program_id   text        not null,
  event_name   text        not null,
  slot         bigint      not null,
  block_time   timestamptz,
  payload      jsonb       not null,
  is_preview   boolean     not null default false,  -- a2a SettlementPreviewMode etc.
  ingested_at  timestamptz not null default now(),
  primary key (signature, event_index)
);
create index if not exists raw_events_program_time on raw_events (program_id, block_time);
create index if not exists raw_events_name on raw_events (event_name);

-- ── typed projections (still raw truth, derived from raw_events) ──────────────
create table if not exists trades (
  signature     text        not null,
  event_index   int         not null,
  wallet        text        not null,           -- trader (position owner)
  market        text        not null,
  side          text,                            -- long|short
  kind          text        not null,            -- open|modify|close
  size          numeric,                          -- base units (8 dp)
  price         numeric,                          -- price units (6 dp)
  notional      numeric,                          -- size*price, USDC
  realized_pnl  numeric,                          -- USDC, null on open
  operator_direct boolean not null default true,  -- true = perp_engine direct (down-weight)
  block_time    timestamptz,
  primary key (signature, event_index)
);
create index if not exists trades_wallet_time on trades (wallet, block_time);

create table if not exists liquidations (
  signature    text not null,
  event_index  int  not null,
  wallet       text not null,                     -- victim
  market       text,
  bad_debt     boolean not null default false,
  block_time   timestamptz,
  primary key (signature, event_index)
);
create index if not exists liquidations_wallet on liquidations (wallet);

-- point-in-time account state (polled, gappy — NOT used for eligibility)
create table if not exists positions_snapshots (
  wallet            text not null,
  taken_at          timestamptz not null default now(),
  open_count        int,
  unrealized_pnl    numeric,
  equity            numeric,
  primary key (wallet, taken_at)
);

-- ── identity / onboarding / sybil signals ────────────────────────────────────
create table if not exists wallets (
  wallet         text primary key,
  whitelisted_at timestamptz,
  signup_ip_hash text,                            -- sha256(salt+ip), never raw
  fingerprint    text,
  referred_by    text,
  cluster_id     text,                            -- sybil cluster grouping
  sybil_score    numeric not null default 0,
  banned         boolean not null default false,
  onboard_sigs   jsonb,                           -- {sol, usdc, operator} tx sigs
  created_at     timestamptz not null default now()
);

-- ── epochs (config holds ALL tunable coefficients) ───────────────────────────
create table if not exists epochs (
  id              int primary key,                -- weekly index
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  formula_version text not null,
  config          jsonb not null,                 -- weights, caps, T, min-notional, ...
  settled         boolean not null default false  -- authoritative after sybil pass
);

-- ── append-only points ledger (recomputable) ────────────────────────────────
create table if not exists points_ledger (
  id              bigserial primary key,
  epoch_id        int not null references epochs(id),
  wallet          text not null,
  category        text not null,                  -- net_pnl|survival|hold|diversity|self_liq|referral|sybil_clawback
  points          numeric not null,
  tier            text not null default 'eligible', -- eligible(Tier-2) | vanity(Tier-1)
  formula_version text not null,
  basis           jsonb,                          -- which sigs/caps/multipliers produced this
  created_at      timestamptz not null default now()
);
create index if not exists points_ledger_epoch_wallet on points_ledger (epoch_id, wallet);

-- ── leaderboard (materialized, refreshed hourly / at epoch close) ────────────
create materialized view if not exists leaderboard as
  select
    pl.wallet,
    sum(pl.points) filter (where pl.tier = 'eligible') as eligible_points,
    sum(pl.points) filter (where pl.tier = 'vanity')   as vanity_points,
    sum(pl.points)                                      as total_points
  from points_ledger pl
  join wallets w on w.wallet = pl.wallet
  where not w.banned
  group by pl.wallet
  order by total_points desc;
-- create unique index leaderboard_wallet on leaderboard (wallet);  -- for REFRESH CONCURRENTLY
