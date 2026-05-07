use anchor_lang::prelude::*;

#[error_code]
pub enum InsuranceFundError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not authorized operator")]
    NotOperator,

    #[msg("Insurance fund is paused")]
    PausedError,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Insufficient fund balance for this reward")]
    InsufficientFundBalance,

    #[msg("Keeper reward exceeds per-call cap")]
    KeeperRewardExceedsPerCallCap,

    #[msg("Daily keeper reward cap exceeded")]
    DailyKeeperRewardCapExceeded,

    #[msg("Math overflow")]
    MathOverflow,
}
