# SUR Protocol (Solana) — Repo-Wide Security Audit Summary

**Date:** 2026-07-21
**Scope:** all 6 programs under `programs/` — `perp_engine`, `perp_vault`, `a2a_darkpool`,
`trading_vault`, `order_settlement`, `collateral_manager`.
**Method:** per-program Solana 6-pattern vulnerability scan (Trail-of-Bits patterns) + manual
fund-flow / authority / cross-program review + adversarial verification, one report per program.
**Reviewer:** Claude (Opus).

This document consolidates the six per-program finding reports into a single tiered view, maps
the cross-program attack chains, flags the one open trust-model decision that governs several
severities, and drafts a conservative self-funded bounty package.

> **Source reports (read for full detail on any row):**
> - `2026-07-21-perp-engine-findings.md`
> - `2026-07-21-perp-vault-findings.md`
> - `2026-07-21-a2a_darkpool-findings.md`
> - `2026-07-21-trading_vault-findings.md`
> - `2026-07-21-order_settlement-findings.md`
> - `2026-07-21-collateral_manager-findings.md`

---

## 0. Remediation status (2026-07-21)

| Finding | Status |
|---------|--------|
| perp_vault CRITICAL-1 (alias-mint) | ✅ **Fixed** — `require_keys_neq!(from, to)` guard; compiles. |
| perp_engine HIGH (close/liquidate silent skip) | ✅ **Fixed** — mandatory `require!(len >= 6/7)`; compiles. |
| trading_vault CRITICAL-1 (equity-set forgery) | ⏳ **Open** — needs a position-registry design change (not a one-liner); do it with a working `anchor test` run. |
| perp_vault HIGH-1 (operator no scoping) + all MEDIUM/LOW | ⏳ **Open** — gated on the section-3 trust-model decision; hardening pending. |

The two cheap, verified fixes are applied and build-checked. Regression tests were converted from
"documents the bug" to "asserts the guard reverts" (`tests/10`, `tests/12`) and still need a CI/non-Windows
`anchor test` run to confirm green (see `TEST-STATUS.md`).

---

## 1. Consolidated findings — all confirmed issues, all programs

Severities as assigned in the per-program reports. Rows tagged **[operator-gated]** hinge on the
open trust-model decision in section 3 — their *nominal* severity assumes an operator/keeper key
is a realistic compromise surface, not a fully trusted admin.

| Severity | Program | Location | One-line |
|----------|---------|----------|----------|
| CRITICAL | perp_vault | `internal_transfer.rs:40-52,62-108` | `from_balance`/`to_balance` self-aliasing mints funds via last-write-wins serialization (no `from != to` guard). **[operator-gated]** |
| CRITICAL | trading_vault | `equity.rs:93-198` | `compute_vault_equity` trusts caller-supplied `(Position,Market)` set — omit losers / duplicate winners to bias equity → over-withdraw or share-inflation theft. |
| HIGH | perp_engine | `close_position.rs:106,119,159`; `liquidate_position.rs:156,168,224` | Mandatory-settlement (H-1) guard not propagated to close/liquidate → winning position zeroed but trader never paid; funds stranded in `engine_pool`. **[operator-gated]** |
| HIGH | perp_vault | `internal_transfer.rs:32-52,62-115` | Operator auth is a single global `authorized` flag with no binding to `from_balance.trader` → any one operator key = full-vault drain primitive. **[operator-gated]** |
| HIGH | trading_vault | `deposit.rs:56-58,139-148` | `depositor_balance` not bound to signer → spend a third party's perp_vault USDC to mint your own vault shares. **[operator-gated]** (needs vault authority active as perp_vault operator) |
| HIGH | collateral_manager | `withdraw.rs:92-108` | `withdraw` gates on oracle `StalePrice` it never uses → stale/censoring price operator becomes a collateral-lockup (denial-of-withdrawal) primitive. **[operator-gated]** |
| MEDIUM | perp_vault | `collateral.rs:32-42,50-105` | `credit/debit_collateral` let any operator inflate/zero any trader's collateral with no backing check or consent (unbacked margin). **[operator-gated]** |
| MEDIUM | perp_vault | `operator_admin.rs:38-54`; `state.rs:84` | `set_operator` revoke never closes the Operator PDA → contradicts documented "existence == authorization" invariant; stranded rent, pinned field. |
| MEDIUM | a2a_darkpool | `accept_and_settle.rs:107,137,232-256,433-679` | Settlement CPIs invoke `perp_engine_program`/`perp_vault_program` as unchecked accounts never bound to `config.*` → arbitrary CPI signed by `darkpool_authority` (bounded by single-hop PDA-sig non-propagation). |
| MEDIUM | a2a_darkpool | `accept_and_settle.rs:187-202,483-488` | Freshness gate + open/reduce/close routing read callee `Market`/`Position` by hard-coded byte offsets — an independent `perp_engine` layout change silently desyncs freshness + routing. |
| MEDIUM | trading_vault | `manager_trade.rs:97-110`; `fees.rs:165-187` | Drawdown auto-pause evaluated on the same caller-supplied equity → manager can mask a real breach or force a spurious pause. |
| MEDIUM | order_settlement | `settle.rs:76-78,339-367,598-654` | `engine_market` forwarded + read raw for dynamic-spread fee, unbound to the trade's `market_id` → operator can suppress the surcharge (protocol fee under-collection). **[operator-gated]** |
| MEDIUM | collateral_manager | `withdraw.rs:113-126` | Withdraw is all-or-nothing coupled to `debit_collateral` CPI → a drawn-down `collateral_balance` blocks even the still-backed portion (partial-lockup / ledger divergence). |
| MEDIUM | collateral_manager | `operator_admin.rs:32-46` | `set_operator` revoke never closes the Operator PDA ("existence == authorization" does not hold); same lifecycle pattern as perp_vault. |
| LOW | perp_vault | `collateral.rs:32-42` | `credit_collateral` uses operator as `init_if_needed` payer for arbitrary trader balance PDAs (rent-grief + pre-materialize attacker sink PDAs). |
| LOW | perp_vault | `state.rs:63`; `internal_transfer.rs:42,49`; `collateral.rs:36` | `AccountBalance.trader` is a mutable stored field used as its own PDA seed (derivation fragility). |
| LOW | a2a_darkpool | `accept_and_settle.rs:208` | Settlement does not re-check `response.price` against the intent band (safe today — both immutable; defensive only). |
| LOW | a2a_darkpool | `accept_and_settle.rs:157,180-203` | Freshness gate has no circuit breaker distinct from global `paused` (operational; coupled to the layout-offset MEDIUM). |
| LOW | trading_vault | `cpi_util.rs:322-327`; `manager_trade.rs:118-123` | `read_position_size` fails open to `0` → mis-routes open vs reduce/close (defense-in-depth; engine is ultimate authority). |
| LOW | trading_vault | `vault_admin.rs:164-196`; `deposit.rs:26-32` | `init_vault_balance` / operator-paid balance-PDA creation griefable / front-runnable (rent attribution nuisance). |
| LOW | order_settlement | `settle.rs:79-100` | `maker/taker_position`, `engine_authority`, `engine_vault_operator`, `engine_pool_balance` forwarded unvalidated → local dispatch read trusts callee to reject mismatch. **[operator-gated]** |
| LOW | order_settlement | `operator_admin.rs:32-46` | `set_operator` revoke never closes the Operator PDA (stranded rent; no contradicted invariant here — no "existence" comment). |
| LOW | order_settlement | `settle.rs:43-67`; `commit_order.rs:42-49` | Operator funds `init_if_needed` rent for trader nonce-page / snapshot PDAs (gated behind a required ed25519 sig; rent-grief only). |
| LOW | collateral_manager | `withdraw.rs:101-108,129-130` | Proportional-debit rounding leaves dust credit on partial exits (self-corrects on full exit). |
| LOW | collateral_manager | `deposit.rs:75-77,158-168` | `deposit` pays vault-side `init_if_needed` rent via forwarded unchecked `trader_balance` (soft coupling / authority-rent). |

**Counts:** CRITICAL 2 · HIGH 4 · MEDIUM 8 · LOW 11 · **total 25 confirmed.**
(Informational confirmations and rejected/merged candidates are recorded in each source report and
are not counted here.)

---

## 2. Cross-program attack chains

The programs are individually reviewed, but the real money-movement risk lives at the seams. The
per-program reports were careful **not** to double-count a root cause across programs; this section
makes the compositions explicit.

### Chain A — Engine unbound `keeper_balance` composes with the vault alias-mint

- `perp_engine.liquidate_position` does **not** bind `keeper_balance` (remaining[4]) to a canonical
  PDA (`perp-engine` Informational note, `:173,190,229,247`). In isolation a liquidator can only
  misroute their *own* reward.
- `perp_vault.internal_transfer` has **no `from != to` guard** (CRITICAL-1). A liquidator sets
  `keeper_balance == engine_pool_balance`, so the engine issues
  `internal_transfer(from = engine_pool, to = engine_pool, keeper_reward)`.
- Last-write-wins then **inflates `engine_pool` by `keeper_reward`** instead of being a no-op.
- **Net:** the vault's duplicate-account mint is reachable through a *legitimate engine
  instruction*, not only by direct operator abuse. Fixing perp_vault CRITICAL-1 closes the chain;
  binding `keeper_balance` to a distinct canonical PDA is defense-in-depth.

### Chain B — Trading-vault deposit rides the vault's un-scoped operator

- `trading_vault.deposit` leaves `depositor_balance` unbound to the signer (HIGH-1).
- The trading_vault `authority` is a **registered perp_vault operator**, and
  `perp_vault.internal_transfer` binds the mover to **no** specific `from_balance.trader` (perp_vault
  HIGH-1).
- **Net:** the deposit CPI can debit *any* perp_vault depositor's idle USDC and credit the
  attacker's share PDA. Two independent fixes each close it (bind `depositor_balance` in
  trading_vault; scope the operator in perp_vault) — belt and suspenders.

### Chain C — Order-settlement / darkpool forwarding leans entirely on callee re-validation

- `order_settlement` (LOW-1) and `a2a_darkpool` (MEDIUM-1/2) forward engine-side accounts
  (`positions`, `engine_market`, `engine_authority`, `engine_pool_balance`, and the *program ids*
  themselves in darkpool) with **no on-struct constraint**, trusting the callee to reject a
  mismatch and relying on single-hop PDA-signature non-propagation.
- These are bounded **today** only because (a) `perp_engine` is assumed to bind `position ↔ (trader,
  market)` and (b) a PDA signature cannot be re-signed one hop deeper.
- **Net:** if `perp_engine`'s market/position binding is ever weakened, the *routing decisions* in
  both settlement layers become attacker-controlled (wrong open-vs-reduce dispatch, mis-directed
  margin settlement). This is a latent-severity coupling: the callers' safety is a property of the
  callee, not of themselves.

### Chain D — Collateral unbacked-margin feeds engine solvency

- `perp_vault.credit_collateral` (MEDIUM-1) lets any operator inflate `collateral_balance` with no
  proof of backing yield tokens.
- `collateral_manager` is the intended sole backer, but perp_vault does not restrict
  `credit/debit_collateral` to it.
- **Net:** a compromised/over-broad operator mints unbacked trading margin; positions opened on it
  are a solvency vector for the engine (not a direct USDC drain, hence MEDIUM). The
  collateral_manager ↔ perp_vault ledgers are also reconciled only at full-debit granularity
  (collateral_manager MEDIUM-1), so divergence between the two is already a live accounting hazard.

**Common denominator:** nearly every chain routes through the perp_vault operator model
(`internal_transfer` + `credit/debit_collateral` un-scoped to a specific trader/engine). That is the
single highest-leverage fix in the repo.

---

## 3. OPEN DECISION FOR JUAN — operator trust model

**This decision sets the final severity of every row tagged [operator-gated] above, and it should be
made before the bounty severities are frozen.**

Several of the most serious findings — perp_vault CRITICAL-1 and HIGH-1, perp_engine's close/liquidate
HIGH, trading_vault's deposit HIGH, perp_vault MEDIUM-1, order_settlement MEDIUM-1, and
collateral_manager HIGH-1 — are only reachable by a party that holds an **operator / keeper / engine
authority key** (or by a program that has been registered as an operator).

Their nominal severities were assigned under the **conservative security posture**: "an operator key
is a realistic compromise surface" (a leaked keeper key, a buggy keeper bot, an over-broadly
registered second operator, or a future sibling program granted operator rights). Under that reading:
one leaked operator key = full-vault drain (perp_vault CRITICAL-1 + HIGH-1), which is why they are
CRITICAL/HIGH.

There is a competing, defensible reading — the **trusted-admin posture**: operator keys are protocol-
controlled infrastructure (like an owner/multisig), custody is hardened off-chain, and "operator can
move funds" is *by design* the same way `onlyOperator` was in the Solidity original. Under that
reading, these become "operator-trust assumptions to document" rather than exploitable
vulnerabilities, and their severity drops (typically to LOW/informational "trusted-role" notes),
while the two operator-*independent* findings stay put:

- **trading_vault CRITICAL-1** (any depositor forges the equity position set — **no operator key
  needed**) — stays CRITICAL regardless.
- **collateral_manager MEDIUM-1**, the darkpool MEDIUMs, the layout-coupling MEDIUMs, and the
  accounting-hygiene LOWs are not primarily operator-gated and are largely unaffected.

### What is needed from you

Decide which posture SUR ships under:

- **(A) Compromise-surface posture** (recommended for an audit deliverable and for a public bounty):
  operator keys are treated as a realistic attack surface; the [operator-gated] rows keep their
  CRITICAL/HIGH severities; the fixes (scope the mover to the engine authority / bind
  `from != to` / propagate the mandatory-settlement guard / drop the stale-price gate on withdraw)
  are all required.
- **(B) Trusted-admin posture:** operator custody is an explicit, documented trust assumption; the
  [operator-gated] rows are downgraded to "trusted-role hardening" and the bounty excludes
  "assumes a compromised operator/admin key" (a standard exclusion — see the DRAFT below).

**Recommendation:** even under (B), fix perp_vault CRITICAL-1 (`from != to`) and HIGH-1 (scope the
mover) and the perp_engine close/liquidate settlement gap — an aliasing mint and stranded-funds bug
are latent regardless of trust posture, and the fixes are cheap and non-controversial. The trust
posture then only changes how the *bounty* prices operator-gated reports, not whether the code is
fixed.

The bounty tiers in section 4 are written to be re-labelable once you pick (A) or (B); they do
**not** overstate severity and explicitly exclude trusted-key scenarios so they read the same under
either posture.

---

## 4. Bounty package (DRAFT)

> **Status: DRAFT — not published.** Self-funded, small (~200 USDT total pool). Framed
> conservatively: this is a solo/indie protocol invitation to a handful of known Percolator-tier
> devs, **not** an Immunefi-scale program. Severities below are deliberately *not* inflated; the
> internal audit above already found the headline bugs, so this bounty targets what the audit and
> the fixes might have **missed or reintroduced**, plus anything net-new.

### 4.1 Framing (conservative)

- The protocol has just completed an internal repo-wide review (this document). Known findings are
  **out of scope** for reward — they are listed as *acknowledged* so nobody re-reports them.
- The realistic ceiling for a *new* finding is **High / Medium + a PR**, not a fresh drain — the
  juicy direct-drain classes (fee-leg substitution, signature/nonce replay, self-trade, cross-mint
  escrow, arbitrary CPI into an attacker program) were verified **closed**. Set expectations
  accordingly so the pool is not misread as implying an unpatched jackpot.
- Reward is for **verified, reproducible** findings against the **audited commit** (pin the exact
  commit hash), on **devnet / local validator only**. No mainnet interaction is in scope.

### 4.2 Tiered structure (~200 USDT pool)

| Tier | Severity | Guide reward | What qualifies |
|------|----------|--------------|----------------|
| T1 | Critical | 100 USDT | New, operator-*independent* direct loss/mint of user principal (e.g. a trading_vault-CRITICAL-1-class equity/share forgery we missed) with a working devnet PoC. |
| T2 | High | 60 USDT | New stranded-funds / drain-primitive / denial-of-withdrawal reachable under the **chosen** trust posture (section 3), with PoC. |
| T3 | Medium | 30 USDT | New accounting-divergence, fee-integrity, layout-coupling, or safety-control-bypass issue with a concrete failure scenario. |
| T4 | Low / hardening | 10 USDT | Valid defense-in-depth gap (unbound account, missing dedup, rounding, rent-grief) with a suggested fix / PR. |

- Total is a *soft cap*: if two T1s land, the pool tops up rather than the second going unpaid — but
  the expectation (set publicly) is that T3/T4 is the realistic landing zone.
- **Bonus (non-monetary):** a merged PR that fixes the reported issue gets credit in the repo and
  priority review — this is the primary draw for a small self-funded pool, and it should be said so
  plainly.

### 4.3 In scope

- All 6 programs at the pinned audited commit: `perp_engine`, `perp_vault`, `a2a_darkpool`,
  `trading_vault`, `order_settlement`, `collateral_manager`.
- On-chain program logic only: fund safety, accounting/conservation, authorization scoping, PDA
  derivation, CPI wiring, replay, oracle/liveness coupling.

### 4.4 Out of scope / exclusions (standard)

1. **Any finding already documented in the 2026-07-21 audit reports** (the 25 confirmed findings
   above and every Informational/rejected note) — acknowledged, not eligible.
2. **Attacks that assume a compromised or malicious owner / operator / keeper / admin key**, unless
   the report shows the privilege was obtained *without* such a key. *(If Juan picks posture (A),
   narrow this to "compromised **owner/admin** key" and keep operator-compromise **in** scope — the
   two exclusions are mutually exclusive; pick one to match section 3.)*
3. Denial of service via network/RPC spam, transaction flooding, or validator-level resource
   exhaustion not specific to program logic.
4. Findings requiring a **hard fork of the Solana runtime**, a compromised SPL Token / System /
   sysvar program, or a broken ed25519/secp256k1 precompile.
5. Off-chain components: the off-chain matcher/keeper bots, front-end, RPC infra, key management,
   and deployment/multisig operational security (report privately instead).
6. Best-practice / style / gas(compute)-optimization notes with **no** security impact.
7. Theoretical issues with **no** concrete, reproducible failure scenario or PoC against the pinned
   commit on devnet/local.
8. Third-party dependency CVEs without a demonstrated exploit path in SUR's usage.
9. Economic / market-manipulation / oracle-price-assumption findings that reduce to "the price
   operator can push a wrong price" (that is the documented oracle trust assumption — see
   collateral_manager HIGH-1 and the section-3 decision).
10. Mainnet interaction, social engineering, or physical attacks.

### 4.5 Rules of engagement

- Devnet / local validator only. No mainnet, no attacking other users' funds.
- One report per root cause; duplicates decided by first verifiable submission.
- Private disclosure to the maintainer first; public write-up only after a fix ships (coordinated
  disclosure).
- Reward is discretionary and requires a **reproducible PoC** (test or transaction sequence)
  against the pinned commit; a proposed fix / PR is strongly favored and can raise the tier.
- Severity is assigned by the maintainer using this document's rubric **after** the section-3 trust
  posture is fixed.

---

*Generated as the repo-wide consolidation of the six 2026-07-21 per-program reports. No production
code was modified in producing this summary.*
