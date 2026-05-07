use anchor_lang::prelude::*;

#[error_code]
pub enum TimelockError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not guardian")]
    NotGuardian,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Tx not queued")]
    TxNotQueued,

    #[msg("Tx already queued")]
    TxAlreadyQueued,

    #[msg("Tx not ready (still in delay period)")]
    TxNotReady,

    #[msg("Tx expired (past grace period)")]
    TxExpired,

    #[msg("Delay too short (min 24h)")]
    DelayTooShort,

    #[msg("Delay too long (max 30 days)")]
    DelayTooLong,

    #[msg("Invalid pause target (not registered)")]
    InvalidPauseTarget,

    #[msg("Setup already complete (batch_set_pausable_targets disabled)")]
    SetupAlreadyComplete,

    #[msg("Math overflow")]
    MathOverflow,
}
