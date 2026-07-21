# Audit RED tests — run status

**Date:** 2026-07-21
**Status (updated 2026-07-21):** the two cheap CRITICAL/HIGH fixes are **applied and build-verified**
(`anchor build` passes). The two tests below were **converted from RED (documents-the-bug) to regression
(asserts-the-guard-reverts)**. They compile; confirming them green still needs a **non-Windows / CI
`anchor test` run** — the local Solana test validator wedges on this Windows machine (details below).

## What exists

Two RED (vulnerability-documenting) tests were written to accompany the audit findings:

| Test file | Documents | Expected (RED) behavior |
|-----------|-----------|-------------------------|
| `tests/10_close_position_strand_red.ts` | perp_engine HIGH — `close_position` silently skips settlement when vault accounts omitted → winning trader's payout stranded in `engine_pool` | Currently PASSES: position zeroed, trader balance unchanged. Flip to assert-revert once the `require!(remaining_accounts.len() >= 6)` guard lands. |
| `tests/12_vault_alias_mint_red.ts` | perp_vault CRITICAL-1 — `internal_transfer` with `from_balance == to_balance` mints funds (Anchor last-write-wins on duplicated `mut Account<T>`) | Currently PASSES: attacker balance grows by `amount` from nothing. Flip to assert-revert once the `require!(from.key() != to.key())` guard lands. |

Both tests **compile** (the full `anchor build` of all 12 programs succeeded, and the TS type-checks against `target/types`). Both mirror the existing harness (`tests/01_perp_vault.ts`, `tests/02_perp_engine.ts`).

## Why they were not run green here

`solana-test-validator` was unstable on this Windows machine across several attempts on 2026-07-21:

1. First run: `Failed to create ledger ... Acceso denegado (os error 5)` — a locked/leftover `.anchor/test-ledger`. Fixed by removing the ledger.
2. Second run: `Test validator does not look started` — genesis-unpack + 12-program deploy exceeded the default startup wait. Mitigated by adding `[test] startup_wait = 120000` to `Anchor.toml`.
3. Third/fourth runs: validator started ("Running test suite" printed) but then **wedged for 13–40 min** with no mocha output and the `solana-test-validator` process gone — the validator died mid-run. Reproduced twice after a clean ledger.

This is an **environment issue, not a test-logic issue**. The underlying bugs are independently **verified by manual code review** (see `2026-07-21-perp-vault-findings.md` CRITICAL-1 and `2026-07-21-perp-engine-findings.md` HIGH), reading the exact deduct/credit + serialization-order and the settlement-skip branches.

## To run these green

Run on a **non-Windows environment** (Linux/macOS or CI), where `solana-test-validator` is reliable:

```bash
anchor test          # builds, starts validator, runs tests/*.ts in order
# or, against a manually-started validator:
solana-test-validator &   # wait until healthy
anchor test --skip-local-validator
```

Expected: the full suite passes, including the two RED tests above (which pass while the bugs are present).

## Not yet written

- A RED test for the second CRITICAL — `trading_vault` `compute_vault_equity` position-set forgery (`equity.rs:93-198`). Deferred: it needs a heavier multi-program setup (vault + engine + two positions with opposite PnL) and was not worth authoring blind while the local validator could not verify it. Author it alongside a working `anchor test` run.
