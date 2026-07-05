use anchor_lang::prelude::*;

#[error_code]
pub enum EngineError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not an authorized operator")]
    NotOperator,

    #[msg("Engine is paused")]
    PausedError,

    #[msg("Engine is not paused")]
    NotPaused,

    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Market not found")]
    MarketNotFound,

    #[msg("Market already exists")]
    MarketAlreadyExists,

    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Insufficient margin")]
    InsufficientMargin,

    #[msg("No position")]
    NoPosition,

    #[msg("Invalid price")]
    InvalidPrice,

    #[msg("Max position size exceeded")]
    MaxPositionExceeded,

    #[msg("Stale price (last update older than max age)")]
    StalePrice,

    #[msg("Position is not liquidatable (equity >= maintenance margin)")]
    PositionNotLiquidatable,

    #[msg("Invalid parameter")]
    InvalidParam,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Not a reduce (open/increase via open_position, full close via close_position)")]
    NotAReduce,
}
