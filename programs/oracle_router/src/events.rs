use anchor_lang::prelude::*;

#[event]
pub struct PriceUpdated {
    pub market_id: [u8; 32],
    pub mark_price: u64,
    pub index_price: u64,
    pub source: u8, // 0=Pyth, 1=Switchboard (future), 2=Both
    pub timestamp: i64,
}

#[event]
pub struct FeedConfigured {
    pub market_id: [u8; 32],
    pub pyth_feed: Pubkey,
    pub max_staleness_seconds: i64,
    pub max_deviation_bps: u64,
    pub max_confidence_bps: u64,
}

#[event]
pub struct FeedDeactivated {
    pub market_id: [u8; 32],
}

#[event]
pub struct DeviationWarning {
    pub market_id: [u8; 32],
    pub primary_price: u64,
    pub secondary_price: u64,
    pub deviation_bps: u64,
}

#[event]
pub struct OperatorUpdated {
    pub operator: Pubkey,
    pub status: bool,
}

#[event]
pub struct OracleCircuitBreakerTriggered {
    pub market_id: [u8; 32],
    pub old_price: u64,
    pub new_price: u64,
    pub change_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleCircuitBreakerReset {
    pub timestamp: i64,
}

#[event]
pub struct OwnershipTransferStarted {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
}

/// v0.2 stub-mode marker (mirrors SettlementPreviewMode in a2a_darkpool).
/// Indexers should flag `PriceUpdated` events paired with this marker as
/// not-yet-pushed-to-engine, since perp_engine CPI lands in v0.2.X.
#[event]
pub struct PricePushPreviewMode {
    pub market_id: [u8; 32],
    pub mark_price: u64,
    pub index_price: u64,
    pub note: String,
}
