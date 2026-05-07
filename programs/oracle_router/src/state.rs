use anchor_lang::prelude::*;

// ============================================================
//                    CONSTANTS
// ============================================================

pub const TARGET_DECIMALS: u32 = 6;
pub const TARGET_PRECISION: u64 = 1_000_000;
pub const BPS: u64 = 10_000;

// ============================================================
//                    ORACLE CONFIG (singleton PDA)
// ============================================================
// Solidity: contract-level state (owner, paused-equivalent via CB, CB params,
// max change bps, cooldown, sequencer feed). Solana drops sequencer-feed
// (no L2 sequencer concept) and embeds the rest into the singleton.

#[account]
pub struct OracleConfig {
    pub bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,

    /// Whether trading should pause due to oracle anomaly.
    pub circuit_breaker_active: bool,
    pub circuit_breaker_triggered_at: i64,
    pub cooldown_secs: i64,

    /// Max price change per update in BPS — larger moves trigger CB.
    pub max_price_change_bps: u64,

    /// Required consecutive good prices before auto-resetting CB (M-17 fix preserved).
    pub good_price_count_after_cb: u64,
    pub required_good_prices_for_reset: u64,
}

impl OracleConfig {
    pub const SEED: &'static [u8] = b"oracle_config";

    // 8 (disc) + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8;
}

// ============================================================
//                    FEED CONFIG (per-market PDA)
// ============================================================
// Solidity: mapping(bytes32 => FeedConfig). Anchor: one PDA per market.
// pyth_feed_id is kept as a Pubkey (Pyth on Solana addresses feeds by account
// pubkey, not bytes32 ID — the bytes32 form is a Pyth-EVM convention).
// Chainlink fields dropped: not on Solana.

#[account]
pub struct FeedConfig {
    pub bump: u8,
    pub market_id: [u8; 32],

    /// Pyth price feed account on Solana (set to default Pubkey to use external operator price).
    pub pyth_feed: Pubkey,

    pub max_staleness_seconds: i64,

    /// Max allowed deviation between Pyth and a secondary source (Switchboard later).
    /// Currently informational; activated when secondary source lands in v0.2.X.
    pub max_deviation_bps: u64,

    /// Max Pyth confidence interval as % of price.
    pub max_confidence_bps: u64,

    pub active: bool,

    /// Last pushed price (mark) + timestamp for change-detection + CB.
    pub last_price: u64,
    pub last_price_timestamp: i64,
}

impl FeedConfig {
    pub const SEED_PREFIX: &'static [u8] = b"feed";

    // 8 (disc) + 1 + 32 (marketId) + 32 (pyth feed) + 8 + 8 + 8 + 1 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 8 + 8 + 8 + 1 + 8 + 8;
}

// ============================================================
//                    OPERATOR (per-operator PDA)
// ============================================================
// Same pattern as perp_vault.

#[account]
pub struct Operator {
    pub bump: u8,
    pub operator: Pubkey,
    pub authorized: bool,
}

impl Operator {
    pub const SEED_PREFIX: &'static [u8] = b"operator";

    pub const SIZE: usize = 8 + 1 + 32 + 1;
}
