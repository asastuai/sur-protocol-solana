# perp_vault — Security Review Findings

> **✅ REMEDIATED (2026-07-21):** CRITICAL-1 (self-alias mint in `internal_transfer`) is **fixed** —
> a `require_keys_neq!(from_balance, to_balance, VaultError::SameAccount)` guard now rejects the
> duplicate-account case. Verified to compile (`anchor build`). Regression test:
> `tests/12_vault_alias_mint_red.ts`. HIGH-1 (operator scoping) remains open — see the trust-model
> decision in the AUDIT-SUMMARY.

**Date:** 2026-07-21
**Scope:** `programs/perp_vault/` only (`deposit`, `withdraw`, `internal_transfer`, `credit/debit_collateral`, `set_operator`, admin + `state.rs`)
**Method:** Solana 6-pattern vulnerability review + manual fund-flow / authority review + adversarial verification of 12 raw findings
**Reviewer:** Claude (Opus), adversarial verifier pass

> **Scope note.** This report reviews **`perp_vault` only**. The counterpart engine
> (`perp_engine`), which *calls* `internal_transfer` and is the other half of the
> operator/settlement trust model, is reviewed separately in
> `2026-07-21-perp-engine-findings.md`.

---

## Summary

One **CRITICAL** issue survives verification and is the headline: `internal_transfer`
places no distinctness constraint on `from_balance` vs `to_balance`, so passing the
**same** trader PDA for both sides mints funds out of thin air via Anchor's
last-write-wins serialization of duplicated mutable `Account<T>` inputs. Anchor does
**not** auto-reject two `mut` account inputs that resolve to the same pubkey, so the
handler's deduct-then-credit on two independent in-memory copies collapses to a pure
credit.

One **HIGH** issue survives (reported three times across dimensions, one root cause):
the operator model is a single global `authorized` flag with **no binding** between the
operator and the `from_balance.trader` whose funds it moves, so any one authorized
operator key is a full-vault drain primitive.

Two **MEDIUM** issues survive: (a) `credit/debit_collateral` let any operator inflate or
zero any trader's collateral with no backing check or trader consent; (b) `set_operator`
never closes the Operator PDA on revoke, contradicting the `state.rs` invariant that
"existence == authorization."

Two **LOW** issues survive (operator-as-payer for `init_if_needed`; mutable-field PDA
seed fragility). Three findings were folded as duplicates; three are informational.

The arithmetic layer (checked add/sub with `require!` guards, no silent clamps) was
reviewed and is sound — the weakness is **authorization**, not math.

---

## Review — 6 patterns: mostly PASS, with one authorization FAIL class

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | PASS | Only CPIs are SPL `token::transfer` in `deposit`/`withdraw`; `withdraw` signs with the `vault_authority` PDA using the **stored** `vault_authority_bump`. No user-supplied program invoked. |
| 2 | Improper PDA validation | PASS (with fragility note) | All PDAs use stored canonical bumps (`bump = *.bump`) or `ctx.bumps` on first init. `internal_transfer` derives from the **stored** `from_balance.trader` field — self-consistent today (see LOW-2). |
| 3 | Missing ownership check | **FAIL (auth scoping)** | Own state uses `Account<'info, T>`, `trader` PDAs are canonically derived, so no *spoofing*. BUT `internal_transfer` and `credit/debit_collateral` bind the mover to **no** specific trader — the operator set is the sole gate (HIGH-1, MED-1). |
| 4 | Missing signer check | PASS | `operator: Signer` + `Operator` PDA `authorized` constraint on all operator ixs; `has_one = owner` on admin; two-step ownership (`transfer_ownership` → `accept_ownership` with `pending_owner: Signer`). |
| 5 | Sysvar spoofing | PASS | No sysvar passed as an account; no clock/rent read from a passed account. |
| 6 | Duplicate mutable account | **FAIL** | `internal_transfer` accepts `from_balance` and `to_balance` as two `mut Account`s with **no** `from ≠ to` constraint → mint (CRITICAL-1). |

---

## CRITICAL-1 — `internal_transfer` self-aliasing mints funds (last-write-wins)

**Location:** `programs/perp_vault/src/instructions/internal_transfer.rs:40-52` (accounts struct), `:62-108` (handler).

**Description.**
`InternalTransfer` declares `from_balance` and `to_balance` as two independent
`#[account(mut, seeds = [AccountBalance::SEED_PREFIX, *.trader.as_ref()], bump = *.bump)]`
inputs with **no constraint enforcing `from_balance.key() != to_balance.key()`**. Anchor
does **not** automatically reject two account inputs that resolve to the same pubkey. When
the same trader PDA is passed for both, Anchor's `try_accounts` deserializes the one
on-chain account into **two independent owned `AccountBalance` copies** (Borsh copies out
of the shared data buffer). The handler mutates them independently:

```rust
let from = &mut ctx.accounts.from_balance;   // copy A, balance = B
let to   = &mut ctx.accounts.to_balance;     // copy B, balance = B (same on-chain data)
...
from.balance = from.balance - amount;        // A: B - X   (:85)
to.balance = to.balance.checked_add(from_deposit)?; // B: B + X   (:99)
```

At instruction `exit`, Anchor serializes **both** copies back to the single underlying
account. The `to` (copy B) write happens last and wins, discarding copy A's deduction
entirely. The account's stored `balance` becomes `B + X` — `amount` created from nothing.
(There is no `mut`-borrow panic here: unlike zero-copy `AccountLoader::load_mut`,
`Account<T>` deserializes to owned data and does not hold a live `RefMut` across the
handler, so Anchor silently allows the duplicate.)

**Failure scenario.**
An authorized operator calls `internal_transfer(from_balance = to_balance =
attacker_PDA, amount = X)` with `X ≤ max_operator_transfer_per_tx` (or any `X` if the cap
is `0`/unlimited). Pre-state balance `B`. Post-state stored balance `= B + X`. Repeat to
inflate arbitrarily, then `withdraw()` real USDC from `usdc_vault`, draining honest
depositors. Balance conservation is broken; `total_deposits` is **not** touched by
`internal_transfer`, so the inflated `balance` also silently exceeds accounted deposits.

**Impact.** Direct, unbounded mint of withdrawable USDC balance → full vault drain.
Requires an authorized operator key, but combined with HIGH-1 (any operator, no scoping)
the trust surface for this is the entire operator set.

**Recommendation.** Add a distinctness gate. In the handler, before mutating:

```rust
require!(from.key() != to.key(), VaultError::ZeroAddress); // or a dedicated SameAccount error
```

or, on the accounts struct, `constraint = from_balance.key() != to_balance.key()`. This is
the standard Anchor same-account-aliasing guard and closes the mint. Also fixes the MED-3
event-integrity concern (a `from == to` no-op emitting `InternalTransferred{amount>0}`).

---

## HIGH-1 — Operator authorization is a single global flag with no per-trader scoping (full-vault drain primitive)

**Location:** `programs/perp_vault/src/instructions/internal_transfer.rs:32-52`
(auth = `operator_account.authorized` only), handler `:62-115`.
*(Reported three times across the money-movement, authority, and PDA/accounting
dimensions — same root cause, merged here.)*

**Description.**
`internal_transfer` authorizes solely on "the signer holds an `Operator` PDA with
`authorized == true`" (`:35-36`, `:54`). `from_balance` and `to_balance` are validated
**only against their own stored `trader` field** (`seeds = [SEED_PREFIX,
from_balance.trader.as_ref()]`), which is self-referential and therefore passes for **any**
canonically-derived `AccountBalance` PDA. There is:

- no binding between the operator and `from_balance.trader`,
- no reference to a position, order, or per-trader mandate,
- no CPI-caller / instruction-introspection check that the mover is the registered
  `perp_engine` program,
- no `engine_authority` allowlist in `VaultConfig` (the config stores no engine identity
  at all — see `state.rs:11-39`).

`set_operator` is a per-operator switch (`operator_admin.rs`), so the owner can register
multiple operators (keeper, liquidator, engine). **Any one** of them — or any one leaked
key — can move **any** trader's full `balance + collateral_balance` into **any** other
`AccountBalance`. The vault fully delegates "who may move whose funds" to raw operator
discretion. The Solidity original had the same `onlyOperator` trust, but the Solana port
dropped the natural mitigation of binding the mover to the engine program via CPI-caller
verification.

**Failure scenario.**
Owner registers a second operator `O2` (legitimately, e.g. a keeper) via
`set_operator(O2, true)`, or the engine's operator key leaks. Attacker signs
`internal_transfer(from = victim_PDA, to = attacker_PDA, amount = victim.balance +
victim.collateral_balance)` for every depositor (chunked to respect
`max_operator_transfer_per_tx`, which defaults to unlimited when `0`). Then `withdraw()`
pulls the aggregated USDC. No victim signature, no position, no settlement is required.

**Impact.** Any single authorized operator key = full drain of every depositor's
withdrawable balance. This is the vault-side of the trust boundary the engine is supposed
to enforce; the vault provides **no** independent constraint.

**Recommendation.**
Scope the mover. Preferred: store the sole `engine_authority` pubkey in `VaultConfig` and
require `operator_account.operator == vault_config.engine_authority` in `internal_transfer`
(a single protocol-owned mover), **or** require a program-derived engine signer and verify
the CPI caller program id via instruction introspection. Bind each transfer to a
verifiable engine settlement so the moved amount and from/to owners are constrained by
engine state, not raw discretion. At minimum, treat `max_operator_transfer_per_tx == 0` as
"must be configured" rather than "unlimited," add operator-scoped rate limiting, and
document that operator-key custody == full-vault trust.

---

## MEDIUM-1 — `credit/debit_collateral` let any operator inflate or zero any trader's collateral with no backing or consent

**Location:** `programs/perp_vault/src/instructions/collateral.rs:32-42` (accounts),
`:50-77` (`credit_collateral`), `:80-105` (`debit_collateral`).

**Description.**
`trader` is an `UncheckedAccount` used only to derive `trader_balance` (canonical PDA, not
spoofable). But there is **no signer/ownership check on `trader`** and the only gate is
operator-set membership. Any authorized operator can `credit_collateral(trader, amount)` to
inflate `collateral_balance` and `cfg.total_collateral_credits` arbitrarily, or
`debit_collateral` any trader's collateral to zero. Per the C-5 design note (`state.rs:55-57`),
collateral credits are supposed to be backed 1:1 by yield tokens held in the
`CollateralManager` — **nothing in this program verifies that backing exists**. So a
compromised/buggy operator mints unbacked trading margin.

Mitigating factor vs CRITICAL-1: `collateral_balance` is **not** withdrawable as USDC
(`withdraw` checks `bal.balance` only, `withdraw.rs:70`). So this inflates *margin*, not
directly withdrawable funds — a solvency/insolvency vector for the engine, not an immediate
USDC drain. Hence MEDIUM.

**Failure scenario.**
A compromised operator calls `credit_collateral(trader = self, amount = huge)`.
`collateral_balance` and `total_collateral_credits` inflate with no corresponding
yield-token deposit; the attacker now opens positions on unbacked margin, breaking the
vault/engine solvency invariant.

**Recommendation.**
Restrict `credit/debit_collateral` to the single trusted `CollateralManager` authority
(`constraint = operator.key() == vault_config.collateral_manager`) rather than the open
operator set, and/or require the `CollateralManager` to co-sign or prove the backing
yield-token movement in the same transaction (instruction introspection on the token
transfer).

---

## MEDIUM-2 — `set_operator` never closes the Operator PDA on revoke, contradicting the documented "existence == authorization" invariant

**Location:** `programs/perp_vault/src/instructions/operator_admin.rs:38-54`;
invariant claim at `programs/perp_vault/src/state.rs:84`.

**Description.**
`state.rs:84` documents: *"existence of the PDA == authorization. We close it on revoke."*
The actual revoke path (`set_operator(operator, status = false)`) **never closes** the
account — it only flips `authorized = false` via `init_if_needed` (`:50`). The
`if op_acc.operator == Pubkey::default()` guard (`:46`) means `operator` and `bump` are
written once and never resettable. So the real security model is the `authorized` **flag**,
not existence — directly contradicting the written invariant. Any future code or reviewer
that trusts "PDA exists ⇒ authorized" (the documented model) would be wrong and would treat
a revoked operator as still authorized. It also strands owner-paid rent in a
never-reclaimed account and permanently pins the `operator` field.

**Failure scenario.**
Owner does `set_operator(X, true)` then `set_operator(X, false)`. The Operator PDA for `X`
still exists on-chain with `operator = X, authorized = false`. A later refactor that
reintroduces an "account exists" presence check — matching the written invariant — would
re-authorize `X`. Meanwhile the rent is stranded and `X`'s slot can never be reassigned.

**Recommendation.**
Prefer (a): add a real `close_operator` path using Anchor's `close = owner` so revoke
truly deletes the PDA and reclaims rent, keeping "existence == authorization" consistent.
Otherwise (b): fix the `state.rs:84` comment to state that `authorized` is the sole gate
and existence is meaningless. (a) matches the Solidity-style revoke semantics.

---

## LOW-1 — `credit_collateral` uses the operator as `init_if_needed` payer for arbitrary trader balance PDAs

**Location:** `programs/perp_vault/src/instructions/collateral.rs:32-42`.

**Description.**
`CollateralOp` sets `init_if_needed, payer = operator` for a `trader_balance` seeded by an
`UncheckedAccount` `trader`. The operator therefore funds rent to create an
`AccountBalance` PDA for **any** trader pubkey it chooses, with no signature from that
trader. This is (a) a rent-griefing vector against the operator, and (b) it lets an
operator pre-materialize valid destination balance PDAs for attacker-controlled traders —
the destination side of the drain chain in CRITICAL-1 / HIGH-1. `init_if_needed`
reinitialization is mitigated by the `trader == default` write-once guard (`:60-63`).

**Recommendation.**
Have the trader (or the `CollateralManager` via verified CPI) be the payer/signer for
balance-PDA creation, or split PDA initialization out of the operator path. If the operator
must pay, cap/monitor it; the HIGH-1 scoping fix removes the value of pre-creating
arbitrary sink PDAs.

---

## LOW-2 — `AccountBalance.trader` is a mutable stored field used as its own PDA seed (derivation fragility)

**Location:** `programs/perp_vault/src/state.rs:63`; consumers at
`internal_transfer.rs:42,49` and `collateral.rs:36`.

**Description.**
`AccountBalance.trader` is set once under the write-once guard
(`deposit.rs:85-87`, `collateral.rs:60-62`), and thereafter `internal_transfer` and
`collateral` re-derive the PDA **from that stored field** (`seeds = [SEED_PREFIX,
*.trader.as_ref()], bump = *.bump`). This is self-consistent **today** only because the
first writer used `ctx.bumps` (canonical). The pattern — deriving a PDA from a mutable
stored field rather than from a caller-supplied, independently-constrained pubkey — is
fragile: any future instruction that writes `trader` without re-asserting canonical
derivation would let a PDA claim to belong to an arbitrary trader, after which the
self-referential seed check validates it. `withdraw` is the only consumer that cross-checks
(`constraint = account_balance.trader == withdrawer.key()`, `withdraw.rs:55`);
`internal_transfer` and `collateral` do not.

**Recommendation.**
Treat `trader` as immutable after init and add a defensive `address = find_program_address(
[SEED_PREFIX, trader])`-style assertion in `internal_transfer`/`collateral`, so derivation
is anchored to a canonical trader identity rather than a mutable field.

---

## Informational

- **Admin + operator signer surface is sound.** `set_operator` correctly enforces
  `has_one = owner @ NotOwner` + `owner: Signer`; the `operator` field is write-once
  (`== Pubkey::default()` guard), so `init_if_needed` cannot reassign an existing Operator
  PDA to a different key or bypass the `ZeroAddress` check. Two-step ownership
  (`transfer_ownership` sets `pending_owner`; `accept_ownership` requires
  `pending_owner: Signer && key == pending_owner`) is present and correct
  (`admin.rs:161-199`). Reviewed and found sound aside from the scoping (HIGH-1) and
  revoke-close (MEDIUM-2) issues.

- **`init_if_needed` re-init is safe but guard-dependent.** `deposit` (`:45-52`),
  `credit/debit_collateral` (`collateral.rs:32-39`), and `set_operator`
  (`operator_admin.rs:23-30`) rely on the write-once `if field == default` guards to keep
  accumulators (`balance`, `collateral_balance`) and `bump`/`trader` intact across a second
  init. Correct today; keep the guards on any future edit.

- **Arithmetic is consistently checked; no silent-clamp bug.** `internal_transfer` uses
  `checked_add`/`checked_sub` (`:76-108`); the deposit-first leg's plain subtraction
  (`:85`) is guarded by `amount <= total_bal` **and** the branch condition
  `amount <= from.balance`, so it cannot underflow. `deposit`/`withdraw`/`collateral` map
  underflow to `MathOverflow` rather than saturating (`withdraw.rs:84-91`,
  `collateral.rs:86-98`) — the conservation-preserving choice. No overflow/underflow or
  silent-clamp accounting bug in the math itself. Keep the guarding branch invariant at
  `internal_transfer.rs:85` if that logic is ever refactored.

---

## Verification notes (rejections / merges)

- **MERGED into HIGH-1:** two additional "any operator drains any trader" findings
  (authority-model and PDA-derivation dimensions) — identical root cause and fix.
- **MERGED into CRITICAL-1:** the "`from.trader != to.trader` not enforced" MEDIUM. Its
  event-integrity angle (a `from == to` no-op still emitting `InternalTransferred{amount>0}`
  and corrupting off-chain settlement accounting) is real, but its claim that *"Anchor will
  error on the duplicate mutable borrow"* is **incorrect** for `Account<T>` (no live
  `RefMut` is held; the real consequence is the CRITICAL-1 last-write-wins mint). Same fix
  (`from.key() != to.key()` guard), so folded in.
- No findings were rejected as non-issues; the two INFO-grade "verified safe" confirmations
  are recorded above.
