use anchor_lang::prelude::*;

// ============================================================
//                    CONSTANTS
// ============================================================
// Solidity uses three precisions on this contract:
//   PRICE_PRECISION (1e6) — USDC + equity-per-share
//   SHARE_PRECISION (1e18) — internal share units
//   BPS (10_000) — fee + drawdown bps
// SECONDS_PER_YEAR = 365.25 days = 31_557_600 — match Solidity exactly.

pub const BPS: u64 = 10_000;
pub const PRICE_PRECISION: u128 = 1_000_000;
pub const SHARE_PRECISION: u128 = 1_000_000_000_000_000_000;
pub const SECONDS_PER_YEAR: u64 = 31_557_600;

/// Precision ratio for first deposit: shares = amount * (SHARE/PRICE) = amount * 1e12.
pub const SHARE_PER_PRICE: u128 = 1_000_000_000_000;

/// Maximum vault name length (bytes).
pub const NAME_MAX_LEN: usize = 64;
/// Maximum vault description length (bytes).
pub const DESCRIPTION_MAX_LEN: usize = 256;

/// Default drawdown cooldown: 24 hours.
pub const DEFAULT_DRAWDOWN_COOLDOWN_SECS: i64 = 86_400;

/// Solidity M-22: minimum first deposit = 1000 USDC (1000 * PRICE_PRECISION).
pub const MIN_FIRST_DEPOSIT: u64 = 1_000_000_000;

// ============================================================
//                    TRADING VAULT CONFIG (singleton PDA)
// ============================================================

#[account]
pub struct TradingVaultConfig {
    pub bump: u8,
    pub authority_bump: u8,

    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    pub perp_vault_program: Pubkey,
    pub perp_vault_config: Pubkey,
    pub vault_operator_account: Pubkey,

    pub perp_engine_program: Pubkey,
    pub perp_engine_config: Pubkey,
    pub engine_operator_account: Pubkey,

    pub drawdown_cooldown_secs: i64,
    pub vault_count: u64,
}

impl TradingVaultConfig {
    pub const SEED: &'static [u8] = b"config";
    pub const AUTHORITY_SEED: &'static [u8] = b"trading_vault_authority";

    // 8 disc + 1 + 1 + 32*8 + 1 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8;
}

// ============================================================
//                    VAULT (per vault PDA)
// ============================================================

#[account]
pub struct Vault {
    pub bump: u8,

    pub id: [u8; 32],
    pub manager: Pubkey,
    pub paused: bool,

    pub total_shares: u128,
    pub total_deposited: u64,
    pub total_withdrawn: u64,

    pub performance_fee_bps: u64,
    pub management_fee_bps: u64,

    pub high_water_mark: u128,
    pub last_fee_accrual: i64,

    pub deposit_cap: u64,
    pub lockup_period_secs: i64,
    pub max_drawdown_bps: u64,

    pub drawdown_paused_at: i64,
    pub created_at: i64,

    pub name_len: u8,
    pub name: [u8; NAME_MAX_LEN],
    pub description_len: u16,
    pub description: [u8; DESCRIPTION_MAX_LEN],
}

impl Vault {
    pub const SEED_PREFIX: &'static [u8] = b"vault";

    // 8 disc + 1 + 32 + 32 + 1
    //   + 16 (u128 total_shares) + 8 + 8
    //   + 8 + 8
    //   + 16 (u128 hwm) + 8
    //   + 8 + 8 + 8
    //   + 8 + 8
    //   + 1 + 64 + 2 + 256
    pub const SIZE: usize =
        8 + 1 + 32 + 32 + 1
        + 16 + 8 + 8
        + 8 + 8
        + 16 + 8
        + 8 + 8 + 8
        + 8 + 8
        + 1 + NAME_MAX_LEN + 2 + DESCRIPTION_MAX_LEN;
}

// ============================================================
//                    DEPOSITOR (per vault+depositor PDA)
// ============================================================

#[account]
#[derive(Default)]
pub struct Depositor {
    pub bump: u8,
    pub vault_id: [u8; 32],
    pub depositor: Pubkey,

    pub shares: u128,
    pub deposit_timestamp: i64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
}

impl Depositor {
    pub const SEED_PREFIX: &'static [u8] = b"share";

    // 8 disc + 1 + 32 + 32 + 16 + 8 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 16 + 8 + 8 + 8;
}

// ============================================================
//                    OPERATOR (per operator PDA)
// ============================================================

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
