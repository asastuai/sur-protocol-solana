# Migration Phases

Phased pipeline for porting SUR Protocol from Solidity (Base L2) to Anchor (Solana).

## Status legend
- ✅ Complete + integration tests passing
- 🚧 Scaffold complete, CPIs pending
- ⏳ Not started
- 🔬 Optimization round

## Phase 0 — A2A Dark Pool primitive ✅
- `programs/a2a_darkpool` — 4/4 tests passing (initial)
- Tag: `v0.1.0`

## Phase 1 — Foundation ✅ (v0.2.0)
- `programs/perp_vault` ✅ — USDC custody, deposit/withdraw, internal_transfer, credit/debit_collateral
- `programs/oracle_router` ✅ — Pyth-only push, circuit breaker, staleness, deviation
- `programs/perp_engine` ✅ — openPosition, closePosition, updateMarkPrice, OI accounting, realized PnL
- `programs/a2a_darkpool` ✅ — agent OTC matching with end-to-end CPI settlement
- `programs/sur_timelock` ✅ — queue/execute/cancel + emergency_pause guardian
- ✅ CPI: `oracle_router.push_price` → `perp_engine.update_mark_price` (typed `cpi::*`)
- ✅ CPI: `a2a_darkpool.accept_and_settle` → `perp_engine.open_position` (×2) + `perp_vault.internal_transfer` (×2) via manual `invoke_signed`
- 34/34 integration tests
- Tag: `v0.2.0`

## Phase 2 — Risk + Markets ✅ (v0.2.4)
First half (v0.2.1 → v0.2.3):
- `programs/liquidator` ✅ — permissionless liquidations
- `programs/insurance_fund` ✅ — bad-debt absorption, H-9 keeper-reward caps
- `programs/auto_deleveraging` ✅ — ADL last-resort
Second half (v0.2.4):
- `programs/collateral_manager` ✅ — multi-asset margin (yield-bearing tokens), prospective haircut + liquidation-threshold snapshots (Mapping 3)
- `programs/trading_vault` ✅ — HLP-style pooled vaults, 1e18 share precision (u128), HWM perf-fee + per-second mgmt-fee, H-14 drawdown cooldown (audit-intent preserved over Solidity dead-code)
- `programs/order_settlement` ✅ — ed25519-signed orders, 256-bit nonce bitmap pages, commit-reveal MEV protection, settle_one with 4 CPIs
- SDK: `clients/sdk/src/views/perp_engine_view.ts` (PerpEngineView SDK-only port)
- 11 programs total, 85/85 tests
- Tag: `v0.2.4`

## v0.3 — Risk-management CPI wiring ✅ (v0.3.0)
Replaced all 4 CPI stubs with real `manual invoke_signed` calls:
- ✅ `perp_engine.open_position` → `vault.internal_transfer` for margin lock
- ✅ `perp_engine.close_position` → `vault.internal_transfer` for PnL settlement (winner/loser/bad-debt branches + BadDebt event)
- ✅ `perp_engine.liquidate_position` → keeper reward + insurance overflow + bad-debt routing (`_distributeLiquidationRewards` ported byte-for-byte)
- ✅ `liquidator.liquidate` → real `engine.liquidate_position` CPI
- ✅ `auto_deleveraging.execute_adl` → real `engine.open_position` CPI (forced reduce)
- ✅ `insurance_fund.reward` → real `vault.internal_transfer` CPI (H-9 caps preserved BEFORE the CPI)
- New canonical pattern: `bootstrap_*_pool` ix (perp_engine, insurance_fund, trading_vault) — authority PDA signs vault.deposit(0) to init its own AccountBalance
- 94/94 tests (every test now exercises real CPI chain instead of stubs)
- Tag: `v0.3.0`

## v0.3.1 — Non-risk caller migrations ✅
All 5 engine callers now forward vault accounts via `remaining_accounts`; margin lock fires end-to-end from every flow.
- ✅ `a2a_darkpool.accept_and_settle` — buyer + seller balances → engine_pool
- ✅ `order_settlement.settle_one` — maker + taker balances → engine_pool
- ✅ `trading_vault.manager_open_position` / `manager_close_position` — vault PDA balance ↔ engine_pool
- Test assertion adjustments: darkpool deposit bumped ($1K→$10K), order_settlement maker fee includes margin, commit-reveal re-open uses additional_margin delta
- Tag: `v0.3.1`

Backward-compat hatch retained but unused: engine still tolerates empty remaining_accounts (silently skips vault CPI). Future programs can integrate without margin-lock semantics if needed.

## v0.3.X minor follow-ups ⏳
- ⏳ `collateral_manager.liquidate_collateral` (snapshots in place, just needs ix)
- ⏳ Insurance-shortfall pull when winner totalReturn exceeds engine_pool (PerpEngine.sol:984) — requires deserializing engine_pool.balance in-handler
- ⏳ `order_settlement.settle_batch` as single ix (current per-trade preserves batch_counter; awkward in Anchor 0.31 due to variable account counts)
- ⏳ ADL profitable-position check on-chain (`AutoDeleveraging.sol:159-160`) — currently operator-trusted

## Phase 3 — Trust + Intent + Yield ⏳
- `programs/trust_layer` — cross-program reputation reads (separate Solidity repo upstream)
- `programs/intent_engine` — off-orderbook matching orchestrator (next-gen intent flow)
- Tag: `v0.4.0`

## Phase 4 — Off-chain client stack ⏳
- `clients/sdk` — typed Anchor client (TS/JS) — partial: program IDs + PDAs + views shipped; v0.0.2 pending npm publish
- `clients/indexer` — Helius webhook + Postgres event aggregation
- `clients/api` — REST API server
- `clients/keeper` — liquidation + funding bots
- `clients/oracle-keeper` — Pyth update keeper
- `clients/mcp-server` — LLM agent integration via MCP
- `clients/agent-api` — agent endpoint
- `clients/web` — frontend (swap wagmi/viem → @solana/web3.js + @coral-xyz/anchor)
- Tag: `v0.5.0`

## Phase 5 — Devnet integration ⏳
- End-to-end devnet deploy with real Pyth feeds + USDC dev mint
- 11-program deploy (deployer wallet `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv` needs ~30 SOL devnet)
- Stress tests, edge case coverage, failure-mode testing
- Tag: `v0.6.0`

## Phase 6 — Audit + mainnet ⏳
- Internal review across all programs + clients
- External audit (OtterSec, Neodyme, or Halborn)
- Audit fixes
- Mainnet deploy with rotated keypairs (current canonical IDs are testnet/dev)
- Tag: `v1.0.0`

## Phase 6+ — Optimization 🔬
After all programs ship, one round of Solana-native optimization:
- Compute unit reduction
- Account density tightening
- CPI batching where possible
- Address Lookup Tables for high-account txs (already used in order_settlement tests)
- Token-2022 evaluation (transfer fees, confidential transfer extensions)

## Locked decisions
See engram memory `sur-protocol/migration-decisions-locked` for full set:
- License BUSL-1.1, monorepo, mechanical port, Pyth oracle, USDC SPL classic
- nonReentrant guards removed (Solana provides), CEI manual
- Mapping 3 prospective-params (`fee_bps_at_post`, ParameterBump events) preserved
- Two-step ownership transfer pattern across all programs
- Manual `invoke_signed` for all CPIs (avoids anchor 0.31.1 cpi+idl-build bug)
- Audit INTENT preserved over Solidity bugs (e.g., H-14 TradingVault drawdown — see KNOWN-ISSUES.md)

## Stop-the-line for the orchestrator
Interrupt user only on:
1. Behavioral divergence economic
2. Costs >$20/mo recurring or >$100 one-time
3. Mainnet deploy
4. Force push / repo archive on shared repos
5. Push to non-main branch
6. 6+ hours continuous w/o progress
7. Discovery of primitive without Solana analog
8. Sudo/admin install beyond authorized toolchain
