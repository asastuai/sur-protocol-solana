use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not an authorized operator")]
    NotOperator,

    #[msg("Zero address provided")]
    ZeroAddress,

    #[msg("Feed not configured for this market")]
    FeedNotConfigured,

    #[msg("Price is stale (older than max_staleness_seconds)")]
    PriceStale,

    #[msg("Price is negative or zero")]
    PriceNegativeOrZero,

    #[msg("Price deviation between sources exceeds max")]
    PriceDeviationTooHigh,

    #[msg("Pyth confidence interval too wide")]
    ConfidenceTooWide,

    #[msg("Oracle circuit breaker is active")]
    OracleCircuitBreakerActive,

    #[msg("Invalid cooldown (must be in [60, 86400] seconds)")]
    InvalidCooldown,

    #[msg("Invalid max_price_change_bps (must be in [100, 10000])")]
    InvalidMaxChangeBps,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Future timestamp not allowed")]
    FutureTimestamp,
}
