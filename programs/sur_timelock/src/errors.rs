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

    #[msg("Caller is not the pending owner")]
    NotPendingOwner,

    #[msg("tx_hash does not bind the queued payload (target, instruction_hash, accounts_hash)")]
    InvalidTxHash,

    #[msg("Dispatched target program does not match the queued target")]
    InvalidTarget,

    #[msg("Dispatched instruction data does not match the queued instruction_hash")]
    InstructionHashMismatch,

    #[msg("Dispatched accounts do not match the queued accounts_hash")]
    AccountsHashMismatch,
}
