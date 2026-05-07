use anchor_lang::prelude::*;

#[event]
pub struct ADLExecuted {
    pub market_id: [u8; 32],
    pub deleveraged_trader: Pubkey,
    pub reduced_size: i64,
    pub close_price: u64,
    pub bad_debt_covered: u64,
    pub timestamp: i64,
}

#[event]
pub struct ADLTriggered {
    pub market_id: [u8; 32],
    pub total_bad_debt: u64,
    pub insurance_fund_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct ADLParamsUpdated {
    pub min_bad_debt_threshold: u64,
    pub cooldown_secs: i64,
}

#[event]
pub struct ADLEnabledChanged {
    pub enabled: bool,
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
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}
