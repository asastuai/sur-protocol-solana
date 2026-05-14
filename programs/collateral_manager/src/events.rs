use anchor_lang::prelude::*;

#[event]
pub struct CollateralAdded {
    pub mint: Pubkey,
    pub symbol: [u8; 16],
    pub haircut_bps: u64,
    pub decimals: u8,
}

#[event]
pub struct CollateralDeposited {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub credited_usdc: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub debited_usdc: u64,
}

#[event]
pub struct CollateralPriceUpdated {
    pub mint: Pubkey,
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct CollateralHaircutUpdated {
    pub mint: Pubkey,
    pub old_haircut: u64,
    pub new_haircut: u64,
}

#[event]
pub struct CollateralPauseChanged {
    pub mint: Pubkey,
    pub active: bool,
}

#[event]
pub struct CollateralLiquidated {
    pub trader: Pubkey,
    pub mint: Pubkey,
    pub token_amount: u64,
    pub usdc_debit: u64,
    pub keeper: Pubkey,
}

#[event]
pub struct LiquidationThresholdUpdated {
    pub old_threshold: u64,
    pub new_threshold: u64,
}

#[event]
pub struct MaxPriceDeviationUpdated {
    pub old_bps: u64,
    pub new_bps: u64,
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

/// Mapping 3 — every prospective-only param bump emits this.
#[event]
pub struct ParameterBump {
    /// keccak-equivalent: sha256 of canonical name (per-token where applicable).
    pub param_id: [u8; 32],
    pub old_value: u64,
    pub new_value: u64,
    pub effective_slot: u64,
    pub admin: Pubkey,
}
