use anchor_lang::prelude::*;

// ============================================================
//                    INTENT / RESPONSE LIFECYCLE
// ============================================================

#[event]
pub struct IntentPosted {
    pub intent_id: u64,
    pub agent: Pubkey,
    pub market_id: [u8; 32],
    pub is_buy: bool,
    pub size: u64,
    pub min_price: u64,
    pub max_price: u64,
    pub expires_at: i64,
    pub context_commitment: [u8; 32],
}

#[event]
pub struct IntentCancelled {
    pub intent_id: u64,
}

#[event]
pub struct ResponsePosted {
    pub response_id: u64,
    pub intent_id: u64,
    pub responder: Pubkey,
    pub price: u64,
    pub context_commitment: [u8; 32],
}

#[event]
pub struct ResponseCancelled {
    pub response_id: u64,
}

#[event]
pub struct A2ATradeSettled {
    pub intent_id: u64,
    pub response_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub market_id: [u8; 32],
    pub size: u64,
    pub price: u64,
    pub timestamp: i64,
    /// Proof-of-context: the canonical market price vintage this trade settled
    /// against (`Market.last_price_update`), for indexer/audit.
    pub price_as_of: i64,
}

#[event]
pub struct FreshnessBudgetUpdated {
    pub max_settlement_price_age: i64,
}

#[event]
pub struct ReputationUpdated {
    pub agent: Pubkey,
    pub new_score: u64,
    pub completed_trades: u64,
}

// ============================================================
//                    PROSPECTIVE PARAMETER BUMPS (Mapping 3)
// ============================================================
// Mirrors A2ADarkPool.sol's ParameterBump event. param_id is the keccak256
// of the canonical parameter name. effective_slot replaces effectiveBlock —
// Solana's slot is the closest equivalent to EVM block.number.

#[event]
pub struct ParameterBump {
    pub param_id: [u8; 32],
    pub old_value: Vec<u8>,
    pub new_value: Vec<u8>,
    pub effective_slot: u64,
    pub admin: Pubkey,
}

// ============================================================
//                    ADMIN
// ============================================================

#[event]
pub struct PauseStatusChanged {
    pub is_paused: bool,
}

#[event]
pub struct OwnershipTransferStarted {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct FeeBpsUpdated {
    pub new_fee_bps: u64,
}

#[event]
pub struct FeeRecipientUpdated {
    pub new_recipient: Pubkey,
}

#[event]
pub struct LargeTradeThresholdUpdated {
    pub new_threshold: u64,
}

#[event]
pub struct LargeTradeMinReputationUpdated {
    pub new_min_reputation: u64,
}

// ============================================================
//                    PREVIEW / STUB FLAGS
// ============================================================
// In v0.1, accept_and_settle does not call perp_engine or perp_vault CPIs
// (those programs are not yet ported). It still flips statuses and updates
// reputation. To prevent indexers from treating these as real settlements,
// we always emit SettlementPreviewMode alongside A2ATradeSettled until the
// CPIs are wired in v0.2. Indexers should filter or flag any settle event
// that comes paired with this marker.

#[event]
pub struct SettlementPreviewMode {
    pub intent_id: u64,
    pub response_id: u64,
    pub fee_per_side_uncollected: u64,
    pub note: String,
}

// NOTE: Solidity has `mapping(address => bool) operators` + `setOperator` +
// `OperatorUpdated`. The operator role is unused in upstream tests and not
// required by the v0.1 critical path. Dropped from the port; revisit in v0.2
// if we discover an off-chain admin tool that depends on it.
