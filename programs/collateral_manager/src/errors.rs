use anchor_lang::prelude::*;

#[error_code]
pub enum CollateralError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not authorized operator")]
    NotOperator,

    #[msg("CollateralManager is paused")]
    PausedError,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Collateral not supported")]
    CollateralNotSupported,

    #[msg("Collateral already exists")]
    CollateralAlreadyExists,

    #[msg("Collateral paused")]
    CollateralPausedError,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Stale price")]
    StalePrice,

    #[msg("Future timestamp")]
    FutureTimestamp,

    #[msg("Haircut bps invalid")]
    HaircutInvalid,

    #[msg("Liquidation threshold invalid")]
    ThresholdInvalid,

    #[msg("Deviation bps invalid")]
    DeviationInvalid,

    #[msg("Price deviation too high")]
    PriceDeviationTooHigh,

    #[msg("Deposit cap exceeded")]
    DepositCapExceeded,

    #[msg("Deposit too small for credit")]
    DepositTooSmall,

    #[msg("Symbol too long (max 16 bytes)")]
    SymbolTooLong,

    #[msg("Position is not undercollateralized")]
    NotUndercollateralized,

    #[msg("Math overflow")]
    MathOverflow,
}
