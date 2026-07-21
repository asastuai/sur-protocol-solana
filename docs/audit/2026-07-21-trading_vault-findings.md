# trading_vault — Security Review Findings

**Date:** 2026-07-21
**Scope:** `programs/trading_vault/` only (`deposit`, `withdraw`, `manager_open_position`, `manager_close_position`, `equity.rs`, `fees.rs`, `cpi_util.rs`, admin/vault_admin + `state.rs`)
**Method:** Solana 6-pattern vulnerability review + manual fund-flow / equity-accounting / authority review + adversarial verification
**Reviewer:** Claude (Opus), adversarial verifier pass

> **Scope note.** This report reviews **`trading_vault` only** — the HLP-style pooled
> vault layer. It composes over `perp_vault` (custody of USDC balances) and
> `perp_engine` (positions/margin) via manual `invoke_signed` CPIs. Those two callee
> programs are reviewed separately (`2026-07-21-perp-vault-findings.md`,
> `2026-07-21-perp-engine-findings.md`). Findings here are scoped to what
> `trading_vault` itself must enforce; where a root cause lives in a callee it is
> noted as a cross-program dependency, not double-counted.

---

## Summary

The vault's arithmetic, share math, fee accrual, drawdown auto-pause, two-step ownership,
and PDA/bump handling are sound and closely mirror the Solidity source. The custody model
is also stronger than `perp_vault`'s: `TradingVaultConfig` stores explicit
`perp_vault_program` / `perp_engine_program` identities and the exact operator-account
pubkeys, and every callee account is constrained (`constraint = x.key() == config.x`) so
the manager/depositor cannot substitute a rogue program or config.

The weakness is **equity accounting integrity**, and it is severe.

One **CRITICAL** issue survives verification and is the headline: `compute_vault_equity`
trusts the **caller-supplied** `remaining_accounts` list of `(Position, Market)` pairs to
be the *complete and non-duplicated* set of the vault's open positions. It validates each
supplied pair (owner, `market_id` match, `trader == vault_pda`) but never checks that
**all** of the vault's positions are present, nor that a position appears **at most once**.
Because the depositor/withdrawer controls that list, they can bias equity up or down at
will — minting excess shares on deposit or over-withdrawing USDC — with no operator key
required. This is a direct theft-from-the-pool primitive.

One **HIGH** survives: `deposit` never binds `depositor_balance` (the perp_vault USDC
source) to the signing `depositor`. Since the trading_vault `authority` is a registered
perp_vault operator, the deposit CPI can move **any** trader's perp_vault balance into the
vault while crediting the *attacker's* share PDA — spending a third party's funds to buy
the attacker vault shares.

One **MEDIUM** survives: the drawdown auto-pause in `manager_open_position` is evaluated on
the same caller-supplied equity, so a manager can mask a drawdown breach (or force one) by
choosing which positions to present. Two **LOW** items (init_vault_balance / balance-PDA
front-running griefing; `read_position_size` fail-open to `0`) and several informational
confirmations round out the report. Three candidate findings were **rejected** on
verification (see notes).

---

## Review — 6 patterns: PASS except equity-integrity FAIL class

| # | Pattern | Result | Evidence |
|---|---------|--------|----------|
| 1 | Arbitrary CPI | PASS | All CPIs are manual `invoke_signed` to **constrained** program ids: `perp_vault_program`/`perp_engine_program` are checked `== config.*` in every accounts struct (`deposit.rs:47`, `withdraw.rs:45`, `manager_trade.rs:44,221`). Discriminators are computed from fixed method names (`cpi_util.rs:9`). No user-supplied program is invoked. |
| 2 | Improper PDA validation | PASS | `config`, `vault`, `depositor_account`, `authority` all use stored canonical bumps (`bump = *.bump` / `config.authority_bump`). `withdraw` binds `depositor_account.depositor == depositor.key()` (`withdraw.rs:29`). |
| 3 | Missing ownership check | **FAIL (data-source scoping)** | Own state is typed `Account<T>`. BUT `compute_vault_equity` reads raw `remaining_accounts` and the equity result is only as trustworthy as the *completeness* of that list (CRITICAL-1); and `depositor_balance` is an unbound `UncheckedAccount` (HIGH-1). |
| 4 | Missing signer check | PASS | `manager: Signer` + `vault.manager == manager.key()` on trade/pause ixs; `has_one = owner` on admin; two-step ownership (`transfer_ownership` → `accept_ownership` with `pending_owner: Signer`). `deposit`/`withdraw` require `depositor: Signer`. |
| 5 | Sysvar spoofing | PASS | Only `Clock::get()` (the real sysvar syscall) is read; no clock/rent is taken from a passed account. |
| 6 | Duplicate mutable account | PARTIAL | No self-aliasing mint in this program's own state. But `compute_vault_equity` does not de-duplicate the position list, which is the *inflation* half of CRITICAL-1. |

---

## CRITICAL-1 — `compute_vault_equity` trusts a caller-supplied position set (incomplete/duplicated → equity manipulation → pool theft)

**Location:** `programs/trading_vault/src/instructions/equity.rs:93-198`
(`compute_vault_equity`); consumed at `deposit.rs:86-92`, `withdraw.rs:95-101`,
`manager_trade.rs:97-103`.

**Description.**
Vault equity — the denominator for share issuance on deposit and the numerator for USDC
returned on withdraw — is computed on-chain as

```
equity = vault_balance.(balance + collateral_balance)          // base, validated
       + Σ over caller-supplied (Position, Market) pairs of (margin + unrealized_pnl)
```

The loop (`equity.rs:112-191`) validates each **supplied** pair: `position.owner ==
perp_engine_program`, `market.owner == perp_engine_program`, `position.market_id ==
market.market_id`, and `position.trader == vault_pda`. That correctly rejects *foreign* or
*spoofed* positions. It does **not**, and cannot with the current inputs, verify two things:

1. **Completeness** — that *every* open position of the vault is present. `remaining` is
   whatever the caller passes; an empty list is explicitly allowed (`base` only). The
   `Vault` account stores **no** position registry, open-position count, or per-market
   flag (`state.rs:68-97`), so nothing on-chain forces the list to be exhaustive.
2. **Uniqueness** — that a given position PDA is not supplied **twice** (or more). There is
   no dedup; the same profitable `(Position, Market)` pair counted N times adds its
   `margin + pnl` N times.

The caller of `deposit`/`withdraw` is the **depositor** (an arbitrary signer), and the
caller of the trade path is the **manager** — both untrusted with respect to honest
accounting. They fully control `ctx.remaining_accounts`.

**Failure scenario (two independent directions).**

*Withdraw over-payment (drain).* The vault holds positions P1 (margin+PnL = +$100k) and P2
(underwater, margin+PnL = −$80k). True equity ≈ base + $20k. A withdrawer submits
`remaining_accounts = [P1, Market1]` only, omitting the loser P2. Computed equity ≈ base +
$100k. `usdc_amount = shares * inflated_equity / total_shares` → the withdrawer pulls far
more USDC than their shares are worth, draining honest depositors. Duplicating P1 inflates
further. Shares are burned CEI-first (`withdraw.rs:146-164`) but against the inflated
valuation, so the burn does not save the pool.

*Deposit share-inflation (dilution/theft).* Symmetrically, on deposit
`shares = amount * total_shares / post_fee_equity`. The attacker **omits** profitable
positions (or presents only underwater ones) to *depress* `post_fee_equity`, minting more
shares per USDC than the true equity warrants, diluting existing holders; the attacker then
withdraws the stolen value. (`InvalidEquity` guards only `post_fee_equity > 0`,
`deposit.rs:130`, which the attacker can satisfy.)

Both paths require **no** operator/manager key for the withdraw direction (any depositor
can withdraw their own shares), and the whole exploit is a single transaction with
attacker-chosen `remaining_accounts`.

**Impact.** Direct, repeatable theft from the vault: over-withdrawal drains USDC held for
other depositors; deposit-side inflation dilutes and steals share value. Breaks the core
share↔equity invariant the vault exists to maintain. Severity CRITICAL.

**Recommendation.**
Make equity computation non-forgeable:

- Maintain an **on-chain position registry** in `Vault` (e.g. a bounded `Vec<[u8;32]>` of
  active `market_id`s, updated by `manager_open_position`/`manager_close_position` and by
  the reduce/close settlement). In `compute_vault_equity`, require that the supplied pairs
  correspond **exactly** (bijectively) to the registered set — reject if any registered
  market is missing or any market appears twice. This forces completeness and uniqueness.
- At minimum, track an `open_position_count: u64` on `Vault` and
  `require!(supplied_pairs == open_position_count)` plus an in-loop dedup check on
  `position_acc.key()` (e.g. assert strictly increasing keys, or scan for duplicates). This
  is weaker (does not prove the *right* positions were sent) but closes the trivial
  omit/duplicate attack.
- Prefer having `perp_engine` expose a single authoritative `get_account_equity`-style read
  (CPI or a signed equity attestation) so the vault does not reassemble it from raw
  account bytes at all.

---

## HIGH-1 — `deposit` does not bind `depositor_balance` to the signer (spend a third party's perp_vault USDC to buy your own shares)

**Location:** `programs/trading_vault/src/instructions/deposit.rs:56-58`
(`depositor_balance` unbound), handler CPI at `deposit.rs:139-148`;
CPI helper `cpi_util.rs:27-66`.

**Description.**
`depositor_balance` is declared as a bare `#[account(mut)] UncheckedAccount` — the source
of USDC for the deposit — with **no constraint tying it to `depositor.key()`** and no PDA
derivation. The deposit then CPIs `perp_vault.internal_transfer(from = depositor_balance,
to = vault_balance, amount)` signed by the trading_vault `authority` PDA (`deposit.rs:143`).

The trading_vault `authority` is a **registered operator on perp_vault** (see
`config.vault_operator_account`, set at init). Per the perp_vault review, `internal_transfer`
authorizes solely on operator-set membership and does **not** bind the mover to
`from_balance.trader`. Therefore the deposit CPI can move funds out of **any** trader's
perp_vault `AccountBalance`, not just the depositor's own.

Meanwhile the shares are credited to `depositor_account`, a PDA seeded by
`depositor.key()` (`deposit.rs:29`) — i.e. the **attacker's** share account.

**Failure scenario.**
Attacker A calls `deposit(amount = victim_V.balance)` passing `depositor_balance =
V's perp_vault AccountBalance PDA`, `depositor = A (signer)`, `depositor_account =
A's share PDA`. The CPI (authority-signed) debits V's perp_vault balance and credits the
vault; A receives freshly minted shares backed by V's stolen USDC. A then withdraws.
Victim never signed.

**Impact.** Theft of any perp_vault depositor's idle USDC balance, converted into
attacker-owned vault shares. The root enabler (operator not scoped to `from.trader`) lives
in perp_vault, but trading_vault **independently** fails to constrain its own
`depositor_balance` to the signer, which would close the hole regardless of the callee's
laxity. Reported HIGH (contingent on the vault authority being an active perp_vault
operator, which the deposit flow requires).

**Recommendation.**
Constrain `depositor_balance` to the depositor's canonical perp_vault `AccountBalance` PDA:
derive it in-program (`address = Pubkey::find_program_address([AccountBalance::SEED_PREFIX,
depositor.key()], perp_vault_program).0`) or add
`constraint`-checking of the stored `trader` field `== depositor.key()` after an owner
check, mirroring how `withdraw` binds `depositor_account.depositor == depositor.key()`. Do
the symmetric bind for the withdraw destination if the same laxity applies there.

---

## MEDIUM-1 — Drawdown auto-pause is evaluated on caller-supplied equity (manager can mask or force a breach)

**Location:** `programs/trading_vault/src/instructions/manager_trade.rs:97-110`;
`fees.rs:165-187` (`check_drawdown`).

**Description.**
`manager_open_position` computes `equity` via the same `compute_vault_equity` (CRITICAL-1
input surface) and feeds it to `check_drawdown`, which auto-pauses the vault when
`equity_per_share < high_water_mark * (1 - max_drawdown_bps)`. Because the manager supplies
`remaining_accounts`, they choose the equity the drawdown gate sees:

- **Mask a real breach:** omit underwater positions so computed equity stays above the
  threshold; the vault keeps trading through a drawdown that should have paused it (defeats
  the H-14 protection depositors rely on).
- **Force a spurious pause** (griefing / fee-timing): present a depressed equity to trip the
  auto-pause.

This is a consequence of the same untrusted-equity root cause, but its security goal
(drawdown circuit-breaker) is distinct from CRITICAL-1's (share/withdraw valuation), so it
is tracked separately. Severity MEDIUM: it degrades a safety control rather than directly
minting/withdrawing funds, and the manager is a semi-trusted role.

**Recommendation.**
Fixing CRITICAL-1 (registry-enforced complete/unique position set) fixes this as a
byproduct. Until then, at least require the drawdown check to run over the same
registry-verified set.

---

## LOW-1 — `read_position_size` fails open to `0`, and open/close routing trusts it

**Location:** `programs/trading_vault/src/instructions/cpi_util.rs:322-327`;
used at `manager_trade.rs:118-123`.

**Description.**
`read_position_size` returns `0` on any borrow failure or short buffer (`_ => 0`). The
routing in `manager_open_position` uses `cur_size` to decide between
open/close/reduce CPIs (`manager_trade.rs:123-180`). If a stale or not-yet-visible position
account is passed such that the read yields `0` when a real position exists, the handler
routes to `open_position` (treated as a fresh open) instead of the correct reduce/close
path. The engine is the ultimate authority on position state and should reject an
inconsistent open, so this is defense-in-depth rather than a direct exploit; but the
fail-open default is fragile. `position` is an unbound `UncheckedAccount`
(`manager_trade.rs:53-54`), so its correctness is delegated entirely to the engine.

**Recommendation.**
Constrain `position` to the canonical engine PDA (`[Position::SEED, vault_pda, market_id]`)
so the size read is always of the right account, and treat a borrow/format failure as an
error rather than `0` when the position is expected to exist.

---

## LOW-2 — `init_vault_balance` and operator-paid balance-PDA creation are griefable / front-runnable

**Location:** `programs/trading_vault/src/instructions/vault_admin.rs:164-196`
(`init_vault_balance`); `deposit.rs:26-32` (`depositor_account` `init_if_needed`).

**Description.**
`init_vault_balance` bootstraps the vault's perp_vault `AccountBalance` via
`credit_collateral(1)`/`debit_collateral(1)` signed by `authority`, and `payer` is any
signer. `depositor_account` uses `init_if_needed, payer = depositor`. Neither is a fund
mint, and the write-once guards on the callee side (per perp_vault review) keep re-init
safe. The residual is minor: `init_vault_balance` can be called by anyone (only wiring the
vault's own PDA, so low value), and rent for the vault balance PDA is paid by whoever calls.
No incorrect-state outcome, only rent attribution / ordering nuisance.

**Recommendation.**
Optionally gate `init_vault_balance` to the vault manager or owner and document that it is
idempotent and safe to call once post-`create_vault`.

---

## Informational

- **Program/config wiring is correctly pinned.** Unlike perp_vault (which stores no engine
  identity), `TradingVaultConfig` stores `perp_vault_program`, `perp_vault_config`,
  `vault_operator_account`, `perp_engine_program`, `perp_engine_config`,
  `engine_operator_account`, and every consuming instruction constrains the passed accounts
  `== config.*` (`deposit.rs:47-54`, `withdraw.rs:45-52`, `manager_trade.rs:44-57,221-234`).
  This closes the arbitrary-CPI and config-substitution classes. Reviewed and sound.

- **Arithmetic and share math are consistently checked.** `deposit`/`withdraw`/`fees` use
  `checked_add/mul/sub` with `MathOverflow` mapping and `u128` intermediates
  (`deposit.rs:121-192`, `withdraw.rs:131-164`, `fees.rs:38-114`). First-deposit floor
  (`MIN_FIRST_DEPOSIT`, `deposit.rs:122-125`), `shares > 0` / `usdc_amount > 0` guards, and
  fee `skip when fee >= equity` (`fees.rs:50,117`) all mirror the Solidity source. No
  silent clamp or under/overflow accounting bug in the math itself.

- **Drawdown H-14 deviation is intentional and documented.** `check_drawdown` returns
  `Ok(true)` and persists `paused + drawdown_paused_at` instead of `Err`, so the auto-pause
  actually survives the tx (the Solidity revert made it dead code). The
  `manager_open_position` caller returns `Ok(())` on breach to preserve that state
  (`manager_trade.rs:104-110`, `fees.rs:153-187`). Correct and well-reasoned — the only
  caveat is the input-integrity issue in MEDIUM-1.

- **Two-step ownership + fee/limit immutability are sound.** `transfer_ownership` →
  `accept_ownership` with `pending_owner: Signer` and `!= default` guard
  (`admin.rs:95-132`); `update_vault_safety_limits` only loosens (`deposit_cap` raise,
  `lockup` reduce) and never touches fee bps or `max_drawdown_bps`
  (`vault_admin.rs:296-323`). Reviewed and sound.

---

## Verification notes (rejections / merges)

- **REJECTED — "`vault_balance` in equity read can be swapped for a higher-balance
  account."** `read_vault_balance` requires `owner == perp_vault_program` **and** the stored
  `trader` field `== vault_pda` (`equity.rs:56-69`). Since a perp_vault `AccountBalance` is
  the canonical PDA of its `trader`, only the vault's own real balance satisfies both — no
  substitution is possible. Not a finding.

- **REJECTED — "arbitrary CPI: manager can pass a rogue engine/vault program."** Every
  program id and config is constrained `== config.*` in the accounts structs
  (`manager_trade.rs:44-57`, `deposit.rs:47-54`). Rogue-program substitution is blocked.
  Not a finding.

- **REJECTED — "share math rounding lets an attacker mint free shares / inflation attack via
  first deposit."** The `MIN_FIRST_DEPOSIT = 1000 USDC` floor (`state.rs:29`,
  `deposit.rs:122-125`) plus `SHARE_PER_PRICE = 1e12` scaling and `shares > 0` /
  `DepositTooSmall` guards mirror the Solidity M-22 mitigation; the classic first-deposit
  share-price inflation is not exploitable at this floor. Not a finding (standard rounding
  dust only).

- **MERGED into CRITICAL-1:** the position-list **duplication** angle (double-counting a
  profitable pair) — same root cause and fix (registry-enforced unique+complete set) as the
  omission angle.

- **Cross-program dependency (not double-counted):** HIGH-1's ultimate enabler
  (`perp_vault.internal_transfer` not binding the operator to `from.trader`) is filed
  against perp_vault; here it is reported as trading_vault's own failure to bind
  `depositor_balance` to the signer, which is independently fixable in this program.
