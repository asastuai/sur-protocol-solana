use anchor_lang::prelude::*;

#[error_code]
pub enum OrderSettlementError {
    #[msg("Caller is not owner")]
    NotOwner,

    #[msg("Caller is not pending owner")]
    NotPendingOwner,

    #[msg("Caller is not an authorized operator")]
    NotOperator,

    #[msg("Settlement is paused")]
    PausedError,

    #[msg("Zero address")]
    ZeroAddress,

    #[msg("Invalid signature")]
    InvalidSignature,

    #[msg("Missing ed25519 verification instruction")]
    MissingEd25519Ix,

    #[msg("ed25519 instruction message mismatch")]
    Ed25519MessageMismatch,

    #[msg("ed25519 instruction signer mismatch")]
    Ed25519SignerMismatch,

    #[msg("Order expired")]
    OrderExpired,

    #[msg("Order signed in the future")]
    OrderSignedInFuture,

    #[msg("Order too recent (commit-settle delay not elapsed)")]
    OrderTooRecent,

    #[msg("Order signed too long ago")]
    OrderTooOld,

    #[msg("Nonce already used")]
    NonceAlreadyUsed,

    #[msg("Market mismatch between maker and taker")]
    MarketMismatch,

    #[msg("Sides not opposite (both long or both short)")]
    SidesNotOpposite,

    #[msg("Self trade rejected")]
    SelfTrade,

    #[msg("Zero size")]
    ZeroSize,

    #[msg("Zero price")]
    ZeroPrice,

    #[msg("Batch is empty")]
    BatchEmpty,

    #[msg("Execution price exceeds taker limit")]
    ExecPriceExceedsTakerLimit,

    #[msg("Execution price below taker limit")]
    ExecPriceBelowTakerLimit,

    #[msg("Execution price exceeds maker limit")]
    ExecPriceExceedsMakerLimit,

    #[msg("Execution price below maker limit")]
    ExecPriceBelowMakerLimit,

    #[msg("Execution size exceeds maker order")]
    ExecSizeExceedsMaker,

    #[msg("Execution size exceeds taker order")]
    ExecSizeExceedsTaker,

    #[msg("Fee too high (>1000 bps)")]
    FeeTooHigh,

    #[msg("Delay misordered (max < min)")]
    DelayMisordered,

    #[msg("Delay exceeds maximum")]
    DelayTooHigh,

    #[msg("Spread tiers must be ascending")]
    TiersNotAscending,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Nonce page mismatch")]
    NoncePageMismatch,

    #[msg("Account mismatch")]
    AccountMismatch,

    #[msg("Commit hash mismatch")]
    CommitHashMismatch,

    #[msg("Remaining accounts arity invalid for batch settle")]
    RemainingAccountsArity,
}
