use anchor_lang::prelude::*;

pub const ONE_DAY_SECS: i64 = 24 * 60 * 60;

#[account]
pub struct InsuranceFundConfig {
    pub bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    /// PerpVault program id — used for the keeper-reward CPI in v0.3.
    pub vault: Pubkey,

    /// Cumulative bad debt absorbed (USDC, 6 decimals).
    pub total_bad_debt: u64,
    /// Cumulative keeper rewards paid (USDC, 6 decimals).
    pub total_keeper_rewards_paid: u64,
    /// Total liquidations processed.
    pub total_liquidations: u64,

    /// H-9: per-call cap (0 = unlimited).
    pub max_keeper_reward_per_call: u64,
    /// H-9: rolling 24h cap (0 = unlimited).
    pub max_daily_keeper_rewards: u64,
    /// Running total inside the current 24h window.
    pub daily_keeper_rewards_paid: u64,
    /// When the current 24h window started.
    pub daily_reward_reset_timestamp: i64,
}

impl InsuranceFundConfig {
    pub const SEED: &'static [u8] = b"insurance_fund_config";
    pub const AUTHORITY_SEED: &'static [u8] = b"insurance_fund_authority";

    // 8 (disc) + 1 (bump) + 32*3 (pubkeys) + 1 (paused) + 8*7 (u64) + 8 (i64)
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 1 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8;
}

#[account]
pub struct MarketBadDebt {
    pub bump: u8,
    pub market_id: [u8; 32],
    pub cumulative_bad_debt: u64,
}

impl MarketBadDebt {
    pub const SEED_PREFIX: &'static [u8] = b"market_bad_debt";
    pub const SIZE: usize = 8 + 1 + 32 + 8;
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
