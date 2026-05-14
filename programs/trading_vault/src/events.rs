use anchor_lang::prelude::*;

#[event]
pub struct VaultCreated {
    pub vault_id: [u8; 32],
    pub manager: Pubkey,
    pub performance_fee_bps: u64,
    pub management_fee_bps: u64,
}

#[event]
pub struct VaultDeposit {
    pub vault_id: [u8; 32],
    pub depositor: Pubkey,
    pub usdc_amount: u64,
    pub shares_issued: u128,
    pub equity_at_time: u64,
}

#[event]
pub struct VaultWithdraw {
    pub vault_id: [u8; 32],
    pub depositor: Pubkey,
    pub shares_burned: u128,
    pub usdc_returned: u64,
    pub equity_at_time: u64,
}

#[event]
pub struct VaultTradeExecuted {
    pub vault_id: [u8; 32],
    pub market_id: [u8; 32],
    pub size_delta: i64,
    pub price: u64,
}

#[event]
pub struct PerformanceFeeCollected {
    pub vault_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct ManagementFeeCollected {
    pub vault_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct VaultPauseChanged {
    pub vault_id: [u8; 32],
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
pub struct OperatorUpdated {
    pub operator: Pubkey,
    pub status: bool,
}

#[event]
pub struct DrawdownCooldownUpdated {
    pub old_secs: i64,
    pub new_secs: i64,
}

#[event]
pub struct VaultSafetyLimitsUpdated {
    pub vault_id: [u8; 32],
    pub deposit_cap: u64,
    pub lockup_period_secs: i64,
    pub max_drawdown_bps: u64,
}
