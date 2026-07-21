use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Zero amount")]
    ZeroAmount,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Token transfer failed")]
    TransferFailed,

    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not an authorized operator")]
    NotOperator,

    #[msg("Vault is paused")]
    PausedError,

    #[msg("Vault is not paused")]
    NotPaused,

    #[msg("Reentrancy detected")]
    Reentrancy,

    #[msg("Deposit cap exceeded")]
    DepositCapExceeded,

    #[msg("Withdrawal exceeds max per transaction")]
    WithdrawalTooLarge,

    #[msg("Operator transfer exceeds max per transaction")]
    OperatorTransferTooLarge,

    #[msg("Array length mismatch in batch operation")]
    ArrayLengthMismatch,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("USDC mint mismatch")]
    UsdcMintMismatch,

    #[msg("from and to balance accounts must differ")]
    SameAccount,
}
