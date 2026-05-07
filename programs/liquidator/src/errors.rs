use anchor_lang::prelude::*;

#[error_code]
pub enum LiquidatorError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Liquidator is paused")]
    PausedError,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Math overflow")]
    MathOverflow,
}
