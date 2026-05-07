use anchor_lang::prelude::*;

#[account]
pub struct LiquidatorConfig {
    pub bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    /// Engine program id this liquidator targets.
    pub perp_engine: Pubkey,

    /// Insurance fund program id (reserved for v0.3 reward routing).
    pub insurance_fund: Pubkey,

    /// Cumulative liquidations across all keepers.
    pub total_liquidations: u64,
}

impl LiquidatorConfig {
    pub const SEED: &'static [u8] = b"liquidator_config";

    // 8 (disc) + 1 + 32 + 32 + 1 + 32 + 32 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 1 + 32 + 32 + 8;
}

/// Per-keeper liquidation count — drives keeper leaderboards / rewards.
#[account]
pub struct KeeperStats {
    pub bump: u8,
    pub keeper: Pubkey,
    pub liquidations: u64,
}

impl KeeperStats {
    pub const SEED_PREFIX: &'static [u8] = b"keeper";
    pub const SIZE: usize = 8 + 1 + 32 + 8;
}
