use anchor_lang::prelude::*;

// ============================================================
//                    CONSTANTS
// ============================================================
// Match Solidity precision exactly so SDKs and indexers stay consistent
// across Base + Solana deployments.

pub const PRICE_PRECISION: u64 = 1_000_000;       // 1e6 — USDC-style price
pub const SIZE_PRECISION: u64 = 100_000_000;       // 1e8 — position size
pub const BPS: u64 = 10_000;                       // basis points
pub const REPUTATION_PRECISION: u64 = 1_000;       // 1000 = 100%

// ============================================================
//                    DARK POOL CONFIG (singleton PDA)
// ============================================================
// Solidity: contract-level state (owner, paused, fees, thresholds, counters).
// Anchor:   one PDA seeded by ["config"], holds the same fields.

#[account]
pub struct DarkPoolConfig {
    pub bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    pub fee_bps: u64,
    pub fee_recipient: Pubkey,

    pub min_intent_duration: i64,
    pub max_intent_duration: i64,
    pub response_cooldown: i64,

    pub large_trade_threshold: u64,
    pub large_trade_min_reputation: u64,

    pub next_intent_id: u64,
    pub next_response_id: u64,

    // Program ids of the perp engine + vault. Used at CPI time once those
    // programs are ported. Stored here so admin can swap them without code redeploy.
    pub perp_engine: Pubkey,
    pub perp_vault: Pubkey,
}

impl DarkPoolConfig {
    pub const SEED: &'static [u8] = b"config";

    // 8 (discriminator) + 1 (bump) + 32*4 (pubkeys) + 1 (paused)
    // + 8*8 (u64 fields) + 8*3 (i64 fields)
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 1 + 8 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 32 + 32;
}

// ============================================================
//          FRESHNESS CONFIG (proof-of-context sidecar PDA)
// ============================================================
// Proof-of-context freshness parameters, kept in a SEPARATE PDA from
// DarkPoolConfig so adding them does not change the existing config layout
// (which would break deserialization of the already-deployed config account).
// One PDA seeded by ["freshness_config"]; created once via init_freshness_config.

#[account]
pub struct FreshnessConfig {
    pub bump: u8,
    /// Max age, in seconds, of the canonical market price at settlement time
    /// (`now - Market.last_price_update`). A negotiated trade whose market
    /// price is older than this does not clear (proof-of-context `f_i`).
    pub max_settlement_price_age: i64,
}

impl FreshnessConfig {
    pub const SEED: &'static [u8] = b"freshness_config";

    // 8 (discriminator) + 1 (bump) + 8 (i64)
    pub const SIZE: usize = 8 + 1 + 8;
}

// ============================================================
//                    INTENT STATUS / RESPONSE STATUS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum IntentStatus {
    Open,
    Filled,
    Cancelled,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResponseStatus {
    Pending,
    Accepted,
    Cancelled,
    Expired,
}

// ============================================================
//                    INTENT (per-intent PDA)
// ============================================================
// Solidity: mapping(uint256 => Intent) intents.
// Anchor:   one PDA per intent_id, seed ["intent", intent_id_le_bytes].

#[account]
pub struct Intent {
    pub bump: u8,
    pub id: u64,
    pub agent: Pubkey,
    pub market_id: [u8; 32],
    pub is_buy: bool,
    pub size: u64,
    pub min_price: u64,
    pub max_price: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub status: IntentStatus,
    pub filled_response_id: u64,

    /// Fee in bps snapshotted at intent post time.
    /// Mirrors Solidity Mapping 3 prospective-only convention: settlement
    /// uses this value, NOT the current config.fee_bps. Admin bumps to
    /// fee_bps do not retroactively alter fees on intents already posted.
    pub fee_bps_at_post: u64,

    /// Proof-of-context: a 32-byte commitment to the off-chain context this
    /// agent reasoned over when forming its quote (model + input-world view).
    /// Authenticated by the agent's own tx signature at post time. `[0u8; 32]`
    /// means "none". Stored + emitted for binding / audit / dispute.
    pub context_commitment: [u8; 32],
}

impl Intent {
    pub const SEED_PREFIX: &'static [u8] = b"intent";

    // 8 (disc) + 1 + 8 + 32 + 32 + 1 + 8*5 + 1 (enum tag) + 8 + 8 + 32 (context_commitment)
    pub const SIZE: usize = 8 + 1 + 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 32;
}

// ============================================================
//                    RESPONSE (per-response PDA)
// ============================================================

#[account]
pub struct Response {
    pub bump: u8,
    pub id: u64,
    pub intent_id: u64,
    pub agent: Pubkey,
    pub price: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub status: ResponseStatus,

    /// Proof-of-context commitment for this quote (see `Intent::context_commitment`).
    pub context_commitment: [u8; 32],
}

impl Response {
    pub const SEED_PREFIX: &'static [u8] = b"response";

    // 8 (disc) + 1 + 8 + 8 + 32 + 8 + 8 + 8 + 1 + 32 (context_commitment)
    pub const SIZE: usize = 8 + 1 + 8 + 8 + 32 + 8 + 8 + 8 + 1 + 32;
}

// ============================================================
//                    AGENT REPUTATION (per-agent PDA)
// ============================================================
// Solidity: mapping(address => AgentReputation) reputations.
// Anchor:   one PDA per agent, seed ["reputation", agent_pubkey].
//
// Also stores last_response_time, which Solidity holds in a separate mapping.
// Bundling them avoids passing two PDAs in postResponse.

#[account]
#[derive(Default)]
pub struct AgentReputation {
    pub bump: u8,
    pub agent: Pubkey,
    pub completed_trades: u64,
    pub total_volume: u64,
    pub expired_intents: u64,
    pub cancelled_responses: u64,
    pub first_trade_at: i64,
    pub last_trade_at: i64,
    pub last_response_time: i64,
}

impl AgentReputation {
    pub const SEED_PREFIX: &'static [u8] = b"reputation";

    // 8 (disc) + 1 + 32 + 8*4 + 8*3
    pub const SIZE: usize = 8 + 1 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8;

    /// Mirrors Solidity getReputationScore: completedTrades / total * REPUTATION_PRECISION.
    /// New agents (no history) default to 500 (50%).
    pub fn get_score(&self) -> u64 {
        let total = self
            .completed_trades
            .saturating_add(self.expired_intents)
            .saturating_add(self.cancelled_responses);
        if total == 0 {
            return 500;
        }
        self.completed_trades
            .saturating_mul(REPUTATION_PRECISION)
            / total
    }
}
