# Migration Phases

Phased pipeline for porting SUR Protocol from Solidity (Base L2) to Anchor (Solana).

## Status legend
- ✅ Complete + integration tests passing
- 🚧 Scaffold complete, CPIs pending
- ⏳ Not started
- 🔬 Optimization round

## Phase 0 — A2A Dark Pool primitive ✅
- `programs/a2a_darkpool` — 4/4 tests passing
- Tag: `v0.1.0`

## Phase 1 — Foundation ✅ (v0.2.0)
- `programs/perp_vault` ✅ — 8/8 tests (USDC custody, deposit/withdraw, internal_transfer, collateral splitting)
- `programs/oracle_router` ✅ — 7/7 tests (Pyth-only, circuit breaker, staleness, deviation)
- `programs/perp_engine` ✅ — 9/9 tests (CORE: openPosition, closePosition, updateMarkPrice, OI accounting, realized PnL)
- `programs/a2a_darkpool` ✅ — 4/4 tests including end-to-end CPI settlement
- `programs/sur_timelock` ✅ — 6/6 tests (queue/execute/cancel + emergency_pause guardian)
- ✅ CPI: `oracle_router.push_price` → `perp_engine.update_mark_price` (typed `cpi::*` wrappers)
- ✅ CPI: `a2a_darkpool.accept_and_settle` → `perp_engine.open_position` (×2) + `perp_vault.internal_transfer` (×2) via manual `invoke_signed` (works around anchor 0.31.1 cpi+idl-build bug — see KNOWN-ISSUES.md)
- ⏳ CPI: `perp_engine.{open,close}_position` → `perp_vault.internal_transfer` for margin lock + PnL settlement (deferred to Phase 2)
- **34/34 integration tests passing in WSL2**
- Tag: `v0.2.0`

## Phase 2 — Risk + Markets ⏳
Mirroring upstream Solidity contract split (each becomes its own Anchor program):
- `programs/market_registry` — markets list, params per market, prospective tier history
- `programs/risk_engine` — margin-tier eligibility, max-leverage caps, exposure limits
- `programs/funding_engine` — funding rate accruals, cumulativeFunding tracking, applyFunding CPI
- `programs/liquidator` — liquidation eligibility, partial liquidations
- `programs/auto_deleveraging` — ADL queue, ADL execution
- `programs/sur_timelock` — admin gate for prospective param changes
- `programs/order_settlement` — order lifecycle + settlement orchestration
- `programs/insurance_fund` — bad-debt absorption pool
- Tag: `v0.3.0`

## Phase 3 — Trust + Intent + Yield ⏳
- `programs/trading_vault` — yield-bearing collateral wrapper (CollateralManager.sol equivalent)
- `programs/trust_layer` — cross-program reputation reads (separate Solidity repo upstream)
- `programs/intent_engine` — off-orderbook matching orchestrator (next-gen intent flow)
- Tag: `v0.4.0`

## Phase 4 — Off-chain client stack ⏳
- `clients/sdk` — typed Anchor client (TS/JS), foundation for everything else
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
- Address Lookup Tables for high-account txs
- Token-2022 evaluation (transfer fees, confidential transfer extensions)

## Locked decisions
See engram memory `sur-protocol/migration-decisions-locked` for full set:
- License BUSL-1.1, monorepo, mechanical port, Pyth oracle, USDC SPL classic
- nonReentrant guards removed (Solana provides), CEI manual
- Mapping 3 prospective-params (`fee_bps_at_post`, ParameterBump events) preserved
- Two-step ownership transfer pattern across all programs

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
