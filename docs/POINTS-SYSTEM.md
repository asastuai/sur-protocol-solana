# SUR Devnet Points System — Design

> Status: **build-ahead.** The off-chain stack below is being built while the
> on-chain re-deploy is blocked on devnet's SBPFv3 activation (see
> `scripts/check-sbpfv3.sh`). It cannot be tested end-to-end until SUR programs
> are re-deployed and emitting events on devnet.

## Goal

Turn the SUR devnet beta into a growth engine: users **whitelist** their wallet
(get 5,000 fake USDC + gas), trade, and earn **points** from real trading
activity → **leaderboard** → (future) **genesis NFTs**. Aster-shaped, but
hardened for a paper-money devnet where wash/sybil cost ~zero.

## Core principle (anti-gaming)

With free, infinite paper USDC, every metric a real exchange trusts (gross
volume, gross PnL, fees, TVL) is trivially farmable. The only genuinely scarce
resources are **time, distinct human identity, and counterparty diversity** —
points must be priced in those.

- Points = **capped, risk-adjusted NET realized PnL + survival + hold-time +
  diversity**. Gross volume is a Tier-1 *vanity* metric only, never gates NFTs.
- All coefficients live in `epochs.config` (jsonb), never hardcoded → the
  `points_ledger` is a pure, recomputable function of `raw_events × config`, so
  the formula is tunable and gaming is retro-correctable.

### Earn signals (from on-chain events SUR already emits)

| Signal | Source event | Weighting | Gaming risk |
|---|---|---|---|
| Net realized PnL (capped) | `PositionClosed/Modified.realized_pnl` | primary, per-wallet cap | HIGH → cap + sybil graph |
| Risk-adjusted / survival | PnL series + `CollateralLiquidated`/`BadDebt` | multiplier | MED |
| Hold-time (≥10–15 min) | tx blockTime + `MarkPriceUpdated` | gate + small bonus | LOW-MED |
| Active days / diversity | trades projection, dust-filtered | gate + modest | LOW |
| Liquidations (self-liq penalty) | `CollateralLiquidated`/`BadDebt` | down-weight | MED |
| Gross volume | `PositionOpened`, CLOB `TradeSettled` | **Tier-1 vanity only** | MAXIMAL |
| Referrals (capped) | off-chain table | small, per verified identity | HIGH → cap |

Grounded caveats: no funding program (drop funding); fees/counterparty only on
the CLOB `order_settlement` path (down-weight operator-direct trades until CLOB
is the route); drop `A2ATradeSettled` co-emitted with `SettlementPreviewMode`;
victim attribution from perp_engine/collateral_manager, never
`liquidator::LiquidationExecuted.trader` (= default pubkey).

## Two-tier reward posture

- **Tier-1 public leaderboard** — farming-tolerant, includes vanity volume/PnL,
  for marketing reach.
- **Tier-2 genesis-eligible set** — separate conservative computation: full
  sybil/wash filter, manual review of the top-N, biased to false-negatives.
  Only this set gates any NFT. Confidential weights, clawback via append-only
  ledger rows.

## NFT (future, do NOT announce at launch)

Run ≥1 hardened season collecting attacker data → reproducible event-derived
snapshot at a pinned slot (PnL is in-event, so re-derivable = credibility
anchor) → sybil filter → percentile tiers → **Metaplex Core soulbound** via
Merkle claim. Only firmly-promised utility: mainnet allowlist.

## Architecture (`clients/api`, shares the onboarding service)

```
indexer   getSignaturesForAddress(programId) + getTransaction + Anchor EventParser
            -> raw_events (immutable) + typed projections (trades, liquidations)
db        Postgres/Supabase. raw_events WRITE-ONCE; points_ledger APPEND-ONLY
            (per-epoch, basis audit, formula_version); epochs.config jsonb
points    deterministic per-epoch recompute: DELETE+reINSERT from raw × config
api       GET /leaderboard, /points/:wallet, /epochs  +  onboarding routes
onboard   POST /beta/signup -> setOperator(wallet) + 5k USDC mint + gas SOL
            (deployer key in env only; reuses register-operator + transfer-test-usdc)
web       /beta gate, /leaderboard page, points widget
```

Deploy: Railway (api + indexer worker + points-cron) + Supabase. Secrets in env
only (`ADMIN_SECRET_KEY` asserted == deployer at boot). Index BY PROGRAM ID, not
by wallet (trades are operator-signed). Cursor advances last (crash-safe),
idempotent on `(signature, event_index)`.

## Decisions (locked with Juan)

1. Operator gate → **backend relayer with a dedicated operator key** (not the deployer).
2. Formula → **net-PnL capped + risk-adjusted + survival**, volume = vanity only.
3. Two tiers (public vanity vs sybil-filtered genesis). 4. NFT announced **late**.
5. Points engine **off-chain** (Postgres, recomputable). 6. Epochs **weekly**, seasons ~8–12w.

## First milestone (when deploy unblocks)

indexer (perp_engine only) + minimal points engine (capped net PnL − self-liq,
hold-time gate, dust filter) + `GET /leaderboard` + web `/leaderboard`. No
onboarding/NFT/full-sybil yet. Recomputable from immutable `raw_events`.
