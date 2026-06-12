# SUR-ADAPTER-DIAGNOSIS.md
**SAW × SUR: SurAdapter feasibility diagnosis**
_Author: investigation agent (2026-06-12). Read-only audit — no source files were modified._

---

## 0. Which repo is canonical?

Two checkouts exist:
- **Windows**: `C:\Users\Juan\Desktop\asastuai\sur-protocol-solana` — 8 programs in `Anchor.toml`, no `target/deploy/*.so`, devnet IDs are the **old** localnet IDs (all matching the WSL localnet stanza).
- **WSL** (live): `~/projects/sur-protocol-solana` — 11 programs, `target/deploy/` with 11 `.so` files all dated `2026-05-30 15:16`, SEPARATE devnet IDs (the post-remediation fresh deploy).

**The WSL checkout is the real, current repo.** The Windows copy is a stale partial mirror. All findings below come from the WSL copy.

---

## 1. VERIFIED STATE TABLE

| Claim | Reality | Evidence | Verdict |
|---|---|---|---|
| "11 Anchor programs COMPILED" | 11 `.so` files in `target/deploy/`: a2a_darkpool, auto_deleveraging, collateral_manager, insurance_fund, liquidator, oracle_router, order_settlement, perp_engine, perp_vault, sur_timelock, trading_vault — all `2026-05-30 15:16` | `ls -la ~/projects/sur-protocol-solana/target/deploy/*.so` | **VERIFIED** |
| "devnet program IDs in Anchor.toml" | WSL `Anchor.toml` has 11 distinct devnet pubkeys, all different from localnet | `Anchor.toml [programs.devnet]` stanza — e.g. `perp_engine = "28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX"`, `oracle_router = "8yLenSHEkdkbsCiQLmiQrZg7Kdb3ZBb1MKTFmJsA37zk"` | **VERIFIED** |
| "localnet program IDs in Anchor.toml" | WSL `Anchor.toml` has 11 separate localnet pubkeys | `[programs.localnet]` stanza — e.g. `perp_engine = "Cwpbe4mwgFdnhwhoRBGBzUerQa52cJMqXWjG3wGvYFW8"` | **VERIFIED** |
| "golden-path verified on-chain" | `scripts/golden-path-cli.ts` exists; commit `e3d22f3` (2026-05-30) records: "deposit 100 → open 0.01 BTC long → close → withdraw, signed by deployer operator. Ran green on devnet (margin 32.50 locked then released, vault returns to 0)." `devnet-state.json` shows 35/35 init steps `"ok"` including all 11 programs, operators, bootstrap, markets. | Commit message + `scripts/devnet-state.json` + `scripts/golden-path-cli.ts` | **VERIFIED** (script-based; not browser-verified — DEVNET-GOLDEN-PATH.md checklist still has unchecked boxes, implying the UI golden path was not manually ticked) |
| "95/95 security audit" | Audit report exists as `docs/AUDIT-REPORT.md`. Remediation section states "anchor test 95/95 green (incl. adversarial regression test)." Commit `c1535c8` message: "anchor test 95/95 green, incl. a C-1 regression test." However, `docs/KNOWN-ISSUES.md` test command comment says "94 passing" — a 1-test discrepancy. Both numbers are post-remediation. The `95` is from the Gate-0 commit; the `94` may reflect a test removed or a count discrepancy in a later pass. | `docs/AUDIT-REPORT.md`, commit `c1535c8` message, `docs/KNOWN-ISSUES.md` | **VERIFIED AS REAL ARTIFACT** — audit is a Claude Opus 4.8 self-audit (2 rounds, 27 agents), NOT an external firm (OtterSec/Neodyme/Halborn). The 95 vs 94 discrepancy is a minor count inconsistency, not a failure. Audit explicitly says "NOT mainnet-ready" — open HIGH/MEDIUM items remain. |

---

## 2. PERP_ENGINE INSTRUCTION → VenueAdapter METHOD MAPPING

### What SUR's `perp_engine` actually has (from IDL + source)

| Instruction | Signature | Purpose |
|---|---|---|
| `initialize` | admin | Bootstrap `EngineConfig` singleton |
| `add_market` | owner | Create `Market` PDA |
| `update_mark_price` | operator | Write `mark_price` + `index_price` to Market PDA |
| `open_position` | operator | Create/increase `Position` PDA; lock margin via vault CPI |
| `close_position` | operator | Zero `Position` PDA; settle PnL via vault CPI |
| `liquidate_position` | permissionless | Check maintenance margin; route keeper reward + insurance |
| `bootstrap_engine_pool` | owner | Set `EngineConfig.engine_pool` |
| `set_operator` | owner | Grant/revoke operator role |
| `pause` / `unpause` | owner | Global pause |
| `transfer_ownership` / `accept_ownership` | two-step | Ownership transfer |
| `set_insurance_fund_balance` | owner | Set canonical insurance PDA |

### VenueAdapter method → SUR instruction mapping

| VenueAdapter Method | SUR equivalent | Gap / Notes |
|---|---|---|
| `ensureUserInitialized()` | None needed | SUR has no user-profile concept (no Adrena-style `UserProfile` PDA). SurAdapter can no-op this OR create an `AccountBalance` PDA on `perp_vault`. **Minor gap**: need to check if the vault requires an `AccountBalance` to exist before a margin lock. It does — `credit_collateral` or initial deposit is required first. |
| `ensureDeposited(marginUsdc)` | `perp_vault.deposit` (Trading Vault path) or direct funded `AccountBalance` | The engine locks margin by CPI-transferring from `trader_balance` (an `AccountBalance` PDA) into `engine_pool`. That balance must be pre-funded. There is no standalone `deposit` ix on `perp_engine`; it goes through `perp_vault`. **Gap**: need to wire up a USDC → AccountBalance deposit path. For paper-trade the adapter can fund the balance from a test wallet directly. |
| `getOraclePrice(market)` | `market.mark_price` field on the `Market` PDA | SUR stores `mark_price` (u64, 6 decimals) and `index_price` on-chain. The adapter reads this PDA. **Gap**: mark price is pushed by an operator — it does NOT read from Pyth directly in v0.2. For paper-trade, the adapter can push prices itself (if it holds an engine operator key) or simply read `market.mark_price`. |
| `hasOpenOrderWithUserOrderId(n)` | Check if `Position` PDA exists for `(market_id, trader)` | SUR's `Position` is PDA-derived from `[b"position", market_id, trader.key()]`. No client order ID concept. Map exactly as the Adrena adapter does: check PDA existence for the given side. **Partial gap**: SUR's position is for a (market, trader) pair with a signed `size` field that encodes side (positive = long, negative = short). One PDA per market per trader, not per side. So one existence check covers both sides. |
| `openPerp(intent, userOrderId)` | `perp_engine.open_position(size_delta, fill_price)` | **Operator-gated** — the SurAdapter's authority must be registered as an engine operator. `size_delta` is signed (+ = long, - = short); `fill_price` is u64 (1e6 decimals). Margin auto-computed from market's `initial_margin_bps`. **Gap 1**: caller must be a registered operator. For paper-trade SAW can use the deployer keypair. **Gap 2**: no SL/TP in perp_engine at all (see below). |
| `closePerp(market)` | `perp_engine.close_position(fill_price)` | Operator must provide `fill_price`. For paper-trade: use last `mark_price` from the Market PDA. **Gap**: the operator must supply fill price — adapter must read `market.mark_price` first and pass it. |
| `getPositions()` | Deserialize `Position` PDA for `(market_id, trader)` | Position struct has: `size` (signed i64), `entry_price` (u64), `margin` (u64), `last_updated`. **Gap 1**: no `unrealizedPnlUsdc` stored on-chain — must compute client-side: `pnl = (mark_price - entry_price) * |size| / SIZE_PRECISION` (flip sign for shorts). **Gap 2**: no `liqPrice` stored — compute same as Adrena adapter does. **Gap 3**: no `stopLoss` / `takeProfit` fields in the `Position` struct at all. |
| `getFloatBalanceUsdc()` | Read `AccountBalance` PDA on `perp_vault` for the trader | `AccountBalance` has a `balance` field (u64, 6 decimals). Adapter reads the trader's `AccountBalance` PDA. **Minor gap**: PDA derivation needs `perp_vault` program ID. |
| `disconnect()` | No-op (stateless) | No gap. |

---

## 3. GAPS LIST

Ordered by blocking severity for a SurAdapter in paper-trade mode:

### GAP-1 (BLOCKING): No Stop-Loss / Take-Profit instructions in perp_engine

The `Position` struct has NO `stopLoss`, `takeProfit`, `stopLossIsSet`, or `takeProfitIsSet` fields. The IDL lists 12 instructions — none are `set_stop_loss` or `set_take_profit`. The audit report and KNOWN-ISSUES make no mention of SL/TP as a planned feature in the current codebase.

**Impact on SurAdapter**: `PerpPosition.stopLoss` and `PerpPosition.takeProfit` would always return `null`. The `openPerp` call with `intent.stopLoss != null` or `intent.takeProfit != null` would silently drop those constraints — no on-chain enforcement. SL/TP is implemented in Adrena via keeper-executed on-chain instructions with different discriminators per side; SUR has no equivalent.

**Option A (paper-trade)**: Accept null SL/TP — only valid if SAW's intent layer is OK with no on-chain SL/TP for this venue. The adapter returns `stopLoss: null, takeProfit: null` from `getPositions()`. A software-layer SL/TP enforcer in the intent engine could watch the position and call `closePerp` when price crosses the target.

**Option B (real)**: Add `set_stop_loss` / `set_take_profit` instructions + fields to `Position` struct in `perp_engine`. Estimated: ~2–3 days (struct migration + 2 new instructions + keeper path + tests). But this is NOT needed for a paper-trade adapter.

### GAP-2 (BLOCKING for non-paper-trade): Oracle is operator-pushed, not Pyth-native

`oracle_router.push_price` takes `(mark_price, index_price, source, publish_timestamp, confidence_bps)` from the calling operator. The comment in `oracle_router/src/lib.rs` says: "Real Pyth account derivation lands in v0.2.X via pyth-solana-receiver-sdk." That wiring is NOT done in the current build.

**Impact on SurAdapter**: `getOraclePrice(market)` reads `market.mark_price` — this value is only as fresh as the last `push_price` or `update_mark_price` tx the operator sent. For paper-trade this is fine (push synthetic prices on demand). For a live venue it's a risk (C-2 audit finding, rated HIGH, still open).

**Mitigation for paper-trade**: SurAdapter pushes prices itself via `oracle_router.push_price` (or `perp_engine.update_mark_price` directly if it holds the operator key). The adapter is its own price oracle. Fully controllable.

### GAP-3 (MINOR): AccountBalance must be pre-funded before open_position

`open_position` CPIs into `perp_vault.internal_transfer(trader_balance → engine_pool)`. The `trader_balance` (`AccountBalance` PDA) must exist and have sufficient balance. SUR has no "create if not exists" logic for this PDA within the engine instruction — it must be created + funded separately.

**Mitigation**: `ensureUserInitialized()` in SurAdapter can create the `AccountBalance` PDA (via `perp_vault.create_account_balance` or equivalent — need to verify that instruction exists). `ensureDeposited()` can fund it by minting/transferring test USDC. For paper-trade this is a setup step, not a runtime problem.

### GAP-4 (MINOR): Operator registration required

`open_position` and `close_position` require the caller to be a registered engine operator (checked via `Operator` PDA). The SurAdapter's signing keypair must be pre-registered by the engine owner via `set_operator`.

**Mitigation**: One-time setup step. The deployer keypair in `devnet-state.json` is already registered as an operator. Paper-trade can reuse it.

### GAP-5 (DESIGN): unrealizedPnL and liqPrice are not stored on-chain

Both must be computed client-side, identical to how the Adrena adapter computes `liqPrice`. This is expected and fine — same pattern, no blocker.

---

## 4. EFFORT ESTIMATE

### Paper-trade SurAdapter (adapter only, no SL/TP, synthetic prices)

**What needs to be built:**
1. `SurAdapter` class implementing `VenueAdapter` — reads `Position` and `Market` PDAs, calls `open_position` / `close_position` via the operator keypair
2. A price-push helper (the adapter pushes prices to `update_mark_price` before reads, or reads the last stored value)
3. Setup script: create `AccountBalance` PDA for the test trader, fund it with test USDC, ensure operator registration

**Effort: ~3–5 days** (1 day for setup/wiring, 1–2 days for adapter implementation, 1–2 days for integration test on localnet). The SUR localnet is self-contained (no external oracle dependency — prices are operator-pushed), so the local-validator path is clean and controllable.

### SL/TP parity with Adrena adapter (if required)

Add `stop_loss: Option<u64>` + `take_profit: Option<u64>` + `stop_loss_is_set: bool` + `take_profit_is_set: bool` to the `Position` struct, plus `set_stop_loss` / `set_take_profit` instructions. This also requires a keeper that watches positions and calls `close_position` when price crosses the threshold (since there is no on-chain keeper in v0.2 — liquidation is permissionless but SL/TP is not).

**Effort: ~5–8 additional days** (struct + instructions + keeper watcher + tests). Not needed for paper-trade proof of portability.

---

## 5. WHAT TO BUILD FIRST (concrete recommendation)

**Goal**: prove `VenueAdapter` portability with SUR as a second venue, paper-trade mode.

**Step 1** (Day 1): Create `worker/src/lib/sur-venue.ts` implementing `VenueAdapter`. Structure mirrors `venue.ts` (AdrenaAdapter) but calls SUR programs. Key simplifications:
- `openPerp` → `perp_engine.open_position(size_delta, fill_price)` where `fill_price = await this.getOraclePrice(market)` (reads `market.mark_price`)
- `closePerp` → `perp_engine.close_position(fill_price)` same price read
- `getPositions()` → deserialize `Position` PDA, compute uPnL + liqPrice client-side, return `stopLoss: null, takeProfit: null`
- `ensureUserInitialized()` → create `AccountBalance` PDA if it doesn't exist
- `getOraclePrice()` → read `market.mark_price` from `Market` PDA (u64 → number / 1e6)
- `getFloatBalanceUsdc()` → read `AccountBalance.balance`

**Step 2** (Day 2): localnet test harness — start `anchor localnet`, run setup (fund AccountBalance, confirm operator), open long, read position, close, verify balance returned.

**Step 3** (Day 3): Wire into SAW `isVenueEnabled()` gate with `VENUE=sur` env var; add to the intent-to-adapter dispatch table alongside the Adrena path.

**DO NOT** build SL/TP for the portability demo — return `null` and document it as a known limitation. The VenueAdapter contract allows `null` for both fields. The goal is to show the abstraction works, not to achieve feature parity.

---

## 6. PAPER-TRADE FEASIBILITY

**Can SUR run on a local validator or its own devnet cheaply, controllably, without fragile external oracles/keepers?**

**YES — straightforwardly.** Specifically:
- Prices are operator-pushed (`update_mark_price`). The SurAdapter itself can push a synthetic price before each open/close. No Pyth dependency on localnet.
- No external keepers required for open/close (those are operator-triggered). The adapter IS the operator.
- `anchor localnet` (= `anchor test --skip-build`) spins a local validator with all 11 programs pre-deployed in under 30 seconds.
- The devnet deployment already works (35/35 init steps `ok`, golden-path green).
- No Jito bundle dependency (unlike Adrena on mainnet). Transactions are plain localnet txs.

**Fragile parts** (not blockers for paper-trade):
- Liquidation is permissionless but requires a separate keeper. Not needed for paper-trade (positions won't go underwater with synthetic prices).
- SL/TP has no on-chain keeper — but SL/TP isn't needed for the portability demo.

---

## 7. HONEST ASSESSMENT OF THE PREVIOUS AGENT'S CLAIMS

| Claim | Verdict | Notes |
|---|---|---|
| "11 Anchor programs COMPILED" | VERIFIED | All 11 `.so` in WSL `target/deploy/`, all same build date |
| "devnet+localnet program IDs in Anchor.toml" | VERIFIED | Both stanzas present, distinct IDs |
| "golden-path verified on-chain" | VERIFIED (CLI script) | `golden-path-cli.ts` ran green on devnet per commit message. Browser UI golden path (DEVNET-GOLDEN-PATH.md) checklist not manually ticked — that's a cosmetic gap, not a functional one |
| "95/95 security audit" | PARTIAL | Real audit artifact exists (2-round Claude Opus adversarial review, not an external firm). "95/95" is from the Gate-0 commit message; KNOWN-ISSUES.md says "94 passing" — 1-test discrepancy, likely a count that changed between commits. The audit is self-conducted, explicitly notes remaining open findings (N-5b, C-2 Pyth, H-7, governance), and says NOT mainnet-ready |
| "SL/TP support" | UNVERIFIED (NOT PRESENT) | No SL/TP instructions exist in perp_engine. Not claimed by the prior agent but implied by "paper-trade" use with SAW's VenueAdapter which has `stopLoss`/`takeProfit` fields — those will be null for SUR |

---

## 8. RELEVANT PATHS

- **Live SUR repo**: `~/projects/sur-protocol-solana` (WSL Ubuntu)
- **Perp engine source**: `~/projects/sur-protocol-solana/programs/perp_engine/src/`
- **Position struct**: `programs/perp_engine/src/state.rs` — `Position { size: i64, entry_price: u64, margin: u64, last_updated: i64 }` (no SL/TP fields)
- **Audit report**: `~/projects/sur-protocol-solana/docs/AUDIT-REPORT.md`
- **Devnet state**: `~/projects/sur-protocol-solana/scripts/devnet-state.json`
- **Golden path CLI**: `~/projects/sur-protocol-solana/scripts/golden-path-cli.ts`
- **SAW VenueAdapter interface**: `~/projects/saw/worker/src/lib/venue.ts`
- **Stale Windows mirror**: `C:\Users\Juan\Desktop\asastuai\sur-protocol-solana` — 8 programs, old IDs, no .so files — do not use

---

_This document was written by an investigation agent from a read-only pass. No source files were modified._
