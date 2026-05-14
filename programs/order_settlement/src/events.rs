use anchor_lang::prelude::*;

#[event]
pub struct TradeSettled {
    pub market_id: [u8; 32],
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub price: u64,
    pub size: u64,
    pub taker_is_long: bool,
    pub maker_fee: u64,
    pub taker_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct BatchSettled {
    pub batch_id: u64,
    pub trades_count: u64,
    pub timestamp: i64,
}

#[event]
pub struct OperatorUpdated {
    pub operator: Pubkey,
    pub status: bool,
}

#[event]
pub struct FeeRecipientUpdated {
    pub old_recipient: Pubkey,
    pub new_recipient: Pubkey,
}

#[event]
pub struct PauseStatusChanged {
    pub is_paused: bool,
}

#[event]
pub struct TimeLockUpdated {
    pub new_min_delay_secs: i64,
}

#[event]
pub struct DynamicSpreadApplied {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub extra_fee_bps: u32,
    pub skew_ratio_bps: u32,
}

#[event]
pub struct OwnershipTransferred {
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferStarted {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct FeesUpdated {
    pub maker_fee_bps: u32,
    pub taker_fee_bps: u32,
}

#[event]
pub struct DynamicSpreadUpdated {
    pub enabled: bool,
}

#[event]
pub struct DynamicSpreadTiersUpdated {
    pub tier1: u32,
    pub tier2: u32,
    pub tier3: u32,
}

#[event]
pub struct OrderCommitted {
    pub commit_hash: [u8; 32],
    pub commit_time: i64,
}

/// Mapping 3 prospective-only param bump.
/// `param_id` is the sha256 of the canonical parameter name
/// (e.g. sha256("OrderSettlement.makerFeeBps")). `old_value` and
/// `new_value` are little-endian byte encodings of the parameter
/// (4 bytes for u32, 8 bytes for i64/u64, 1 byte for bool, or a
/// concatenation of 3*4 bytes for the spread tier triple).
#[event]
pub struct ParameterBump {
    pub param_id: [u8; 32],
    pub old_value: Vec<u8>,
    pub new_value: Vec<u8>,
    pub effective_slot: u64,
    pub admin: Pubkey,
}
