use anchor_lang::prelude::*;

#[account]
pub struct ADLConfig {
    pub bump: u8,
    /// Bump for the adl_authority PDA — signs CPIs into perp_engine.
    pub authority_bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,
    pub adl_enabled: bool,

    /// Min bad debt (USDC 6 decimals) before ADL can activate.
    pub min_bad_debt_threshold: u64,
    /// Cooldown between ADL events (seconds).
    pub adl_cooldown_secs: i64,
    /// Last ADL execution timestamp.
    pub last_adl_time: i64,

    pub total_adl_events: u64,
    pub total_bad_debt_covered: u64,

    /// Program ids reserved for v0.3 CPI integration.
    pub perp_engine: Pubkey,
    pub perp_vault: Pubkey,
    pub insurance_fund: Pubkey,
}

impl ADLConfig {
    pub const SEED: &'static [u8] = b"adl_config";
    pub const AUTHORITY_SEED: &'static [u8] = b"adl_authority";

    // 8 (disc) + 1 (bump) + 1 (authority_bump) + 32*4 (pubkeys)
    // + 1 (paused) + 1 (adl_enabled) + 8*4 (u64) + 8 (i64 last_adl_time)
    // + 8 (i64 cooldown_secs)
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 32 + 32 + 32;
}

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
