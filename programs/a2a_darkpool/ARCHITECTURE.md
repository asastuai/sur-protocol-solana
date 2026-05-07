# Architecture

## PDA layout

| PDA | Seeds | Size | Purpose |
|---|---|---|---|
| `DarkPoolConfig` | `["config"]` | ~204 bytes | Singleton: owner, fees, thresholds, pause, counters, perp_engine + perp_vault program ids |
| `Intent` | `["intent", id_le_bytes]` | ~131 bytes | One per intent ever posted. Holds `feeBpsAtPost` snapshot |
| `Response` | `["response", id_le_bytes]` | ~98 bytes | One per response ever posted |
| `AgentReputation` | `["reputation", agent_pubkey]` | ~105 bytes | One per agent. Tracks completed_trades / total_volume / expired_intents / cancelled_responses + last_response_time for cooldown |

PDAs are **append-only**: cancelling an intent flips `status` but does not deallocate. This matches Solidity behaviour and keeps history queryable. If rent reclaim is needed later, add a `close` instruction gated by status terminal states.

## Instruction surface

```
initialize                       // one-time setup
transfer_ownership / accept_ownership  // two-step ownership handoff
set_fee_bps                       // prospective (Mapping 3) — emits ParameterBump
set_fee_recipient
set_large_trade_threshold         // prospective — emits ParameterBump
set_large_trade_min_reputation    // prospective — emits ParameterBump
pause / unpause

post_intent / cancel_intent
post_response / cancel_response
accept_and_settle                 // atomic, calls perp_engine + perp_vault CPIs
```

## CPI plan

`accept_and_settle` requires four cross-program invocations to fully replicate Solidity behaviour. Currently stubbed:

### CPI #1 — perp_engine::open_position (buyer side)
```rust
let cpi_ctx = CpiContext::new(
    ctx.accounts.perp_engine_program.to_account_info(),
    perp_engine::cpi::accounts::OpenPosition {
        market: ...,
        trader: ...,
        position: ...,           // PDA per (market, trader)
        vault: ...,
        oracle: ...,
        clock: ...,
    },
);
perp_engine::cpi::open_position(cpi_ctx, market_id, buyer, size as i64, price)?;
```

### CPI #2 — perp_engine::open_position (seller side)
Identical to #1 but with `-size` as the signed delta.

### CPI #3 — perp_vault::internal_transfer (buyer fee)
```rust
let cpi_ctx = CpiContext::new(
    ctx.accounts.perp_vault_program.to_account_info(),
    perp_vault::cpi::accounts::InternalTransfer {
        from: buyer_collateral_account,
        to: fee_recipient_collateral_account,
        authority: ...,
    },
);
perp_vault::cpi::internal_transfer(cpi_ctx, fee_per_side)?;
```

### CPI #4 — perp_vault::internal_transfer (seller fee)
Identical to #3 with `seller` as `from`.

**Atomicity guarantee:** Solana reverts the entire tx if any CPI fails. The Solidity `nonReentrant` modifier is unnecessary — direct re-entry into a calling program is forbidden by the runtime.

## Account-passing implications

When CPIs land, `AcceptAndSettle` will need to accept additional accounts:

- `perp_engine_program: Program<'info, PerpEngine>`
- `perp_vault_program: Program<'info, PerpVault>`
- `buyer_position`, `seller_position` (PDAs in perp_engine)
- `buyer_collateral`, `seller_collateral`, `fee_recipient_collateral` (token accounts)
- `oracle` account (Pyth price update v2)
- `token_program`

This pushes the account count to ~12-15 for `accept_and_settle`. Within Solana's per-tx account limit (64 currently, much higher with v0 transactions + address lookup tables).

## Security notes

| Concern | Mitigation |
|---|---|
| Reentrancy | Runtime forbids; CEI preserved manually anyway |
| Fee retroactive bump | `fee_bps_at_post` snapshot at `post_intent` (H-11 fix from upstream) |
| Large-trade gating | Reputation check at `post_intent`; large notionals revert if score < threshold |
| Self-trade | `intent.agent != responder.key()` check in `post_response` |
| Spam responses | Cooldown via `last_response_time` on agent reputation |
| Owner takeover | Two-step ownership transfer (`pending_owner` → `accept_ownership`) |
| Price out of range | Range check in `post_response` |
| Expiry | Both intent + response have explicit `expires_at` enforced at every state transition |

## Indexer responsibilities

The following Solidity views are NOT on-chain in Anchor — they are computed off-chain from program accounts:

- `getOpenIntents(market_id)` → `getProgramAccounts(programId, filter: discriminator + status=Open + market_id)`
- `getResponses(intent_id)` → `getProgramAccounts(programId, filter: discriminator + intent_id)`
- `totalIntents` → `config.next_intent_id - 1`

These should be exposed by a SUR-side indexer (e.g. a Helius webhook + Postgres, or a Geyser plugin) that mirrors the upstream `sur-protocol/api` package.

## Open questions for v0.2

1. Do `perp_engine` and `perp_vault` get ported as separate programs or as one combined `sur_perps` program? Recommend separate to mirror the Solidity boundary, but combined gives one-CPI settlement instead of four.
2. Reputation portability: should `TrustLayer` (separate repo) be the authoritative reputation store and this program become a reader? Decide before v0.5.
3. Operator role from Solidity (`mapping(address => bool) operators`) — port now or delete? Audit usage in the upstream test suite first.
