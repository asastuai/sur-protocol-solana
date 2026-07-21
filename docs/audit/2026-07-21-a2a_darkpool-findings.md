# a2a_darkpool — Security Review Findings

**Date:** 2026-07-21
**Scope:** `programs/a2a_darkpool/` only (`post_intent`, `post_response`, `cancel_intent`, `cancel_response`, `accept_and_settle`, admin + `state.rs`)
**Method:** Solana 6-pattern vulnerability review + manual fund-flow / authority review + adversarial verification of the raw scan findings
**Reviewer:** Claude (Opus), adversarial verifier pass

> **Scope note.** This report reviews **`a2a_darkpool` only** — the OTC matcher that
> negotiates intents/responses and, at settlement, drives `perp_engine.open/reduce/close_position`
> and `perp_vault.internal_transfer` via manual `invoke_signed` CPIs signed by the
> `darkpool_authority` PDA. The two callee programs (`perp_engine`, `perp_vault`) enforce
> their own operator/authority checks and are reviewed separately
> (`2026-07-21-perp-engine-findings.md`, `2026-07-21-perp-vault-findings.md`). Findings here
> concern only what this program controls.

---

## Summary

The negotiation surface (`post_intent` / `post_response` / cancels) is **sound**: PDAs are
canonically derived, status/expiry/self-trade/price-range/cooldown guards are present, and
arithmetic is consistently checked. The settlement path (`accept_and_settle`) is where the
risk concentrates, and its **value-bearing** accounts are well bound (audit C-1 / N-11
"Gate 0b" derives the expected buyer/seller/fee-recipient balance PDAs and the market PDA
from `config.perp_vault` / `config.perp_engine` and requires the passed keys to match).

One **MEDIUM** issue survives verification and is the headline: the settlement CPIs invoke
`perp_engine_program` and `perp_vault_program` as **attacker-supplied `UncheckedAccount`s
whose program ids are never checked against `config.perp_engine` / `config.perp_vault`.**
A permissionless caller can therefore make the `darkpool_authority` PDA sign an
`invoke_signed` into an **arbitrary program**. Direct fund theft is blocked by the fact that
a PDA signature does not propagate past one CPI hop (the fake program cannot re-sign as
`darkpool_authority`), which is why this is MEDIUM not CRITICAL — but it is a genuine
arbitrary-CPI / missing-program-id validation, and it is one hardening slip (a downstream
program that trusts *being called by* the darkpool authority) away from being worse.

One **MEDIUM** issue: settlement reads the callee `Market` / `Position` layouts by
**hard-coded raw byte offsets** (`data[82..90]` for `last_price_update`, `data[73..81]` for
`Position.size`) with only a length check. A layout change in `perp_engine` silently
desynchronizes the freshness gate and the open/reduce/close routing.

Two **LOW** issues (settlement missing a re-check of `response.price` against the *current*
intent bounds — safe today because both are immutable, kept as a defensive note; and the
lack of a `paused`-independent kill on the raw cross-program decode). Several negotiation-path
confirmations are recorded as Informational. No CRITICAL survived; the price-drain and
self-trade classes were verified **closed**.

---

## Review — 6 patterns

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | **FAIL (program id unbound)** | `accept_and_settle` builds `Instruction { program_id: perp_engine_program.key() / perp_vault_program.key() }` and `invoke_signed`s as `darkpool_authority`, but **never** constrains those two `UncheckedAccount`s to `config.perp_engine` / `config.perp_vault` (MED-1). |
| 2 | Improper PDA validation | PASS | `config`, `intent`, `response`, both reputations, `freshness_config` use stored canonical bumps; `intent`/`response` seeds bind `id`; Gate-0b re-derives value PDAs from `config.*` and asserts equality (`accept_and_settle.rs:232-256`). |
| 3 | Missing ownership check | PASS | `intent.agent == intent_creator.key()`; balances/market bound to resolved buyer/seller/fee-recipient; reputations seeded by `intent.agent` / `response.agent`. No spoofable owner input on value accounts. |
| 4 | Missing signer check | PASS | `intent_creator: Signer` gates settle; `agent`/`responder: Signer` on post/cancel; admin via `has_one = owner`; two-step ownership (`pending_owner: Signer`). |
| 5 | Sysvar spoofing | PASS | Time from `Clock::get()?` (syscall), not a passed account. Market price vintage is read from the (Gate-0b–bound) `engine_market` PDA, not a sysvar. |
| 6 | Duplicate mutable account | PASS (this program) | Self-trade is blocked (`intent.agent != responder`, plus `buyer_trader/seller_trader` equality checks), so buyer/seller balance PDAs differ. Any `from == to` aliasing in the fee legs is the **vault's** guard, not this program's (see perp-vault report). |

---

## MEDIUM-1 — Settlement CPIs invoke `perp_engine_program` / `perp_vault_program` without checking them against the config (arbitrary CPI, PDA signature)

**Location:** `programs/a2a_darkpool/src/instructions/accept_and_settle.rs` — accounts
`perp_engine_program:107`, `perp_vault_program:137` (both `UncheckedAccount`, no `address =`
constraint); use sites `route_engine_trade`/`invoke_engine_open_position` (`:433-477`),
`invoke_engine_reduce_or_close` (`:598-637`), `invoke_vault_internal_transfer` (`:655-679`);
the Gate-0b block that binds *data* accounts but **not** the program accounts (`:232-256`).

**Description.**
`AcceptAndSettle` accepts the callee program ids as plain `UncheckedAccount`s supplied by the
permissionless `intent_creator`. The CPI builders set
`program_id: perp_engine_program.key()` / `perp_vault_program.key()` and `invoke_signed(..,
&[auth_seeds])` where `auth_seeds = [b"darkpool_authority", &[bump]]`. Nowhere does the
handler assert `perp_engine_program.key() == config.perp_engine` or
`perp_vault_program.key() == config.perp_vault`. The Gate-0b block (`:232-256`) *does* validate
the value-bearing **data** accounts — but it does so by calling
`Pubkey::find_program_address(.., &config.perp_engine / &config.perp_vault)`; it validates the
PDAs' derivation program, not the program account that actually gets invoked. So the invoked
program id is fully attacker-controlled while the darkpool authority still signs.

**Failure scenario.**
The intent creator (already the required signer) submits `accept_and_settle` with
`perp_engine_program = attacker_program` (and/or `perp_vault_program = attacker_program`) plus
whatever remaining accounts that program wants. `route_engine_trade` `invoke_signed`s into
`attacker_program` with `darkpool_authority` marked signer. The attacker program now runs with
a valid `darkpool_authority` signature in its instruction context.

**Impact.**
Bounded but real. Because Solana PDA signatures **do not propagate past a single CPI hop**, the
attacker program cannot re-`invoke_signed` as `darkpool_authority` into the *real* vault/engine
(it lacks the seeds — only `a2a_darkpool` holds them), so there is **no direct drain of vault
funds today**. The concrete damage is: (a) settlement status is flipped
(`intent = Filled`, `response = Accepted`) and reputation is bumped for a trade that never
actually opened positions or moved margin — corrupting on-chain reputation and off-chain
settlement accounting; (b) the darkpool authority's lamports (it is `mut`, the rent payer) are
exposed to an attacker program that can request rent/transfers within its own logic; (c) it is a
latent full-severity bug against any future or sibling program that grants privilege based on
*being invoked by* `darkpool_authority`. This is a textbook "unvalidated program account in a
CPI" and should be closed regardless of the current non-propagation mitigation.

**Recommendation.**
Constrain both program accounts to the config, declaratively:

```rust
/// CHECK: perp_engine program id.
#[account(address = config.perp_engine @ DarkPoolError::InvalidAccount)]
pub perp_engine_program: UncheckedAccount<'info>,
/// CHECK: perp_vault program id.
#[account(address = config.perp_vault @ DarkPoolError::InvalidAccount)]
pub perp_vault_program: UncheckedAccount<'info>,
```

(or an equivalent `require!(...key() == config.perp_engine)` at the top of the handler). Also
consider binding `engine_config` / `vault_config` / the operator PDAs the same way, so the
whole callee wiring is anchored to `config`, not to caller discretion.

---

## MEDIUM-2 — Settlement decodes callee `Market` / `Position` by hard-coded raw byte offsets (cross-program layout coupling)

**Location:** `programs/a2a_darkpool/src/instructions/accept_and_settle.rs:187-202`
(`engine_market` → `last_price_update` at `data[82..90]`, length gate `>= 90`) and
`read_position_size` (`:483-488`, `Position.size` at `data[73..81]`, length gate `>= 81`).

**Description.**
The freshness gate (`f_i`) and the open/reduce/close routing both depend on reading a callee
program's account by **fixed byte offset**, guarded only by a minimum-length check and a
comment describing the assumed layout (`8 disc +1 bump +32 market_id +1 active +8·3 margins +8
mark +8 index → last_price_update @ 82`; `8 disc +1 bump +32 market_id +32 trader →
size @ 73`). There is no discriminator check on the decoded account and no shared type import —
the coupling is purely positional. `engine_market` is bound to the right PDA (Gate-0b), so it is
the *correct* account, but its **layout** is assumed, not verified.

**Failure scenario.**
`perp_engine` reorders or resizes any field before `last_price_update` / `size` (e.g. inserts a
field after `market_id`, widens a margin field, adds an enum tag). `a2a_darkpool` — deployed
independently, "swap them without code redeploy" per `state.rs:40-43` — keeps reading the old
offsets. The freshness gate then compares against garbage: it can read a bogus
`last_price_update` that is far in the past (settlement wrongly **rejected**, DoS) or spuriously
"fresh"/future (freshness gate defeated, or `FuturePrice` false-trips). `read_position_size`
mis-parsing flips a same-sign increase into a spurious reduce/flip route (wrong engine ix,
wrong margin settlement direction). Length checks (`>= 90` / `>= 81`) do not catch a *reorder*.

**Impact.**
Medium. Not directly exploitable while both programs ship the current layout, but it is a silent
cross-program invariant: an independent `perp_engine` upgrade can break settlement correctness
or the entire freshness security property with no compile-time or run-time signal in this
program. Given the design explicitly supports swapping `perp_engine` via config without
redeploy, the coupling is a live operational hazard.

**Recommendation.**
Verify the account discriminator before decoding (assert the first 8 bytes match
`perp_engine`'s `Market` / `Position` sighash), and centralize the offsets as named constants
adjacent to a documented, versioned layout — or, preferably, import the callee account type and
deserialize it properly. At minimum, add a layout-version byte to the callee accounts and check
it here. Pair any `perp_engine` state change with a required bump of a shared layout constant so
the coupling fails loudly.

---

## LOW-1 — Settlement does not re-validate `response.price` against the intent's price band

**Location:** `programs/a2a_darkpool/src/instructions/accept_and_settle.rs:208` (`price =
response.price`, used for notional/fee and forwarded as `fill_price`); band is checked only at
`post_response.rs:82-85`.

**Description.**
`accept_and_settle` settles at `response.price` and never re-asserts
`intent.min_price <= response.price <= intent.max_price`. This is **safe today**: the band is
validated when the response is created, and both `Intent` (`min_price`/`max_price`) and
`Response.price` are immutable after init — there is no instruction that mutates them. So no
current path lets a response settle outside the band it was validated against.

**Failure scenario (defensive only).**
Any future edit that (a) makes intent bands mutable (e.g. an "amend intent" ix) or (b) adds a
response-repricing path would let a stale response settle outside the current band, and the
settlement path would not catch it. There is no independent guard at the point where the price
actually moves money.

**Impact.** None today; a latent correctness gap if immutability assumptions change.

**Recommendation.**
Add a cheap re-assertion in `accept_and_settle` before computing notional:
`require!(response.price >= intent.min_price && response.price <= intent.max_price,
DarkPoolError::PriceOutOfRange);`. It is O(1) and makes the settlement self-defending against
future mutability.

---

## LOW-2 — Settlement freshness gate has no independent circuit breaker distinct from `paused`

**Location:** `accept_and_settle.rs:157` (`require!(!config.paused)`) and the freshness block
(`:180-203`).

**Description.**
The only kill switch over settlement is the global `config.paused`. The proof-of-context
freshness gate depends on the raw cross-program decode (MED-2) and on `freshness_config`
having been initialized. If the callee layout drifts (MED-2) such that settlements wrongly pass
the freshness check, the owner's only response is a full `pause()` of the whole program.

**Impact.** Low; operational. Coupled to MED-2.

**Recommendation.**
Consider a settlement-specific pause flag, and/or treat a failed/implausible price read
(e.g. `last_price_update <= 0`, or wildly out of range) as a hard reject rather than relying on
the arithmetic comparisons alone.

---

## Informational

- **Negotiation path is sound.** `post_intent` validates `size > 0`, `min_price <= max_price`,
  duration bounds, and the large-trade reputation gate; `post_response` validates intent Open +
  not expired, self-trade (`intent.agent != responder`), price band, cooldown
  (`last_response_time + response_cooldown`), positive duration. Intent/response ids come from
  monotonic `config.next_*_id` counters seeded into the PDA — not caller-controlled. Reputation
  `init_if_needed` uses the write-once `agent == default` guard before setting `agent`/`bump`.
  Reviewed and found correct.

- **Gate-0b value binding is the right fix and is present.** The audit C-1 fee-leg / N-11
  substitution class (a permissionless `intent_creator` swapping in a victim's balance PDA or a
  wrong market to drain fees) is **closed**: `accept_and_settle.rs:232-256` re-derives
  `buyer_balance`, `seller_balance`, `fee_recipient_balance` from `config.perp_vault` and
  `engine_market` from `config.perp_engine`, and requires equality. The market PDA is
  additionally bound in the freshness block (`:181-186`). Verified closed.

- **CEI ordering + status flips.** Statuses flip to `Filled` / `Accepted` **before** the engine
  and vault CPIs (`:259-261`), and both accounts are re-derivable-only PDAs whose status
  constraints (`IntentStatus::Open`, `ResponseStatus::Pending`) gate entry — so a settled
  intent/response cannot be re-entered. Reputation update and event emission are last. Sound.

- **Arithmetic is consistently checked.** Notional/fee use `checked_mul` with `u128`
  intermediates and `try_into` to `u64` mapped to `MathOverflow` (`:264-277`); `next_*_id`,
  `expires_at`, and position `new_size` use `checked_add`; reputation accumulators use
  `saturating_*` (monotonic counters, intended). No silent-clamp accounting bug. `get_score`
  divides only after a `total == 0` guard.

- **`darkpool_authority` signing is correct.** The PDA is derived with `ctx.bumps` (canonical)
  and signs CPIs with `[b"darkpool_authority", &[bump]]`. The design correctly documents that
  it must be pre-registered as operator on both callees and pre-funded (it is the `mut` rent
  payer for `init_if_needed` positions). No stored-bump mismatch.

- **`fee_per_side == 0` skips the fee legs** (`:339`), avoiding a zero-amount vault CPI — fine.

---

## Verification notes (rejections / merges)

- **REJECTED — "settlement can be front-run / any caller can accept a response."** Not an issue:
  `accept_and_settle` requires `intent_creator: Signer` **and** `intent.agent ==
  intent_creator.key()` (`:64,93`). Only the intent's own agent can accept. No permissionless
  accept exists.

- **REJECTED — "self-trade at settlement."** `post_response` blocks `intent.agent ==
  responder` (`:78-81`), and settle asserts `buyer_trader == buyer` / `seller_trader == seller`
  (`:218-225`) where buyer/seller are the two distinct agents. The `SelfTrade` error name on
  those asserts is about param/side consistency, and the underlying parties are already distinct.
  No mint/aliasing path in this program.

- **REJECTED — "price can be settled outside the intent band."** Verified **safe today**
  because `Intent` bounds and `Response.price` are immutable post-init; downgraded to the
  defensive LOW-1 note rather than a live finding.

- **REJECTED — "reputation PDAs are spoofable."** `intent_creator_reputation` /
  `responder_reputation` are seeded by `intent.agent` / `response.agent` with stored bumps
  (`:78-90`) — canonical, not caller-chosen.

- **MERGED into MED-1:** the separate "engine_config / operator PDAs are UncheckedAccount"
  observations — same root cause (callee wiring anchored to caller input rather than `config`)
  and same fix (`address = config.*` binding).
