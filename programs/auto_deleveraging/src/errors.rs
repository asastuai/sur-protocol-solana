use anchor_lang::prelude::*;

#[error_code]
pub enum ADLError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not authorized operator")]
    NotOperator,

    #[msg("ADL is paused")]
    PausedError,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("ADL is disabled")]
    ADLDisabled,

    #[msg("Insurance fund balance still above threshold")]
    InsuranceFundSufficient,

    #[msg("Cooldown still active since last ADL event")]
    CooldownActive,

    #[msg("Bad debt below activation threshold")]
    BadDebtBelowThreshold,

    #[msg("No position to deleverage")]
    NoPosition,

    #[msg("Math overflow")]
    MathOverflow,
}
