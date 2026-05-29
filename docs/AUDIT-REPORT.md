# SUR Protocol (Solana) — Security Audit Report (Round 2, verified)

**Auditor:** Claude (Opus 4.8). Round 1 = 6 parallel review agents. Round 2 = 20 adversarial
verifiers (CRITICALs got 3 independent skeptics each) + 6 deep-sweep agents + synthesis.
**Date:** 2026-05-29 · **Target:** `v0.4.0-devnet` (commit `6829216`) · **Scope:** 11 Anchor
programs, ~13,273 LOC Rust. Methodology + threat model: `AUDIT-ROADMAP.md`.

> **Verdict: NOT safe to custody real funds / NOT mainnet-ready.** There is a **confirmed
> unprivileged fund-theft class** (C-1, and H-2 up-rated to CRITICAL by Round 2), rooted in a
> single systemic defect. Round 2 adversarial verification killed 6 Round-1 over-ratings (faithful
> ports / false positives) and **concentrated** the real danger into one tightly-related family of
> binding bugs plus a weak governance posture. All of it is fixable without a redesign.

---

## The one root cause (everything exploitable traces here)

**The perp_engine / perp_vault accounting layer has no canonical identity for the
trader / pool / recipient balance accounts.** Value-bearing accounts arrive via
`remaining_accounts` as unconstrained `UncheckedAccount`, and the callee only checks they are
*structurally* real PDAs — never that they are *the right ones*. Critically, the deep sweep found
that **`EngineConfig` stores no `engine_pool` pubkey at all**, so even the protocol's own margin
pool is caller-supplied and unverifiable. Combined with a permissionless entry point
(`a2a_darkpool.accept_and_settle`) that signs the vault CPI as a registered operator PDA, an
unprivileged attacker becomes a confused deputy that debits or redirects any victim's deposit.

Every CRITICAL/HIGH theft path below is an instance of this one defect.

---

## Verified findings ledger (Round 2 final severities)

| ID | Final Sev | Unpriv? | Program | Title |
|----|-----------|---------|---------|-------|
| **C-1** | **CRITICAL** | ✅ yes | a2a_darkpool | `accept_and_settle` unbound buyer/seller/fee balances → unprivileged drain of any victim |
| **H-2** | **CRITICAL** | ✅ yes | perp_engine | Margin CPIs never bind trader/pool balances to the position trader (reachable unprivileged via darkpool) |
| **N-1** | **HIGH** | ✅ via N-2/C-1 | perp_engine | No canonical `engine_pool` in `EngineConfig` — the structural enabler of C-1/H-2 |
| **N-2** | **HIGH** | (operator) | perp_engine | `close_position` redirects margin-return + positive PnL to caller-controlled `trader_balance` (payout-theft) |
| **N-3** | **HIGH** | (operator) | order_settlement | `settle_one` confused deputy: ed25519 order identity not bound to forwarded maker/taker balances |
| **N-4** | **HIGH** | ✅ yes | perp_engine | Permissionless liquidation lets keeper redirect `insurance_payout` to attacker (unbound insurance balance) |
| **C-2** | **HIGH** | (operator) | oracle_router | Zero Pyth integration: operator-supplied prices written to engine with self-attested staleness/confidence |
| **H-7** | **HIGH** | (systemic) | collateral_manager | No `liquidate_collateral`: impaired LST collateral can never be seized → phantom margin (C-7 regression) |
| **N-5** | **HIGH** | (systemic) | perp_vault | No conservation-of-funds invariant: balances never reconciled vs `usdc_vault`; collateral credit + winner PnL unbacked |
| **N-6** | **HIGH** | (incident) | trading_vault | No protocol-wide pause: `config.paused` is dead state; `withdraw` checks no pause flag |
| **N-7** | **HIGH** | ✅ yes | trading_vault | Depositor controls equity inputs via `remaining_accounts` → understate equity, mint excess shares |
| **C-3** | **MEDIUM** | (owner) | sur_timelock | Timelock enforces no delay: `execute_transaction` does no CPI dispatch; `tx_hash` unbound/forgeable |
| **H-1** | **MEDIUM** | (operator) | perp_engine | Empty `remaining_accounts` skips margin lock while writing `position.margin` (phantom collateral) |
| **H-5** | **MEDIUM** | (2 keys) | auto_deleveraging | `execute_adl` forwards operator-controlled `mark_price` as `fill_price`, no bound vs `market.mark_price` |
| **N-8** | **MEDIUM** | (operator) | perp_engine | `update_mark_price` has no pause check — price mutable while engine paused |
| **N-9** | **MEDIUM** | (operator) | collateral_manager | `update_price` has no pause check |
| **N-10** | **MEDIUM** | (owner) | oracle_router | `configure_feed` has no parameter bounds — owner can disable all price-sanity checks |
| **N-11** | **MEDIUM** | (operator) | a2a_darkpool | `accept_and_settle` doesn't bind `engine_market` to `intent.market_id` (market substitution) |
| **N-12** | **MEDIUM** | (operator) | insurance_fund | `record_bad_debt` no dedup (M-15 not ported) → double-count can falsely trigger ADL |
| **N-13** | **MEDIUM** | (operator) | auto_deleveraging | `execute_adl` trusts operator-supplied `fund_balance`/`bad_debt_amount`, reads no on-chain state |
| **N-14** | **MEDIUM** | (operator) | oracle_router | `push_price` doesn't bind engine CPI accounts to oracle-config expected pubkeys |
| | LOW×9 | | various | rounding/ceil, decimals pow, i64 timestamp checked_add (ADL/insurance), Market::SIZE, saturating counters, create_vault squat, discriminator check, oracle CB init-bound, H-3/H-4/H-6/H-9/H-10/H-11 residuals |

### Round 2 outcomes on Round-1 findings (adversarial verification)

**Confirmed & up-rated:** H-2 HIGH → **CRITICAL** (the darkpool path makes it unprivileged; same root as C-1).
**Confirmed, severity held:** C-1 (3/3 skeptics), H-7.
**Confirmed but downgraded** (real, but trusted-key / not-unprivileged / partly documented): C-2 (CRITICAL→HIGH, needs operator key), C-3 (→MEDIUM, owner-only, custodies no funds), H-1 (→MEDIUM), H-5 (→MEDIUM, needs 2 trusted keys).
**Rejected / faithful-port (downgraded to LOW / DiD):**
- **H-3** (flat-operator internal_transfer) → LOW: faithful 1:1 port of audited Solidity `onlyOperator internalTransfer`; operators are owner-granted; per-tx cap is the upstream mitigation.
- **H-4** (update_mark_price generic operator) → LOW: Solidity gates the same `onlyOperator` set; `oracle_router` field is dead metadata. Residual is role-separation (DiD).
- **H-6** (trading_vault fee on unrealized PnL) → LOW: the manager **cannot** set `mark_price` (oracle-operator only), so the "pump-then-skim" requires the oracle key too; faithful to the audited Solidity AUM-vault trust model.
- **H-9** (timelock single-step ownership) → LOW: behind trusted owner; no on-chain consumer of `tx_hash` yet. Becomes dangerous once v0.3 CPI dispatch lands.
- **H-10** (commit-reveal bypass) → LOW: `settle_one` is operator-gated; `min_delay==0` is a documented intentional port; prod default 2s; snapshot binding correct.
- **H-11** (oracle CB walk-past) → LOW: needs operator key, matches Solidity CB design; owner `reset_circuit_breaker` refutes perma-DoS. Residual = missing init bound.
- **H-8** (collateral_manager.withdraw unbound trader_balance) → **NOT_A_BUG / FALSE POSITIVE** (settled by reading code): `perp_vault::CollateralOp` binds `trader_balance` via `seeds=[b"balance", trader.key()]`, and the CPI passes `trader = withdraw signer`. Anchor re-derives the PDA from the signer's key, so a substituted victim balance fails `ConstraintSeeds` and aborts atomically. The deep-sweep "new-#5" HIGH that re-flagged this is also rejected for the same reason.

---

## CRITICAL / HIGH detail (the theft family)

**C-1 (CRITICAL, unprivileged)** — `a2a_darkpool/.../accept_and_settle.rs`. `post_intent` +
`post_response` + `accept_and_settle` are all permissionless (only `intent.agent ==
intent_creator.key()`). `buyer_balance` / `seller_balance` / `fee_recipient_balance` are
`UncheckedAccount` with no binding to the resolved buyer/seller or `config.fee_recipient` (which
*exists* but is never read). Darkpool signs `vault.internal_transfer` as the registered
`darkpool_authority` operator → attacker creates a large-notional intent, passes a victim balance as
`buyer_balance` and own as `fee_recipient_balance`, and the fee + margin legs route victim → attacker.

**H-2 (CRITICAL, unprivileged)** — `perp_engine` `open_position.rs:181-198`. `trader_balance =
remaining_accounts[4]` and `engine_pool_balance = remaining_accounts[5]` are forwarded into
`vault.internal_transfer` with only `vault_program.key() == cfg.perp_vault` checked. Reachable
unprivileged through the darkpool path. **N-1**: there is no `engine_pool` field to even check
against — the pool is caller-supplied.

**N-2 (HIGH)** — `close_position.rs` has no `trader` account at all; `trader_balance` (payout dest)
is unchecked vs `position.trader`. An engine operator closes a profitable position at a chosen
`fill_price` and routes margin+PnL to an attacker balance.

**N-4 (HIGH, unprivileged)** — `liquidate_position.rs:215-253` sends `insurance_payout` to
`remaining_accounts[6]`, never bound to the real insurance PDA; `liquidator.liquidate` is
permissionless → any keeper captures the insurance slice of every liquidation.

**N-3 (HIGH)** — `order_settlement.settle_one`: ed25519 verifies the order signer, but
`maker_balance`/`taker_balance` are unbound → a settlement operator settles a self-signed throwaway
order while debiting a victim's balance.

**N-5 (HIGH)** — `perp_vault`: `credit_collateral` inflates spendable internal balance with no USDC
moved into `usdc_vault`, and `internal_transfer` spends `collateral_balance` as fungible USDC →
`sum(balances)` can exceed `usdc_vault.amount`; winner close pays from `engine_pool` with no
insurance draw. No instruction asserts `total_deposits <= usdc_vault.amount`.

---

## Remediation roadmap (verified order)

**Remediation status (2026-05-29): the entire "theft family" + mechanical hardening is DONE and
verified — `anchor test` 95/95 green (incl. an adversarial regression test proving the C-1
fee-substitution attack reverts with `InvalidAccount`). Closed: C-1, H-2, N-1, N-2, N-4 (Gate 0a);
C-1 fee leg + N-11 (Gate 0b); N-3 (Gate 0c); H-1 margin-skip; N-8/N-9 pause hygiene; LOW i64
overflow gates (ADL/insurance) + Market::SIZE. REMAINING (architectural — need Juan's steer):
N-5 conservation-of-funds, C-3/H-9 real governance, C-2 Pyth, H-7 liquidate_collateral, H-5/N-13
ADL on-chain reads, N-6 trading_vault global pause, N-10/N-14 oracle bounds, remaining LOW/DiD.**

**Gate 0 — Stop-the-line (the theft family; do before ANY value-bearing deploy):**
1. ✅ **0a — fix the engine binding root. DONE.** Added `engine_pool` + `insurance_fund_balance` to
   `EngineConfig` (pool set at `bootstrap_pool`, insurance via owner-only `set_insurance_fund_balance`);
   `open_position` / `close_position` / `liquidate_position` now bind `engine_pool_balance ==
   cfg.engine_pool`, `trader_balance == PDA([b"balance", position.trader], perp_vault)`, insurance to
   `cfg.insurance_fund_balance` (when set), and assert `authority` is the canonical engine_authority PDA.
   New guards in `cpi_util::{assert_canonical_balance, assert_engine_authority}`. Neutralizes C-1
   (margin leg), H-2, N-1, N-2, N-4.
2. ✅ **0b — darkpool. DONE.** `accept_and_settle` binds `buyer/seller/fee_recipient_balance` to the
   resolved buyer/seller/`config.fee_recipient` and `engine_market` to `intent.market_id`
   (closes unprivileged C-1 fee leg + N-11). Regression test added in `tests/04_a2a_darkpool.ts`.
3. ✅ **0c — order_settlement. DONE.** `settle_one` binds `maker/taker_trader` to the ed25519-signed
   order traders and `maker/taker/fee_recipient_balance` to `PDA([b"balance", trader/fee_recipient])`
   via `AccountMismatch` (closes N-3). Operator-gated.
   Also DONE this pass: **H-1** (open_position now requires the vault accounts whenever
   `additional_margin > 0` — no more silent margin-skip), **N-8** (`update_mark_price` pause check),
   **N-9** (`collateral_manager.update_price` pause check), and LOW i64 `saturating_add` gates in
   `auto_deleveraging.execute_adl` + `insurance_fund.reward`, plus the `Market::SIZE` over-allocation.
4. **0d — collateral.** (Defensive — H-8 is already safe.) Tighten `perp_vault::CollateralOp`
   `trader_balance` to an explicit `seeds=[b"balance", trader.key()]` Account (not free `init_if_needed`).

**Systemic:**
5. Conservation-of-funds backstop: keep `collateral_balance` non-withdrawable-as-USDC; forbid
   `internal_transfer` spending it for fee/PnL; add insurance draw on winner close; assert
   `total_deposits <= usdc_vault.amount` after token moves; aggregate counters → `checked_sub`.
6. Real governance: make each program's owner the `sur_timelock` PDA; `execute_transaction`
   `invoke_signed` the queued ix with `instruction_hash` verification; bind `tx_hash =
   keccak(target||payload||eta)`; two-step `transfer_ownership` (fixes C-3/H-9).
7. Restore missing defenses: port `liquidate_collateral` (H-7) + M-15 bad-debt dedup (N-12);
   `execute_adl` reads insurance/position state on-chain (H-5, N-13).
8. Oracle integrity: Pyth on-chain derivation in `push_price` (C-2); bound `configure_feed` (N-10);
   init-bound `required_good_prices_for_reset`; bind push_price engine accounts (N-14).
9. Pause hygiene: config-level pause in trading_vault checked in withdraw (N-6); pause checks in
   `perp_engine.update_mark_price` (N-8) and `collateral_manager.update_price` (N-9).
10. open_position: require vault accounts when `additional_margin>0` (remove the skip) or set
    `position.margin` only after the lock CPI succeeds (H-1).
11. Hygiene/DiD: cap + cache trading_vault equity walk (CU DoS); deterministically bind deposit
    equity inputs (N-7); `checked_add` on i64 timestamp gates; collateral `decimals<=18`;
    ceil-round collateral withdraw debit; AccountBalance discriminator check; bind `create_vault`
    PDA to manager; fix `Market::SIZE`.

**Then:** re-run this audit harness on the patched tree → external audit (OtterSec / Neodyme / Halborn).

---

## Residual blind spots (honest coverage gaps)

- All analysis is static read — no on-chain/runtime test of PDA bump enforcement against a cluster.
- ~20 admin/bootstrap/cpi_util/mod files assumed (not confirmed) to hold no extra authority paths.
- Compute-budget DoS on `settle_one` and the trading_vault equity walk is plausible but unmeasured.
- Cross-program operator-key reuse matrix not fully enumerated from deploy scripts (devnet state
  indicates `darkpool_authority` is a live vault+engine operator).
- Conservation-of-funds (N-5) reasoned from the *absence* of a reconciliation instruction, not a
  positive insolvency test.
- Solidity parity spot-confirmed via in-code MAPPING comments, not a full line-by-line diff.
