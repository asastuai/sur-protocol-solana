use anchor_lang::prelude::*;

#[event]
pub struct TxQueued {
    pub tx_hash: [u8; 32],
    pub target: Pubkey,
    pub eta: i64,
    pub queued_by: Pubkey,
}

#[event]
pub struct TxExecuted {
    pub tx_hash: [u8; 32],
    pub target: Pubkey,
    pub executed_by: Pubkey,
}

#[event]
pub struct TxCancelled {
    pub tx_hash: [u8; 32],
}

#[event]
pub struct DelayUpdated {
    pub old_delay: i64,
    pub new_delay: i64,
}

#[event]
pub struct OwnershipTransferred {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct GuardianUpdated {
    pub old_guardian: Pubkey,
    pub new_guardian: Pubkey,
}

#[event]
pub struct PausableTargetUpdated {
    pub target: Pubkey,
    pub status: bool,
}

#[event]
pub struct EmergencyPause {
    pub guardian: Pubkey,
    pub target: Pubkey,
}

#[event]
pub struct SetupCompleted {}
