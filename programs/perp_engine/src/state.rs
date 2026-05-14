use anchor_lang::prelude::*;

// ============================================================
//                    CONSTANTS
// ============================================================

pub const PRICE_PRECISION: u64 = 1_000_000;        // 1e6
pub const SIZE_PRECISION: u64 = 100_000_000;        // 1e8
pub const BPS: u64 = 10_000;

// Liquidation reward constants (mirror PerpEngine.sol _distributeLiquidationRewards)
pub const KEEPER_REWARD_BAD_DEBT_BPS: u64 = 5;     // 0.05% of notional, paid from insurance
pub const KEEPER_REWARD_CAP_BPS: u64 = 500;        // 5% cap on solvent path

// ============================================================
//                    ENGINE CONFIG (singleton PDA)
// ============================================================

#[account]
pub struct EngineConfig {
    pub bump: u8,
    /// Bump for the engine_authority PDA — used to sign CPIs into perp_vault.
    pub authority_bump: u8,
    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    /// Pubkey of the perp_vault program (for CPI on settlement).
    pub perp_vault: Pubkey,

    /// Pubkey of the oracle_router program (only this program may push prices).
    pub oracle_router: Pubkey,
}

impl EngineConfig {
    pub const SEED: &'static [u8] = b"engine_config";
    pub const AUTHORITY_SEED: &'static [u8] = b"engine_authority";

    // 8 (disc) + 1 + 1 + 32 + 32 + 1 + 32 + 32
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 32 + 32;
}

// ============================================================
//                    MARKET (per-market PDA)
// ============================================================
// Solidity Market struct simplified for v0.2 core: skips OI caps, skew, margin
// tiers, funding intervals (those land in v0.3 in the Liquidator and
// AutoDeleveraging programs + a funding program).

#[account]
pub struct Market {
    pub bump: u8,
    pub market_id: [u8; 32],
    pub active: bool,

    /// 5% = 500 — required margin to open (= max 20x leverage)
    pub initial_margin_bps: u64,

    /// 2.5% = 250 — below this is liquidatable (consumed by Liquidator program v0.3)
    pub maintenance_margin_bps: u64,

    /// Max position size per trader (SIZE_PRECISION units)
    pub max_position_size: u64,

    /// Mark price (6 decimals) — used for PnL + maintenance margin
    pub mark_price: u64,
    /// Index price (6 decimals) — used for funding (v0.3)
    pub index_price: u64,
    pub last_price_update: i64,

    /// Open interest in size units
    pub open_interest_long: u64,
    pub open_interest_short: u64,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";

    // 8 (disc) + 1 + 32 + 1 + 8*7 (u64 fields) + 8 (i64)
    pub const SIZE: usize = 8 + 1 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8;
}

// ============================================================
//                    POSITION (per market+trader PDA)
// ============================================================

#[account]
#[derive(Default)]
pub struct Position {
    pub bump: u8,
    pub market_id: [u8; 32],
    pub trader: Pubkey,

    /// Signed size — positive=long, negative=short, zero=no position
    pub size: i64,
    /// Average entry price (6 decimals)
    pub entry_price: u64,
    /// Locked margin in USDC (6 decimals)
    pub margin: u64,
    pub last_updated: i64,
}

impl Position {
    pub const SEED_PREFIX: &'static [u8] = b"position";

    // 8 (disc) + 1 + 32 + 32 + 8 + 8 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 8 + 8 + 8 + 8;
}

// ============================================================
//                    OPERATOR (per-operator PDA)
// ============================================================
// For darkpool, oracle_router, etc. that need to call openPosition.

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
