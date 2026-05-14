use anchor_lang::prelude::*;

// ============================================================
//                    CONSTANTS
// ============================================================

pub const BPS: u64 = 10_000;
pub const PRICE_PRECISION: u64 = 1_000_000;
pub const SIZE_PRECISION: u64 = 100_000_000;

pub const DEFAULT_MAKER_FEE_BPS: u32 = 2;
pub const DEFAULT_TAKER_FEE_BPS: u32 = 6;
pub const DEFAULT_MIN_SETTLEMENT_DELAY: i64 = 2;
pub const DEFAULT_MAX_SETTLEMENT_DELAY: i64 = 300;

pub const DEFAULT_SPREAD_TIER1_BPS: u32 = 5;
pub const DEFAULT_SPREAD_TIER2_BPS: u32 = 15;
pub const DEFAULT_SPREAD_TIER3_BPS: u32 = 30;

pub const MAX_FEE_BPS: u32 = 1000;
pub const MAX_DELAY_SECS: i64 = 3600;

// ============================================================
//                    CONFIG (singleton PDA)
// ============================================================

#[account]
pub struct OrderSettlementConfig {
    pub bump: u8,
    pub authority_bump: u8,

    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub fee_recipient: Pubkey,
    pub paused: bool,

    pub perp_engine_program: Pubkey,
    pub perp_engine_config: Pubkey,
    pub engine_operator_account: Pubkey,

    pub perp_vault_program: Pubkey,
    pub perp_vault_config: Pubkey,
    pub vault_operator_account: Pubkey,

    pub maker_fee_bps: u32,
    pub taker_fee_bps: u32,

    pub min_settlement_delay: i64,
    pub max_settlement_delay: i64,

    pub dynamic_spread_enabled: bool,
    pub spread_tier_1_bps: u32,
    pub spread_tier_2_bps: u32,
    pub spread_tier_3_bps: u32,

    pub batch_counter: u64,

    pub domain_separator: [u8; 32],
    pub cluster_id: u64,
}

impl OrderSettlementConfig {
    pub const SEED: &'static [u8] = b"config";
    pub const AUTHORITY_SEED: &'static [u8] = b"order_settlement_authority";

    // 8 disc + 1 + 1
    //   + 32*3 + 1
    //   + 32*3
    //   + 32*3
    //   + 4 + 4
    //   + 8 + 8
    //   + 1 + 4 + 4 + 4
    //   + 8
    //   + 32 + 8
    pub const SIZE: usize =
        8 + 1 + 1
        + 32 + 32 + 32 + 1
        + 32 + 32 + 32
        + 32 + 32 + 32
        + 4 + 4
        + 8 + 8
        + 1 + 4 + 4 + 4
        + 8
        + 32 + 8;
}

// ============================================================
//                    OPERATOR (per-operator PDA)
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

// ============================================================
//                    NONCE PAGE (per (trader, page) PDA)
// ============================================================
// Bitmap of 256 bits per page. page_index = nonce / 256.
// Bit position = nonce % 256.
// Mirrors Solidity `mapping(address => mapping(uint256 => bool))` densely.

#[account]
pub struct NoncePage {
    pub bump: u8,
    pub trader: Pubkey,
    pub page_index: u64,
    pub bits: [u8; 32],
}

impl NoncePage {
    pub const SEED_PREFIX: &'static [u8] = b"nonce_page";

    // 8 disc + 1 + 32 + 8 + 32
    pub const SIZE: usize = 8 + 1 + 32 + 8 + 32;

    pub fn is_set(&self, nonce: u64) -> bool {
        let bit = (nonce % 256) as usize;
        let byte = bit / 8;
        let mask = 1u8 << (bit % 8);
        (self.bits[byte] & mask) != 0
    }

    pub fn set(&mut self, nonce: u64) {
        let bit = (nonce % 256) as usize;
        let byte = bit / 8;
        let mask = 1u8 << (bit % 8);
        self.bits[byte] |= mask;
    }
}

// ============================================================
//                    ORDER SNAPSHOT (commit-reveal PDA)
// ============================================================
// Captured at commit_order; consumed at settle. Mapping 3 prospective
// semantics: param bumps between commit and settle do not retroactively
// alter the order's economics. Only used on the commit-reveal path —
// settle_one / settle_batch paths without commits read current config.

#[account]
pub struct OrderSnapshot {
    pub bump: u8,
    pub commit_hash: [u8; 32],
    pub commit_time: i64,

    pub maker_fee_bps: u32,
    pub taker_fee_bps: u32,
    pub min_settlement_delay: i64,
    pub dynamic_spread_enabled: bool,
    pub spread_tier_1_bps: u32,
    pub spread_tier_2_bps: u32,
    pub spread_tier_3_bps: u32,
}

impl OrderSnapshot {
    pub const SEED_PREFIX: &'static [u8] = b"commit";

    // 8 disc + 1 + 32 + 8 + 4 + 4 + 8 + 1 + 4 + 4 + 4
    pub const SIZE: usize = 8 + 1 + 32 + 8 + 4 + 4 + 8 + 1 + 4 + 4 + 4;
}

// ============================================================
//                    SIGNED ORDER (instruction arg, not stored)
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SignedOrder {
    pub trader: Pubkey,
    pub market_id: [u8; 32],
    pub is_long: bool,
    pub size: u64,
    pub price: u64,
    pub nonce: u64,
    pub expiry: i64,
    pub signed_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchedTrade {
    pub maker: SignedOrder,
    pub taker: SignedOrder,
    pub execution_price: u64,
    pub execution_size: u64,
}
