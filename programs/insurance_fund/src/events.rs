use anchor_lang::prelude::*;

#[event]
pub struct BadDebtRecorded {
    pub market_id: [u8; 32],
    pub trader: Pubkey,
    pub amount: u64,
    pub total_bad_debt: u64,
}

#[event]
pub struct KeeperRewardPaid {
    pub keeper: Pubkey,
    pub amount: u64,
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

#[event]
pub struct MaxKeeperRewardUpdated {
    pub per_call: u64,
    pub daily: u64,
}
