use anchor_lang::prelude::*;

#[error_code]
pub enum TradingVaultError {
    #[msg("Caller is not manager")]
    NotManager,

    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not authorized operator")]
    NotOperator,

    #[msg("Vault is paused")]
    VaultPausedError,

    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Insufficient shares")]
    InsufficientShares,

    #[msg("Lockup not expired")]
    LockupNotExpired,

    #[msg("Deposit cap exceeded")]
    DepositCapExceeded,

    #[msg("Max drawdown breached")]
    MaxDrawdownBreached,

    #[msg("Vault already exists")]
    VaultAlreadyExists,

    #[msg("Vault not found")]
    VaultNotFound,

    #[msg("Invalid fees")]
    InvalidFees,

    #[msg("Invalid drawdown limit")]
    InvalidDrawdownLimit,

    #[msg("Drawdown cooldown still active")]
    DrawdownCooldownActive,

    #[msg("Minimum first deposit not met (1000 USDC)")]
    MinFirstDepositNotMet,

    #[msg("Deposit too small to issue shares")]
    DepositTooSmall,

    #[msg("Name too long")]
    NameTooLong,

    #[msg("Description too long")]
    DescriptionTooLong,

    #[msg("Equity passed to instruction is invalid")]
    InvalidEquity,

    #[msg("Math overflow")]
    MathOverflow,
}
