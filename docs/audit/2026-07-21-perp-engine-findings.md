# perp_engine — Security Review Findings

> **✅ REMEDIATED (2026-07-21):** the HIGH (silent settlement skip in `close_position` /
> `liquidate_position`) is **fixed** — both now `require!(remaining_accounts.len() >= 6/7)`,
> propagating the H-1 mandatory-settlement guard. Verified to compile (`anchor build`). Regression
> tests: `tests/10_close_position_strand_red.ts`.

**Date:** 2026-07-21
**Scope:** `programs/perp_engine/` (10 instructions + `state.rs` + `cpi_util.rs`)
**Method:** Trail of Bits Solana vulnerability scanner (6 patterns) + manual fund-flow review
**Reviewer:** Claude (Opus) via `solana-vulnerability-scanner` skill

---

## Summary

The automated 6-pattern scan is **clean** — the prior audit (Gate 0a) already closed
the CPI / PDA / account-binding class of bugs. One **HIGH** issue survives from the
manual fund-flow review: the mandatory-settlement guard added by the **H-1** fix was
applied to `open_position` and `reduce_position` but **not** to `close_position` or
`liquidate_position`, which still silently skip settlement when vault accounts are
omitted. This is the same root cause as the already-confirmed reduce/flip High.

---

## Automated scan — 6 Solana patterns: PASS

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | PASS | Every `invoke_signed` validates `vault_program.key() == cfg.perp_vault` first (`open_position.rs:191`, `reduce_position.rs:220`, `close_position.rs:127/167`, `liquidate_position.rs:177/233`, `bootstrap_pool.rs:48`). |
| 2 | Improper PDA validation | PASS | `assert_engine_authority` uses the **stored** canonical bump `cfg.authority_bump` (set at `initialize`); `assert_canonical_balance` uses `find_program_address`. No user-provided bumps. |
| 3 | Missing ownership check | PASS | Forwarded `remaining_accounts` are validated by canonical key derivation; the engine never deserializes foreign accounts. Own state uses `Account<'info, T>`. |
| 4 | Missing signer check | PASS | `operator: Signer` + `Operator` PDA `authorized` constraint on all trade ixs; `has_one = owner` on admin; two-step ownership transfer with `pending_owner: Signer`. |
| 5 | Sysvar spoofing | PASS | Uses `Clock::get()` syscall; no sysvar passed as an account. |
| 6 | Instruction introspection | N/A | Not used. |

---

## HIGH — Silent settlement skip in `close_position` and `liquidate_position`

**Location:**
- `programs/perp_engine/src/instructions/close_position.rs:106,119,159`
- `programs/perp_engine/src/instructions/liquidate_position.rs:156,168,224`

**Description.**
The **H-1** fix made vault settlement **mandatory** when value moves, in both
`open_position` (`require!(ctx.remaining_accounts.len() >= 6, ...)`, line 177) and
`reduce_position` (line 208), with the stated rationale that skipping settlement because
a caller omitted accounts previously "opened phantom-collateral positions with no USDC
locked → protocol insolvency."

That guard was **not** propagated to `close_position` or `liquidate_position`. Both
retain the legacy optional pattern:

```rust
// close_position.rs
position.size = 0;          // :99  — state committed FIRST
position.entry_price = 0;   // :100
position.margin = 0;        // :101
let has_vault_accounts = ctx.remaining_accounts.len() >= 6;   // :106
if has_vault_accounts && total_return > 0 { /* pay trader */ } // :119 — skipped if absent
```

**Failure scenario (close_position).**
An operator (darkpool / order_settlement) closes a **winning** position for a trader
without forwarding the six vault accounts. The position is zeroed and `PositionClosed`
is emitted with the realized PnL, **but the trader is never paid** their
`released_margin + PnL`. The funds remain stranded in `engine_pool` and the trader's
on-chain claim is erased (margin = 0). There is no residual state to re-settle against.

**Failure scenario (liquidate_position).**
With `remaining_accounts.len() < 7`, the position is liquidated (size/margin zeroed, OI
updated, events emitted) but the keeper reward and insurance payout never move. The
engine's internal accounting and the vault balances diverge: `engine_pool` retains funds
that the engine believes were distributed.

**Impact.** Direct stranded-funds / erased-claim for the trader on `close_position`
(fund loss); accounting divergence between engine and vault on `liquidate_position`.
This is the **same family** as the already-confirmed reduce/flip High (freed margin
stranded in `engine_pool` when `open_position` reduces without settling). Requires a
(semi-trusted) operator to call without the accounts — but the H-1 fix already
established that "caller omitted accounts" is not an acceptable reason to skip a
value-moving settlement.

**Recommendation.** Mirror the H-1 guard — make settlement mandatory whenever value
must move, since (unlike `open_position`, which is deliberately left optional so ADL can
reduce-through without settling) `close_position` and `liquidate_position` have **no**
legitimate skip case:

```rust
// close_position.rs — replace the optional has_vault_accounts branch:
require!(ctx.remaining_accounts.len() >= 6, EngineError::InvalidParam);

// liquidate_position.rs — when keeper_reward > 0 || insurance_payout > 0 || bad_debt path pays:
require!(ctx.remaining_accounts.len() >= 7, EngineError::InvalidParam);
```

A RED test demonstrating the `close_position` strand accompanies this report
(see the audit test added alongside the existing reduce/flip RED test).

---

## Informational

- **`liquidate_position` keeper_balance not bound to a canonical PDA** (`:173,190,229,247`).
  `keeper_balance` (remaining[4]) is the reward destination and is chosen by the caller
  (the liquidator). In isolation the caller can only misroute their own reward. **However,
  this composes with `perp_vault` CRITICAL-1** (`2026-07-21-perp-vault-findings.md`): a
  liquidator can set `keeper_balance == engine_pool_balance`, so the engine issues
  `internal_transfer(from = engine_pool, to = engine_pool, keeper_reward)`. Because the
  vault has no `from != to` guard, that call **inflates `engine_pool`** by `keeper_reward`
  instead of being a no-op — i.e. the vault's duplicate-account mint is reachable through a
  legitimate engine instruction, not only by direct operator abuse. Fixing vault CRITICAL-1
  closes this; additionally binding `keeper_balance` to a canonical, distinct-from-pool PDA
  is defense in depth.

- **`set_operator` / `set_insurance_fund_balance` accept arbitrary pubkeys**
  (`operator_admin.rs`, `admin.rs`). Owner-gated; trust assumption on the owner. No change
  recommended.

- **Scope note.** Only `perp_engine` was reviewed here. `perp_vault` — which actually
  executes `internal_transfer` and is responsible for validating the `from`/`to` balance
  accounts and the engine's operator authority — is the other half of the trust model and
  is reviewed separately (`2026-07-21-perp-vault-findings.md`).
