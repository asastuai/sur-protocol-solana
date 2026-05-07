# Solidity → Anchor Mapping

Side-by-side equivalence between [`A2ADarkPool.sol`](https://github.com/asastuai/sur-protocol/blob/master/contracts/src/A2ADarkPool.sol) and this Anchor program.

## Storage model

| Solidity | Anchor |
|---|---|
| `address public owner` | `DarkPoolConfig.owner: Pubkey` (singleton PDA seed `["config"]`) |
| `mapping(uint256 => Intent) intents` | `Intent` PDA per intent, seed `["intent", intent_id_le_bytes]` |
| `mapping(uint256 => Response) responses` | `Response` PDA per response, seed `["response", response_id_le_bytes]` |
| `mapping(address => AgentReputation) reputations` | `AgentReputation` PDA per agent, seed `["reputation", agent_pubkey]` |
| `mapping(uint256 => uint256[]) intentResponses` | Indexer-side (event-derived). Not stored on-chain — Solana account costs make append-only arrays expensive |
| `uint256[] activeIntentIds` | Indexer-side. Solana `getProgramAccounts` with discriminator filter replaces this view |
| `mapping(address => uint256) lastResponseTime` | Folded into `AgentReputation.last_response_time` |
| `mapping(address => bool) operators` | **Dropped from v0.1.** Operator role unused in upstream tests + not on the critical path. Revisit in v0.2 if an off-chain admin tool depends on it |

## Primitives

| Solidity | Anchor |
|---|---|
| `block.timestamp` | `Clock::get()?.unix_timestamp` (`i64`) |
| `block.number` | `Clock::get()?.slot` (`u64`) — used in `ParameterBump.effective_slot` |
| `msg.sender` | The signer account (must be `Signer<'info>`) |
| `address(0)` | `Pubkey::default()` |
| `uint256` | `u64` (USDC has 6 decimals; sizes/prices fit; we widen to `u128` for intermediate math) |
| `bytes32 marketId` | `[u8; 32]` |
| Custom errors (`error Foo()`) | `#[error_code] enum DarkPoolError` |
| Events | `#[event] struct` + `emit!()` |

## Modifiers / control flow

| Solidity | Anchor |
|---|---|
| `modifier onlyOwner` | `has_one = owner @ DarkPoolError::NotOwner` on the `AdminUpdate` accounts struct |
| `modifier whenNotPaused` | `require!(!config.paused, DarkPoolError::PausedError)` at the top of each handler |
| `modifier nonReentrant` (transient storage) | **Removed.** Solana forbids direct CPI reentrancy by default. The runtime guarantees it without a guard |
| CEI ordering | Preserved manually: status flips precede CPI calls |
| `revert ErrName()` | `return Err(DarkPoolError::ErrName.into())` or `require!(...)` |

## Function-level mapping

| Solidity | Anchor module / function |
|---|---|
| `constructor` | `instructions::admin::initialize` |
| `postIntent` | `instructions::post_intent::handler` |
| `cancelIntent` | `instructions::cancel_intent::handler` |
| `postResponse` | `instructions::post_response::handler` |
| `cancelResponse` | `instructions::cancel_response::handler` |
| `acceptAndSettle` | `instructions::accept_and_settle::handler` |
| `getReputationScore` | `AgentReputation::get_score` (view via account fetch) |
| `_updateReputation` | `instructions::accept_and_settle::update_reputation` (private fn) |
| `getOpenIntents` | Indexer-side via `getProgramAccounts` |
| `getResponses` | Indexer-side via `getProgramAccounts` filtered by `intent_id` |
| `getAgentProfile` | Account fetch on `reputation` PDA |
| `transferOwnership` / `acceptOwnership` | `admin::transfer_ownership` / `admin::accept_ownership` (two-step preserved) |
| `setOperator` | Not ported in v0.1 |
| `setFeeBps` | `admin::set_fee_bps` (with `ParameterBump` event) |
| `setFeeRecipient` | `admin::set_fee_recipient` |
| `setLargeTradeThreshold` | `admin::set_large_trade_threshold` (with `ParameterBump`) |
| `setLargeTradeMinReputation` | `admin::set_large_trade_min_reputation` (with `ParameterBump`) |
| `pause` / `unpause` | `admin::pause` / `admin::unpause` |

## Atomic settlement

Solidity calls `engine.openPosition()` twice + `vault.internalTransfer()` twice, atomic via reverting on any failure. In Anchor, these become four CPI calls (currently stubbed — see `accept_and_settle.rs`). Atomicity is preserved by the runtime: if any CPI fails, the whole tx reverts.

### v0.1 preview-mode semantics

Because the perp_engine and perp_vault programs are not yet ported, `accept_and_settle` in v0.1 flips Intent + Response statuses, updates reputation, and emits `A2ATradeSettled` — but does NOT open positions or move fees. To prevent indexers from treating these as real settlements, every preview-mode settle ALSO emits `SettlementPreviewMode` with the would-be `fee_per_side_uncollected`. Indexers must filter or flag any `A2ATradeSettled` that comes paired with this marker. Removed in v0.2 when CPIs land.

Key invariant from upstream H-11 fix: **fees are computed AFTER positions are opened, using the snapshotted `fee_bps_at_post`**, not the current `config.fee_bps`. An admin bump between `post_intent` and `accept_and_settle` does not retroactively alter the fee on this trade. This is the Mapping 3 prospective-only convention from upstream `docs/MAPPING_3_prospective_params.md`.

## Reputation

Solidity formula:
```
score = completedTrades / (completedTrades + expiredIntents + cancelledResponses) * 1000
```

Default for new agents (`total == 0`): `500` (50%).

Implemented identically in `AgentReputation::get_score`.

## Constants

All identical to Solidity:

```rust
PRICE_PRECISION       = 1_000_000   // 1e6
SIZE_PRECISION        = 100_000_000 // 1e8
BPS                   = 10_000
REPUTATION_PRECISION  = 1_000
```

Default config values (set in `initialize`, mirroring Solidity defaults):

```
fee_bps                       = 3      // 0.03% per side
min_intent_duration           = 60     // 1 minute
max_intent_duration           = 86_400 // 24 hours
response_cooldown             = 5      // 5 seconds
large_trade_threshold         = 10_000 * PRICE_PRECISION = $10K notional
large_trade_min_reputation    = 500    // 50%
```
