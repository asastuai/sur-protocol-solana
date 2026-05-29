use anchor_lang::prelude::*;

/// Maps 1:1 to the custom errors in A2ADarkPool.sol where possible.
/// Some Solidity require!() string-revert sites are promoted to typed
/// errors here so SDKs can parse them uniformly.
#[error_code]
pub enum DarkPoolError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Program is paused")]
    PausedError,

    #[msg("Zero address provided")]
    ZeroAddress,

    #[msg("Zero amount provided")]
    ZeroAmount,

    #[msg("Intent expired")]
    IntentExpired,

    #[msg("Intent not in Open status")]
    IntentNotOpen,

    #[msg("Caller is not intent creator")]
    NotIntentCreator,

    #[msg("Caller is not response creator")]
    NotResponseCreator,

    #[msg("Price out of range")]
    PriceOutOfRange,

    #[msg("Self trade not allowed")]
    SelfTrade,

    #[msg("Insufficient reputation for this trade size")]
    InsufficientReputation,

    #[msg("Response cooldown active")]
    CooldownActive,

    #[msg("min_price > max_price")]
    InvalidPriceRange,

    #[msg("Invalid duration (out of bounds)")]
    InvalidDuration,

    #[msg("Response not in Pending status")]
    ResponseNotPending,

    #[msg("Response expired")]
    ResponseExpired,

    #[msg("Response intent_id mismatch")]
    ResponseIntentMismatch,

    #[msg("Fee bps exceeds maximum (50)")]
    FeeBpsTooHigh,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Account does not match the canonical PDA for the resolved party/market")]
    InvalidAccount,
}
