# collateral_manager — Security Review Findings

**Date:** 2026-07-21
**Scope:** `programs/collateral_manager/` only (`initialize`, `add_collateral`, `update_haircut`, `pause/unpause_collateral`, `update_price`, `deposit`, `withdraw`, `set_operator`, admin params + two-step ownership, `state.rs`, and the manual `invoke_signed` CPI into `perp_vault.credit/debit_collateral`)
**Method:** Solana 6-pattern vulnerability review + manual fund-flow / oracle / cross-program-trust review + adversarial verification of the raw scan findings
**Reviewer:** Claude (Opus), adversarial verifier pass

> **Scope note.** This report reviews **`collateral_manager` only**. The CPI target
> `perp_vault` (`credit_collateral` / `debit_collateral`) is the other half of the
> collateral-accounting trust model and is reviewed separately in
> `2026-07-21-perp-vault-findings.md`. Where a `collateral_manager` behavior depends on
> a `perp_vault` guard, that dependency is called out explicitly.

---

## Summary

No CRITICAL issue survives verification. The arithmetic, PDA-derivation, signer, and
two-step-ownership layers are sound; the SPL custody model (per-mint escrow PDA + per-mint
`escrow_authority` PDA signing transfers out) is correctly closed.

One **HIGH** issue survives and is the headline: **`withdraw` gates on oracle price
freshness (`StalePrice`) even though the withdrawal amount is computed from the trader's
stored `credited_usdc`, not the live price.** The staleness check is economically
unnecessary on the withdraw path and turns a stalled or censoring price-operator into a
**collateral-lockup primitive** — traders cannot retrieve their own escrowed yield tokens
while the oracle is stale, with no owner override that unsticks withdrawals specifically.

One **MEDIUM** survives: **`withdraw` couples the escrow token return to a successful
`debit_collateral` CPI**, so if the trader's `perp_vault.collateral_balance` has been drawn
down below the manager's `debit` figure (engine losses / liquidation / independent debit),
the CPI reverts and **the entire withdrawal — including the portion of collateral that is
still fully backed — is blocked**. It is an all-or-nothing coupling with no partial path.

One **MEDIUM** survives: **`set_operator` never closes the `Operator` PDA on revoke**, so
"existence == authorization" does not hold and the price-pushing operator set only ever
grows in on-chain footprint (same pattern flagged in the `perp_vault` report).

Two **LOW** issues survive (proportional-debit rounding dust that self-corrects on full
exit; `deposit` uses the trader as `init_if_needed` payer for a vault-side PDA via a
forwarded unchecked account). Several scan candidates were **rejected** as non-issues after
building the concrete derivation — notably the "cross-mint escrow confusion" and
"unvalidated `trader_balance`" angles, both closed by PDA derivation (see Verification
notes).

The core weakness class here is **oracle/operator liveness coupling to user exits**, not
authorization spoofing or math.

---

## Review — 6 patterns

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | PASS | Two CPI targets only: SPL `token::transfer` (in/out of escrow) and a **manual `invoke_signed`** into `perp_vault`. The vault program id is pinned by `constraint = vault_program.key() == config.vault_program` (`deposit.rs:67`, `withdraw.rs:70`); the discriminator is computed locally (`anchor_discriminator`), no user-supplied program is invoked. |
| 2 | Improper PDA validation | PASS | All PDAs use stored canonical bumps (`bump = *.bump` / `config.authority_bump` / `collateral.escrow_authority_bump`) or `ctx.bumps` on `init`. `collateral` and `trader_collateral` are re-derived from their own stored `mint`/`trader` and cross-locked by the escrow-authority signer (see rejected cross-mint finding). |
| 3 | Missing ownership check | PASS | Program-owned state uses `Account<'info,T>`; `has_one = owner` on every admin ix; `deposit`/`withdraw` bind `trader: Signer` and derive `trader_collateral` from `trader.key()`; `withdraw` adds `constraint = trader_collateral.trader == trader.key()`. |
| 4 | Missing signer check | PASS | `owner: Signer` + `has_one` on admin; `pending_owner: Signer` on `accept_ownership`; `operator: Signer` + `Operator.authorized` on `update_price`; `trader: Signer` on deposit/withdraw. |
| 5 | Sysvar spoofing | PASS | `Clock::get()` is read from the runtime sysvar syscall, never from a passed account; no clock/rent account is accepted as an input. |
| 6 | Duplicate mutable account | PASS | No instruction takes two `mut` accounts that can alias to the same on-chain record (deposit/withdraw each touch one `collateral`, one `trader_collateral`). |

The surviving findings are **liveness / accounting-coupling** issues that fall outside the
6 spoofing patterns, plus one operator-lifecycle hygiene issue.

---

## HIGH-1 — `withdraw` gates on price freshness it does not use, turning a stale/censoring oracle into a collateral-lockup primitive

**Location:** `programs/collateral_manager/src/instructions/withdraw.rs:92-108` (staleness
gate + debit computation); price path in `update_price.rs:33-58`.

**Description.**
`withdraw` enforces the same oracle-freshness guard as `deposit`:

```rust
let now = Clock::get()?.unix_timestamp;
require!(
    now.saturating_sub(c.last_price_update) <= c.max_price_age,
    CollateralError::StalePrice
);                                            // withdraw.rs:92-96
```

But the amount actually debited on withdrawal is computed **purely from the trader's stored
credit**, not from the live price:

```rust
let debit_u128 = (tc.credited_usdc as u128)
    .checked_mul(amount as u128)? / tc.amount as u128;   // withdraw.rs:102-105
```

`c.price` is never read on the withdraw path. The staleness gate therefore protects nothing
on withdraw (unlike deposit, where `credited` is priced live at `deposit.rs:111-116`). Its
only effect is to make **every trader's ability to exit their escrowed collateral depend on
a fresh operator price push**. Price freshness is entirely in the hands of the authorized
`update_price` operator set (`update_price.rs:22-30`); there is no permissionless price
source and no owner path that force-unsticks withdrawals while leaving the stale price in
place. (Global `pause`/`unpause` toggles `paused`, which *also* blocks withdraw via
`withdraw.rs:87` — so pausing does not help either.)

**Failure scenario.**
The single price operator for `mSOL` goes offline (key loss, infra outage, or deliberate
censorship of one trader). After `max_price_age` seconds elapse, `c.last_price_update`
becomes stale. Every `withdraw` for that collateral now reverts with `StalePrice`, even
though (a) the yield tokens are sitting in the escrow PDA, and (b) each trader's
`credited_usdc` / `amount` figures are fixed and require no price to settle. Traders cannot
retrieve their own deposited collateral until someone re-authorizes/repairs the operator and
pushes a fresh price. A malicious or compromised operator can hold the entire collateral
class hostage simply by not updating (or by getting revoked), with no admin countermeasure
that unblocks exits.

**Impact.** Indefinite lockup of user-owned escrowed collateral, gated on a liveness
assumption about a small operator set — a denial-of-withdrawal / hostage vector. No funds
are stolen, but honest depositors can be prevented from exiting for as long as the oracle is
stale. Classified HIGH because it locks user principal and the trigger (operator inaction)
is cheap and unilateral.

**Recommendation.**
Drop the staleness `require!` from the `withdraw` handler entirely — withdrawal settles
against `credited_usdc`, which is price-independent, so freshness is irrelevant to it. If a
freshness guard is desired for *deposits* only, keep it in `deposit` (where it belongs) and
leave `withdraw` able to run against the last stored price. If some price dependence on
withdraw is truly wanted later, add an owner-controlled `emergency_withdraw` /
`allow_stale_withdraw` escape hatch so users can always exit their own collateral.

---

## MEDIUM-1 — `withdraw` is all-or-nothing coupled to the vault `debit_collateral` CPI; a drawn-down `collateral_balance` blocks even the still-backed portion

**Location:** `programs/collateral_manager/src/instructions/withdraw.rs:113-126`
(debit-first CPI) and the reverting guard at `perp_vault` `collateral.rs:86`
(`require!(amount <= bal.collateral_balance, InsufficientBalance)`).

**Description.**
`withdraw` debits the vault **before** returning escrow tokens (correct CEI), and the debit
amount is derived from the manager's own `tc.credited_usdc`. But the vault's
`collateral_balance` is an **independent ledger**: `perp_vault` can reduce it via engine
settlement / liquidation / any other authorized `debit_collateral` caller. There is no
reconciliation between `collateral_manager.tc.credited_usdc` and
`perp_vault.trader_balance.collateral_balance`. If the vault balance has been drawn below the
computed `debit`, the CPI reverts with `InsufficientBalance` and the **whole withdrawal
reverts** — including any fraction of collateral that is still fully credited.

```rust
if debit > 0 {
    invoke_vault_debit_collateral(..., debit, auth_seeds)?;  // reverts whole tx if debit > vault collateral_balance
}
tc.amount = tc.amount.saturating_sub(amount);               // never reached on revert
```

**Failure scenario.**
A trader deposits 100 mSOL, `credited_usdc = 9_000`. The perp engine consumes 3_000 of that
credit as realized margin loss (`debit_collateral(3_000)` from the engine side), leaving
`collateral_balance = 6_000` at the vault while `tc.credited_usdc` in the manager is still
9_000. The trader tries to withdraw 40 mSOL: `debit = 9_000 * 40 / 100 = 3_600`, which is
`≤ 6_000`, so this happens to pass. But a withdraw of 80 mSOL computes `debit = 7_200 >
6_000` → `InsufficientBalance` → the entire withdrawal reverts, even though ~60 mSOL worth of
collateral is still fully backed. The trader has no partial-exit path other than trial-and-
error sizing, and once losses exceed the whole credit, no withdrawal of any size succeeds.

**Impact.** Users can be unable to withdraw the demonstrably-unspent portion of their
collateral because the two ledgers are compared only at the full-debit granularity of one
transaction. Not a theft; a usability/partial-lockup and accounting-divergence issue between
the two programs. MEDIUM.

**Recommendation.**
Either (a) clamp the debit to the vault's available `collateral_balance` and reconcile
`tc.credited_usdc` down accordingly (so the trader can always exit whatever is still backed),
or (b) read the vault `collateral_balance` and compute the maximum currently-withdrawable
`amount`, returning a clear `InsufficientCollateral` sized to the shortfall rather than a raw
CPI revert. At minimum document that a drawn-down `collateral_balance` intentionally locks
the corresponding fraction of escrow, and expose a view for the max withdrawable amount.

---

## MEDIUM-2 — `set_operator` never closes the `Operator` PDA on revoke ("existence == authorization" does not hold)

**Location:** `programs/collateral_manager/src/instructions/operator_admin.rs:32-46`.

**Description.**
`set_operator` uses `init_if_needed` and a write-once guard on the `operator` field:

```rust
if op.operator == Pubkey::default() {
    op.operator = operator;
    op.bump = ctx.bumps.operator_account;
}
op.authorized = status;          // revoke = flip to false, PDA stays alive
```

Revoke (`status = false`) only flips `authorized`; it never closes the account or reclaims
rent, and the `operator`/`bump` fields are permanently pinned by the write-once guard. So the
real gate is the `authorized` **flag**, not PDA existence. This is the same pattern flagged
as MEDIUM-2 in the `perp_vault` report. `update_price` correctly checks
`operator_account.authorized` (`update_price.rs:26`), so today's behavior is safe — but any
future code (or reviewer) that assumes "the `Operator` PDA exists ⇒ authorized" would treat a
revoked price operator as still authorized, re-opening the HIGH-1 oracle-control surface.
Owner-paid rent is also stranded and the derived slot for a given operator key can never be
reassigned to a fresh record.

**Failure scenario.**
Owner does `set_operator(X, true)` then `set_operator(X, false)`. The PDA for `X` remains
on-chain with `operator = X, authorized = false`. A later refactor that reintroduces a
"does the Operator PDA exist" presence check (matching an intuitive but unwritten invariant)
would silently re-authorize the revoked price operator `X`.

**Recommendation.**
Add a real revoke path using Anchor `close = owner` so revoke deletes the PDA and reclaims
rent, keeping existence and authorization in sync; or explicitly document in `state.rs` that
`authorized` is the sole gate and PDA existence is meaningless. Prefer the close path to
match Solidity-style operator revocation.

---

## LOW-1 — Proportional-debit rounding leaves dust credit on partial exits (self-corrects on full withdrawal)

**Location:** `programs/collateral_manager/src/instructions/withdraw.rs:101-108`,
state update at `:129-130`.

**Description.**
`debit = floor(credited_usdc * amount / tc.amount)` floors **down**, so a partial withdrawal
debits slightly less vault credit than the strict proportional share, leaving the trader with
marginally more `collateral_balance` per remaining token than they back. The leak is bounded
by integer dust (`< 1` USDC-unit per partial withdrawal) and **self-corrects on full exit**:
when `amount == tc.amount`, `debit = credited_usdc` exactly and `saturating_sub` zeroes the
credit. So there is no unbounded accumulation and no path to fully-unbacked withdrawable
funds via this rounding alone. Reported LOW for completeness / conservation-hygiene, not as
an exploit.

**Recommendation.**
Acceptable as-is given the exact settlement on full exit. If strict per-step conservation is
desired, round the debit **up** (`(a*b + d - 1)/d`) so the protocol is never under-debited on
a partial withdrawal.

---

## LOW-2 — `deposit` pays vault-side `init_if_needed` rent via a forwarded unchecked `trader_balance`

**Location:** `programs/collateral_manager/src/instructions/deposit.rs:75-77`
(`trader_balance: UncheckedAccount, mut`) forwarded to
`invoke_vault_credit_collateral` (`:158-168`), which lands in `perp_vault`
`CollateralOp` with `init_if_needed, payer = operator` (the CM `authority` PDA).

**Description.**
`trader_balance` is an `UncheckedAccount` in `collateral_manager`; it is not derived or
constrained here — the manager relies entirely on `perp_vault.credit_collateral` re-deriving
`[AccountBalance::SEED_PREFIX, trader.key()]` from the forwarded `trader` and initializing it
with the CM `authority` PDA as payer. Consequences: (a) the manager cannot itself detect a
wrong `trader_balance` (it trusts the vault's derivation — which does close the binding, so
no cross-trader credit is possible, see Verification notes); (b) the CM `authority` PDA funds
rent for each new vault-side `AccountBalance`, so it must stay pre-funded or deposits fail at
CPI. This is a soft coupling / rent-drain-on-authority concern rather than a fund-safety bug,
because the vault side binds `trader_balance` to `trader`.

**Recommendation.**
Optionally derive and assert the `trader_balance` PDA inside `collateral_manager` too
(defense in depth, so a vault refactor can't silently weaken the binding), and monitor the
`authority` PDA lamport balance so `credit_collateral` CPIs don't fail on rent.

---

## Informational

- **SPL custody is correctly closed.** `add_collateral` inits the escrow as a
  `token::authority = escrow_authority` PDA seeded `[b"escrow", mint]`, and `withdraw` signs
  the escrow→trader transfer with the `[b"vault", mint]` `escrow_authority` PDA using the
  **stored** `escrow_authority_bump`. A trader cannot substitute a foreign mint/escrow: the
  signer PDA is re-derived from `mint`, so a mismatched `mint` yields a wrong authority and
  the transfer fails (see rejected cross-mint finding).

- **Arithmetic is consistently checked.** `deposit` credit and `update_price` deviation use
  `u128` intermediates with `checked_pow/mul/add` mapping to `MathOverflow`; the deposit-cap
  and `supported_token_count` counters are checked. `deposit` enforces `credited > 0`
  (`DepositTooSmall`) so a dust deposit cannot credit zero while consuming a snapshot slot.
  No silent-clamp/overflow accounting bug in the math itself.

- **H-13 price-deviation bound and staleness on deposit are sound.** `update_price` bounds
  per-update deviation against `max_price_deviation_bps` (skipped only when `c.price == 0`,
  which never occurs post-`add_collateral` since `initial_price > 0` is required), respects
  global pause (N-9), and `deposit` correctly rejects stale prices where the price *is* used.

- **Two-step ownership + admin surface are sound.** `has_one = owner` on all admin ixs;
  `transfer_ownership` sets `pending_owner` (rejects `Pubkey::default()`); `accept_ownership`
  requires `pending_owner: Signer` and `key == cfg.pending_owner`, then clears it. Parameter
  bounds are enforced (`haircut ∈ [5000, BPS]`, `threshold ∈ [5000, BPS]`, `deviation ∈
  [100, 5000]`). Matches the Solidity two-step `Ownable` semantics.

- **Mapping-3 snapshot semantics are intentional.** `haircut_at_deposit` /
  `liquidation_threshold_at_deposit` are snapshotted only on the fresh-entry transition
  (`tc.amount == 0`), so top-ups inherit the existing snapshot and a full close + redeposit
  re-snapshots. This is a documented prospective-only semantic, not a bug.

---

## Verification notes (rejections / merges)

- **REJECTED — "cross-mint escrow confusion in `withdraw`."** `withdraw` does not add
  `constraint = trader_collateral.mint == mint.key()` (unlike `deposit.rs:25`). Building the
  attack: passing a `mint` different from `collateral.mint` fails because (a) `trader_collateral`
  is a PDA seeded `[b"deposit", mint, trader]` checked against its stored `bump`, so it must be
  the canonical record for *that* mint, and (b) the escrow→trader transfer is signed by the
  `escrow_authority` PDA re-derived from `mint` (`[b"vault", mint]`), which will not match the
  real escrow authority `[b"vault", collateral.mint]` unless `mint == collateral.mint`. No
  cross-mint value extraction is reachable. Left as an informational note (add the explicit
  constraint for clarity/defense-in-depth).

- **REJECTED — "unvalidated `trader_balance` lets a depositor credit another trader."** The
  manager forwards `trader_balance` unchecked, but `perp_vault.credit_collateral` re-derives
  `[AccountBalance::SEED_PREFIX, trader.key()]` from the forwarded `trader`, and the manager
  forwards the **signing** `trader` (deposit) — so the credited balance is bound to the actual
  depositor. Recorded instead as the softer LOW-2 (authority-rent / derivation-coupling).

- **REJECTED — "missing signer/authorization on `update_price`."** `update_price` requires
  `operator: Signer`, `operator_account.operator == operator.key()`, and
  `operator_account.authorized` (`update_price.rs:22-30`). Authorization is present; the real
  issue is the *downstream* lockup this operator can cause on withdraw (HIGH-1), not a missing
  check here.

- **REJECTED — "deposit/withdraw reentrancy / CEI break."** `deposit` mutates local state
  before the token transfer and vault CPI, and any CPI failure reverts the whole tx; `withdraw`
  debits the vault, then updates local state, then transfers escrow out (state-before-external
  return). No cross-program reentrancy path writes CM state after the external call within the
  same handler. CEI holds.

- **MERGED / consistent with `perp_vault` report:** MEDIUM-2 (operator PDA never closed on
  revoke) is the same lifecycle pattern flagged there; kept here because the price-operator
  set is what gates HIGH-1.
