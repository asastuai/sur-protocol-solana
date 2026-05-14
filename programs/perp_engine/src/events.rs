use anchor_lang::prelude::*;

#[event]
pub struct MarketAdded {
    pub market_id: [u8; 32],
    pub initial_margin_bps: u64,
    pub maintenance_margin_bps: u64,
    pub max_position_size: u64,
}

#[event]
pub struct MarkPriceUpdated {
    pub market_id: [u8; 32],
    pub old_price: u64,
    pub new_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionOpened {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub size: i64,
    pub entry_price: u64,
    pub margin: u64,
}

#[event]
pub struct PositionModified {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub old_size: i64,
    pub new_size: i64,
    pub new_entry_price: u64,
    pub new_margin: u64,
    pub realized_pnl: i64,
}

#[event]
pub struct PositionClosed {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub closed_size: i64,
    pub exit_price: u64,
    pub realized_pnl: i64,
}

#[event]
pub struct OperatorUpdated {
    pub operator: Pubkey,
    pub status: bool,
}

#[event]
pub struct PauseStatusChanged {
    pub is_paused: bool,
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

#[event]
pub struct BadDebt {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    /// Shortfall amount (absolute). Solidity: loss - releasedMargin (close)
    /// or -effectiveMargin (liquidate).
    pub amount: u64,
    /// Liquidation = true; ordinary close with bad debt = false.
    pub via_liquidation: bool,
}

#[event]
pub struct LiquidationDistributed {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub keeper: Pubkey,
    pub keeper_reward: u64,
    pub insurance_payout: u64,
    pub bad_debt: u64,
}
