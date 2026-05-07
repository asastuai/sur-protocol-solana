use anchor_lang::prelude::*;

#[event]
pub struct LiquidationExecuted {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub keeper: Pubkey,
    pub timestamp: i64,
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
