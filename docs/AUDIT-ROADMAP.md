# SUR Protocol (Solana) — Security Audit Roadmap

**Audit lead:** Claude (Opus 4.8) · **Started:** 2026-05-29 · **Target:** v0.4.0-devnet (`6829216`)
**Scope:** 11 Anchor programs, ~13,273 LOC Rust. Agent-native perpetual futures DEX.

---

## 0. Why this audit

This is a fresh, adversarial re-audit of the full Solana port. The port was done as a
"mechanical byte-for-byte" migration of an *already-audited* Solidity protocol (Base L2),
but the translation to Anchor/Solana introduced a **new and larger attack surface** that the
original Solidity audit never covered:

1. **Manual `invoke_signed` everywhere.** To dodge the anchor 0.31.1 `cpi+idl-build` bug, ALL
   cross-program calls bypass Anchor's typed `cpi::` macros. This **throws away compile-time
   account validation at every call site.** Security now rests entirely on hand-written
   re-validation inside each callee handler. This is the #1 thesis of the audit.
2. **Solana ≠ EVM account model.** Owner checks, signer checks, PDA bump canonicalization,
   account substitution ("type cosplay"), and arbitrary-CPI are failure modes that simply
   do not exist in Solidity and therefore were never in scope for the upstream audit.
3. **Intentional divergences from the audited Solidity.** See KNOWN-ISSUES.md (H-14 drawdown,
   deferred liquidate_collateral, missing insurance-shortfall pull, ADL profitable-check
   skipped). Each divergence must be re-justified, not assumed safe.
4. **Net-new Solana code** with no Solidity ancestor: ed25519 order verification, nonce
   bitmap pages, commit-reveal, share-based vault math in u128, bootstrap_pool patterns.

## 1. Severity rubric

| Sev | Definition |
|-----|------------|
| **CRITICAL** | Direct theft/loss of user or protocol funds, or permanent freeze. Unprivileged attacker. |
| **HIGH** | Fund loss requiring a precondition, or privileged-key blast radius beyond intent, or protocol insolvency path. |
| **MEDIUM** | Incorrect accounting, DoS, griefing, or value leak without direct theft. |
| **LOW** | Defense-in-depth gap, missing validation with no current exploit, spec drift. |
| **INFO** | Style, gas/CU, documentation, hygiene. |

Every finding: `program/file:line` · severity · attacker model · concrete exploit path · fix.

## 2. Solana/Anchor threat checklist (applied to every program)

- [ ] **Signer checks** — every privileged ix asserts the right signer; authority PDAs verified.
- [ ] **Owner checks** — every deserialized account's `owner` is the expected program.
- [ ] **PDA validation** — seeds + canonical bump checked on every PDA, including CPI-passed ones.
- [ ] **Account substitution / type cosplay** — discriminator + key identity verified; no
      attacker-controlled account can stand in for a config/vault/position PDA.
- [ ] **Arbitrary CPI** — callee verifies the *caller program id* (not just "a PDA signed").
- [ ] **Manual invoke_signed correctness** — discriminator = `sha256("global:<m>")[..8]`,
      borsh arg order matches callee, AccountMeta signer/writable flags correct.
- [ ] **Integer math** — checked_* everywhere; no silent wrap; no truncating cast (`as`) that loses funds.
- [ ] **Rounding direction** — always favors the protocol/pool, never the user; share math safe.
- [ ] **Share inflation / first-depositor attack** — trading_vault HLP shares (1e18 u128).
- [ ] **Oracle** — staleness, confidence interval, deviation circuit breaker, exponent handling.
- [ ] **Reentrancy via CPI** — CEI ordering actually preserved (nonReentrant was removed).
- [ ] **Init / re-init** — no `init_if_needed` foot-guns; no re-initialization of config.
- [ ] **Replay** — nonce bitmap pages, ed25519 sig binding (chain id / program id / expiry).
- [ ] **ed25519 verification** — instruction-introspection done correctly (the classic Solana trap).
- [ ] **Close/lamport** — no account drain, no premature close, rent-exemption preserved.
- [ ] **Authorization** — two-step ownership transfer, timelock, guardian pause all sound.
- [ ] **Economic** — funding rate, PnL settlement, bad-debt routing, ADL, liquidation rewards,
      insurance caps (H-9). Conservation of funds must hold under fuzzing.

## 3. Program prioritization (by blast radius)

| Tier | Programs | Rationale |
|------|----------|-----------|
| **T1 — custody/math** | perp_vault, perp_engine, trading_vault, order_settlement, collateral_manager | Hold funds, do the money math, net-new Solana code |
| **T2 — risk/economics** | liquidator, auto_deleveraging, insurance_fund | Insolvency + bad-debt + privileged keeper paths |
| **T3 — perimeter** | a2a_darkpool, oracle_router, sur_timelock | Entry points, price truth, admin/timelock |

## 4. Audit waves (parallel adversarial review)

- **Wave A — CPI trust boundary (cross-cutting):** every `cpi_util.rs` + every callee that
  receives a manual `invoke_signed`. Verify caller-program-id + signer-PDA + account-owner
  re-validation. This is the spine of the whole audit.
- **Wave B — perp_engine + perp_vault:** core accounting, margin lock/unlock, PnL, OI, bad debt,
  balance underflow, internal_transfer authorization.
- **Wave C — trading_vault:** HLP share math, first-depositor inflation, HWM/perf/mgmt fees,
  H-14 drawdown persistence, manager open/close CPI.
- **Wave D — order_settlement:** ed25519 sig verification, nonce bitmap replay, commit-reveal,
  settle_one 4-CPI chain.
- **Wave E — liquidator + auto_deleveraging + insurance_fund:** liquidation reward distribution,
  ADL operator-trust gaps, H-9 keeper caps, bad-debt routing, insurance overflow.
- **Wave F — collateral_manager + oracle_router + a2a_darkpool + sur_timelock:** multi-asset
  haircut snapshots, oracle CB/staleness, darkpool reputation/settlement, timelock guardian +
  two-step ownership.

Each wave → structured findings. Synthesis dedups, ranks, and adversarially re-checks the
top findings before anything is called confirmed.

## 5. Methodology

1. Static read of every handler + state + errors per program.
2. Diff against `reference/sur-protocol` (Solidity) for behavioral parity where claimed.
3. Adversarial "how do I steal funds / freeze / inflate / replay" pass per program.
4. Cross-cutting CPI trust-boundary pass.
5. Verify the KNOWN-ISSUES divergences are still safe under the current code.
6. Synthesis + independent re-verification of CRITICAL/HIGH before sign-off.

## 6. Out of scope (this pass)

- Off-chain client stack (`clients/*`) beyond how it shapes on-chain trust assumptions.
- Devnet keypair/SOL-funding ops.
- Formal verification / professional external audit (Phase 6 — OtterSec/Neodyme/Halborn).

---

## 7. Findings ledger

Round 1 complete (2026-05-29). **3 CRITICAL, 11 HIGH, 12 MEDIUM, 6 LOW.**
Full ledger + remediation roadmap: see `docs/AUDIT-REPORT.md`.

Two systemic root causes:
- **R1** — flat, role-less `Operator` capability model (one operator = total fund/price control).
- **R2** — "callee re-validates" is false; callees check account *structure*, not *authorization*;
  value-bearing accounts ride `remaining_accounts` as unconstrained `UncheckedAccount`.

Headline CRITICAL (C-1): permissionless `a2a_darkpool.accept_and_settle` hands attacker-chosen
balance accounts to a vault CPI signed by a trusted operator PDA → unprivileged fund theft.

Verdict: **NOT safe to custody real funds** at `v0.4.0-devnet`. Fixable without redesign; fix the
CRITICAL/HIGH cluster (Gate 0 + Phases A–B) before any value-bearing deployment.
