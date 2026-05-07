use anchor_lang::prelude::*;

#[event]
pub struct Deposited {
    pub account: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct Withdrawn {
    pub account: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct InternalTransferred {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub operator: Pubkey,
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
pub struct DepositCapUpdated {
    pub old_cap: u64,
    pub new_cap: u64,
}

#[event]
pub struct MaxWithdrawalUpdated {
    pub old_max: u64,
    pub new_max: u64,
}

#[event]
pub struct MaxOperatorTransferUpdated {
    pub old_max: u64,
    pub new_max: u64,
}

#[event]
pub struct CollateralCredited {
    pub trader: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CollateralDebited {
    pub trader: Pubkey,
    pub amount: u64,
}
