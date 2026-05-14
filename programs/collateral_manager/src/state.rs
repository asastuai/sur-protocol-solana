use anchor_lang::prelude::*;

pub const BPS: u64 = 10_000;
pub const PRICE_PRECISION: u64 = 1_000_000;

#[account]
pub struct CollateralManagerConfig {
    pub bump: u8,
    pub authority_bump: u8,

    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    pub vault_program: Pubkey,
    pub vault_config: Pubkey,
    pub vault_operator_account: Pubkey,

    pub liquidation_threshold_bps: u64,
    pub max_price_deviation_bps: u64,
    pub supported_token_count: u64,
}

impl CollateralManagerConfig {
    pub const SEED: &'static [u8] = b"config";
    pub const AUTHORITY_SEED: &'static [u8] = b"collateral_manager_authority";

    // 8 disc + 1 + 1 + 32*5 + 1 + 8*3
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 32 + 8 + 8 + 8;
}

#[account]
pub struct CollateralConfig {
    pub bump: u8,
    pub escrow_authority_bump: u8,

    pub mint: Pubkey,
    pub escrow: Pubkey,

    pub decimals: u8,
    pub haircut_bps: u64,
    pub price: u64,
    pub last_price_update: i64,
    pub max_price_age: i64,
    pub active: bool,
    pub total_deposited: u64,
    pub deposit_cap: u64,
    pub symbol: [u8; 16],
}

impl CollateralConfig {
    pub const SEED_PREFIX: &'static [u8] = b"collateral";
    pub const ESCROW_AUTH_SEED_PREFIX: &'static [u8] = b"vault";

    // 8 disc + 1 + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 16
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 16;
}

#[account]
pub struct TraderCollateral {
    pub bump: u8,
    pub mint: Pubkey,
    pub trader: Pubkey,

    pub amount: u64,
    pub credited_usdc: u64,

    /// Haircut bps snapshotted on transition empty -> non-empty. Reset when
    /// position fully closes. Mapping 3 prospective-only semantics.
    pub haircut_at_deposit: u64,
    /// Liquidation threshold bps snapshotted at the same moment.
    pub liquidation_threshold_at_deposit: u64,
}

impl TraderCollateral {
    pub const SEED_PREFIX: &'static [u8] = b"deposit";

    // 8 disc + 1 + 32 + 32 + 8*4
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 8 + 8 + 8 + 8;
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
