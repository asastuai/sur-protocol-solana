# order_settlement — Security Review Findings

**Date:** 2026-07-21
**Scope:** `programs/order_settlement/` only (`settle_one` + `settle_trade_inner`, `commit_order`, `set_operator`, admin, `cpi_util.rs`, `signature.rs`, `state.rs`)
**Method:** Solana 6-pattern vulnerability review + manual fund-flow / authority / CPI-forwarding review + adversarial verification of the raw scan findings
**Reviewer:** Claude (Opus), adversarial verifier pass

> **Scope note.** This report reviews **`order_settlement` only** — the off-chain
> matcher's on-chain executor. It *calls into* `perp_vault` (`internal_transfer`,
> for fees) and `perp_engine` (`open_position` / `reduce_position` / `close_position`,
> for margin + PnL). Those callee programs are reviewed separately
> (`2026-07-21-perp-vault-findings.md`, `2026-07-21-perp-engine-findings.md`).
> Several findings here are **contingent on the callee re-validating** the accounts
> this program forwards without independent constraint; that dependency is called
> out explicitly per-finding.

---

## Summary

**No CRITICAL or HIGH survived adversarial verification.** The two structurally
dangerous vectors an order-settlement layer usually exposes — (a) an operator
settling a self-signed throwaway order while pointing `maker_balance`/`taker_balance`
at a **victim's** vault balance to debit their margin, and (b) signature/nonce replay
— are both **closed** in this code:

- **Gate 0c** (`settle_trade_inner:224-252`) binds `maker_trader`/`taker_trader` to the
  ed25519-signed `maker.trader`/`taker.trader`, and re-derives `maker_balance`,
  `taker_balance`, `fee_recipient_balance` via `find_program_address([b"balance", trader], perp_vault_program)`
  against the **config-stored** vault program. An operator cannot substitute a victim's
  balance PDA — the derivation is anchored to the signed trader identity.
- **ed25519 + Sysvar<Instructions>** verification (`signature.rs`) uses the canonical
  precompile-walk pattern with the `0xFFFF` self-reference guard, so message/pubkey
  bytes cannot be aimed at an unverified sibling instruction.
- **Replay** is closed by the per-`(trader,page)` `NoncePage` bitmap with **CEI ordering**
  (nonces `set` *before* the external CPIs, `settle_trade_inner:287-288`) and a
  `bind_or_check_page` trader/page-index cross-check.

What survives is one **MEDIUM** fee-integrity issue (`engine_market` is forwarded and
**read raw for the dynamic-spread fee computation** with no binding to the trade's
`market_id`), plus **LOW** issues (operator-as-payer for `init_if_needed` nonce/snapshot
PDAs; revoke never closes the Operator PDA; several engine-side accounts forwarded
unvalidated relying wholly on callee checks) and informational notes (a 137-vs-145
byte message-length doc mismatch; raw fixed-offset reads of foreign account layouts).

The arithmetic layer (checked mul/add, `u128` intermediates for notional/fees, `try_into`
back to `u64` mapping overflow to `MathOverflow`) was reviewed and is sound.

The dominant residual trust assumption is the **single trusted settlement operator set**
(`Operator.authorized`), identical in spirit to the Solidity original's `onlyOperator`.

---

## Review — 6 patterns: PASS, with one fee-integrity FAIL on an unbound forwarded account

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | PASS | Every CPI target program is pinned to config: `perp_engine_program.key() == config.perp_engine_program` (`settle.rs:71`) and `perp_vault_program.key() == config.perp_vault_program` (`:104`). `cpi_util` builds the instruction with `program_id: perp_*_program.key()` — the pinned key. No user-supplied program invoked. |
| 2 | Improper PDA validation | PASS (with fragility) | `config`, `authority`, `maker/taker_nonce_page`, `snapshot`, `operator_account` all use canonical seeds + stored/`ctx.bumps`. Vault balance PDAs are re-derived from the signed trader (Gate 0c). **But** `engine_market`, `maker/taker_position`, `engine_authority`, `engine_vault_operator`, `engine_pool_balance` are `UncheckedAccount` with **no** constraint (LOW-2 — relies on callee). |
| 3 | Missing ownership check | PASS | Program-owned state is `Account<'info,T>` (discriminator+owner checked). Foreign accounts read raw (`read_position_size`, `compute_dynamic_spread_extra`, `read_snapshot_if_present`) guard on `owner == program_id` (snapshot) or length, and are otherwise re-validated by the callee. |
| 4 | Missing signer check | PASS | `operator: Signer` + `Operator` PDA `authorized @ NotOperator` on `settle_one`/`commit_order`; `has_one = owner @ NotOwner` on all admin; two-step ownership (`transfer_ownership` → `accept_ownership` with `pending_owner: Signer`). Authority PDA CPI signer via `invoke_signed(auth_seeds)`. |
| 5 | Sysvar spoofing | PASS | `instructions_sysvar` pinned `address = INSTRUCTIONS_SYSVAR_ID` (`settle.rs:131`, `commit_order.rs:39`) **and** re-checked `*key == sysvar_instructions::ID` inside `verify_ed25519_for_order` (`signature.rs:104`). `Clock::get()` read from the real sysvar, never a passed account. |
| 6 | Duplicate mutable account | PASS (this program) | No two program-owned `mut Account<T>` alias here. `maker_nonce_page`/`taker_nonce_page` distinctness is enforced structurally: their seeds embed `maker.trader` vs `taker.trader`, and `SelfTrade` (`:169`) rejects `maker.trader == taker.trader`, so the two pages can never resolve to the same PDA. Fee/margin aliasing lives in the **callee** `perp_vault.internal_transfer` (covered in the vault report's CRITICAL-1). |

---

## MEDIUM-1 — `engine_market` is forwarded and read raw for dynamic-spread fees with no binding to the trade's `market_id`

**Location:** `programs/order_settlement/src/instructions/settle.rs:76-78` (unconstrained
account), `:339-357` (fee read), `compute_dynamic_spread_extra` `:598-654`; also forwarded
into the engine CPI at `:341,350,431,450`.

**Description.**
`engine_market` is declared `#[account(mut)] pub engine_market: UncheckedAccount<'info>`
with **no constraint** tying it to `config`, to the callee's canonical market PDA, or to
the `maker.market_id`/`taker.market_id` the two orders actually signed. The handler then
**reads this attacker-selectable account raw** in `compute_dynamic_spread_extra`, pulling
`oi_long`/`oi_short` from fixed byte offsets 90/98 to decide the dynamic-spread surcharge
`extra_bps` that is added to the taker fee (`settle.rs:363-367`). Because the account is
unbound, a settlement operator can pass **any** account whose bytes at those offsets yield
a skew that returns `extra_bps == 0` (e.g. a market with balanced or empty OI, or a
crafted account), suppressing the intended dynamic surcharge and under-charging the taker
fee. The `market_id` cross-check that exists (`maker.market_id == taker.market_id`,
`:170`) constrains the two **orders** to each other but **not** the `engine_market`
account to that id.

Mitigating factors (why MEDIUM, not HIGH):
- The **same** `engine_market` is forwarded into the `perp_engine` open/reduce/close CPI
  (`:341` etc.). If — and only if — the engine validates that this market account is the
  canonical PDA for the position's `market_id`, then passing a *wrong* market makes the
  **engine CPI fail**, which would abort the whole settle. Under that assumption the read
  is forced onto the correct market and the attack collapses to "operator picks a valid
  market" (no freedom). This finding's exploitability is therefore **contingent on the
  engine NOT binding market↔position** for at least one of the routed instructions.
- The beneficiary of a suppressed surcharge is the taker, and the loss is *protocol fee
  revenue*, not user principal. Operator is trusted.

**Failure scenario.**
Engine's `reduce_position`/`close_position` (the paths a shrinking/flipping delta takes,
`route_engine_trade:531`) do **not** re-derive `market` from the position's `market_id`
(plausible: those ixs take `market` as a passed mut account). A settlement operator settles
a taker order that *should* incur a tier-3 spread surcharge, but forwards a low-skew
`engine_market` to `settle_one`. `compute_dynamic_spread_extra` returns `0`; `taker_fee`
is computed at base bps only; the engine CPI accepts the mismatched market. Protocol
under-collects the dynamic-spread fee on every such trade.

**Impact.** Dynamic-spread fee suppression → protocol fee under-collection. Bounded by the
tier-3 bps cap per trade; no principal loss. Additionally the fixed-offset raw read
(offsets 90/98) is **layout-coupled** to `perp_engine::Market` — a future field reordering
in the engine silently changes what `oi_long`/`oi_short` decode to here, with only a length
guard (`data.len() < oi_short_off + 8`) as protection.

**Recommendation.**
Bind `engine_market` before reading it: add
`constraint = engine_market.key() == Pubkey::find_program_address(&[b"market", maker.market_id.as_ref()], &config.perp_engine_program).0`
(matching the engine's canonical market seed), or pass the expected market PDA through
config. This anchors both the fee read and the forwarded CPI account to the signed
`market_id`. Longer term, prefer having the engine return the OI (or expose a typed read)
rather than decoding a sibling program's account at hardcoded offsets.

---

## LOW-1 — Several engine-side accounts are forwarded unvalidated, relying entirely on callee checks

**Location:** `programs/order_settlement/src/instructions/settle.rs:79-100`
(`maker_position`, `taker_position`, `engine_authority`, `engine_vault_operator`,
`engine_pool_balance` — all `UncheckedAccount`, only the three `*_program`/`*_config`/`*_operator_account`
peers are constrained).

**Description.**
Unlike the vault balance accounts (bound by Gate 0c) and the pinned program/config/operator
accounts, `maker_position`, `taker_position`, `engine_authority`, `engine_vault_operator`,
and `engine_pool_balance` carry **no on-struct constraint**. They are read raw
(`read_position_size` for the open-vs-reduce dispatch, `route_engine_trade:506`) and
forwarded verbatim into the engine CPI. Correctness of the **dispatch decision** (open vs
reduce vs close) depends on `maker_position`/`taker_position` being the *genuine* position
for that trader+market: an operator who forwards a stale or wrong-position account can steer
the router to call `open_position` (margin-lock inbound) where a `reduce_position`
(settle-outbound) was warranted, or vice-versa. The engine CPI is expected to reject a
position that does not match the trader/market, which would abort the settle — so the
concrete damage is again **contingent on the engine binding `position ↔ (trader, market)`**.

This is defense-in-depth: order_settlement makes a **local control-flow decision**
(`route_engine_trade`) off an **unvalidated** raw read, then trusts the callee to catch a
mismatch. If the callee's binding is ever weakened, the router's decision becomes
attacker-controlled.

**Failure scenario.**
Operator forwards `taker_position = some_other_zero/uninit_account`; `read_position_size`
returns `0`; router picks `open_position` (fresh open, margin-lock) even though the taker
was flipping an existing position that should have settled PnL outbound. If the engine does
not reject the substituted position, margin accounting desyncs.

**Recommendation.**
Re-derive and constrain the position PDAs from the signed identities:
`constraint = maker_position.key() == find_program_address([b"position", engine_market.key()|market_id, maker.trader], perp_engine_program).0`
(matching the engine's position seed), and pin `engine_authority`/`engine_vault_operator`/`engine_pool_balance`
to config-stored values the way `engine_operator_account` already is. This makes the local
dispatch read trustworthy independent of the callee.

---

## LOW-2 — `set_operator` never closes the Operator PDA on revoke (stranded rent, write-once operator field)

**Location:** `programs/order_settlement/src/instructions/operator_admin.rs:32-46`.

**Description.**
`set_operator(operator, status=false)` flips `op.authorized = false` via `init_if_needed`
but **never closes** the PDA. The `if op.operator == Pubkey::default()` guard (`:39`) makes
`operator` and `bump` write-once. So the authorization model is purely the `authorized`
**flag** (correctly enforced by the `authorized @ NotOperator` constraint at
`settle.rs:29` / `commit_order.rs:34`). Unlike the sibling `perp_vault` finding, `state.rs`
here carries **no** "existence == authorization" comment, so there is no contradicted
invariant — the residual issues are only (a) owner-paid rent stranded in a never-reclaimed
account on revoke, and (b) the `operator` field can never be reassigned for that PDA slot.
Verified-safe corollary: because `operator` is write-once and `authorized` is re-checked on
every use, `init_if_needed` cannot be abused to re-init an existing operator to a different
key or silently re-authorize.

**Failure scenario.**
Owner does `set_operator(X, true)` then `set_operator(X, false)`. The PDA persists with
`operator=X, authorized=false`; rent is stranded. No authorization is wrongly granted (the
flag governs).

**Recommendation.**
Add a `close_operator` path using Anchor `close = owner` to reclaim rent on permanent
revoke, or accept the stranded rent and document that `authorized` is the sole gate.

---

## LOW-3 — Operator funds `init_if_needed` rent for arbitrary trader nonce-page and snapshot PDAs

**Location:** `programs/order_settlement/src/instructions/settle.rs:43-67`
(`maker_nonce_page`/`taker_nonce_page`, `payer = operator`);
`commit_order.rs:42-49` (`snapshot`, `payer = operator`).

**Description.**
Both `settle_one` (nonce pages) and `commit_order` (snapshot) use `init_if_needed,
payer = operator`. The operator therefore funds rent to create PDAs keyed by
attacker-influenced seeds (the signed trader / the commit hash). Because a **valid
ed25519 signature over the order is required** before these accounts are meaningfully used,
an attacker cannot force page creation for a victim without the victim's signature — the
griefing surface is limited to the operator's own rent for orders it chooses to process,
and re-init is neutralized by the `page.trader == default` / `snap.commit_time != 0`
write-once guards. This is a minor rent-griefing / operational-cost note, not a fund vector.

**Recommendation.**
Acceptable under the trusted-operator model. If tightening: cap or meter operator-funded
PDA creation, or require the trader to pre-fund their own nonce pages.

---

## Informational

- **Gate 0c is the load-bearing control and is correct.** `settle_trade_inner:224-252`
  binds `maker_trader`/`taker_trader` to the signed `maker.trader`/`taker.trader` and
  re-derives all three vault balance PDAs (`maker`, `taker`, fee recipient) from those
  identities against the **config-stored** `perp_vault_program`. This is the fix that
  closes the "operator settles a self-signed order against a victim's balance" (audit N-3)
  vector. Keep it in lock-step with any change to the vault's `balance` seed
  (currently `[b"balance", trader]`). If the vault seed ever changes, this derivation must
  change with it or every settle reverts (fail-safe) — or worse, if loosened, mis-binds.

- **ed25519 verification is the canonical safe pattern.** `ix_matches` only accepts
  offset entries with `sig_ix == pk_ix == msg_ix == 0xFFFF` (data resident in the same
  precompile ix), rejecting attempts to point the pubkey/message at an unverified sibling
  instruction, and bounds-checks every offset before slicing. Signer + full message
  (incl. domain separator binding program_id + cluster_id) are compared. No echo of the
  signature into ix data. Reviewed and sound.

- **Replay + CEI ordering are correct.** Nonces are marked (`set`) at `:287-288`, **before**
  any fee or engine CPI (`:380+`), so a re-entrant or failed downstream CPI cannot enable
  a replay within the same nonce. `bind_or_check_page` binds `(trader, page_index)` on
  first use and equality-checks thereafter; `is_set` is checked pre-mark. `SelfTrade`
  guarantees maker/taker pages are distinct PDAs.

- **Arithmetic is consistently checked.** Notional and fees use `u128` intermediates with
  `checked_mul`, divide by `SIZE_PRECISION`/`BPS`, then `try_into::<u64>()` mapping overflow
  to `MathOverflow` (`:325-374`); `batch_counter` uses `checked_add`; `exec_size_i64` and
  `read_position_size` new-size use `checked_add` / `i64::try_from`. No silent clamp/saturate
  in accounting (the only `saturating_sub` uses are on *time* deltas for delay checks, which
  is the safe direction). No overflow/underflow accounting bug found.

- **Message-length doc mismatch (cosmetic).** `lib.rs:12` says "canonical **145**-byte
  message layout"; `signature.rs:1-20` header and `ORDER_MESSAGE_LEN` compute **137**
  (`32+32+32+1+8+8+8+8+8`). The code is internally consistent at 137; only the `lib.rs`
  doc comment is stale. Fix the comment to avoid a future integrator hard-coding 145.

- **Foreign-layout raw reads are offset-coupled.** `read_position_size` (offset 73),
  `compute_dynamic_spread_extra` (offsets 90/98), and `read_snapshot_if_present`
  (own-program, discriminator-checked — safe) decode sibling-program accounts at hardcoded
  offsets. Only `read_snapshot_if_present` verifies `owner == program_id` + discriminator;
  the two engine reads rely on length guards + the callee re-validating the same account.
  Any perp_engine `Position`/`Market` field reordering silently changes these decodes.
  Add a shared layout constant or a typed cross-program read to make the coupling explicit.

---

## Verification notes (rejections / merges)

- **REJECTED — "operator can debit a victim's margin by passing the victim's balance PDA
  as maker/taker_balance."** Not exploitable: Gate 0c (`settle.rs:224-252`) re-derives
  `maker_balance`/`taker_balance`/`fee_recipient_balance` from the **ed25519-signed** trader
  identities against the config-pinned vault program and `require!`s equality. A substituted
  victim balance fails `AccountMismatch`. This is the closed N-3 vector.

- **REJECTED — "signature/nonce replay across settles."** Not exploitable: per-`(trader,page)`
  `NoncePage` bitmap, `is_set` pre-check, `set` under CEI before CPIs, `bind_or_check_page`
  trader/page binding. A reused nonce hits `NonceAlreadyUsed`.

- **REJECTED — "arbitrary CPI into an attacker program."** Not exploitable: both callee
  programs are pinned to config-stored ids and the CPI `program_id` is that pinned key.

- **REJECTED — "duplicate mutable nonce-page aliasing mints/skips a nonce."** Not
  exploitable in this program: `SelfTrade` forces `maker.trader != taker.trader`, and the
  page seeds embed the trader, so `maker_nonce_page` and `taker_nonce_page` are always
  distinct PDAs. (The genuine duplicate-mutable class lives in the callee `perp_vault`, not
  here.)

- **REJECTED — "sysvar spoofing on `instructions_sysvar`."** Not exploitable: pinned via
  `address = INSTRUCTIONS_SYSVAR_ID` on the struct **and** re-checked inside
  `verify_ed25519_for_order`.

- **DOWNGRADED to MEDIUM-1 — "unvalidated `engine_market`."** Real (fee suppression + raw
  read), but contingent on the engine not binding market↔position and bounded to protocol
  fee revenue, so not HIGH under the trusted-operator + callee-revalidation model.

- **MERGED into LOW-1** — the several individual "unvalidated forwarded engine account"
  observations (positions, engine_authority, engine_vault_operator, engine_pool_balance):
  same root cause (no on-struct constraint, relies on callee) and same fix (re-derive/pin).
