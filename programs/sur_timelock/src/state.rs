use anchor_lang::prelude::*;

pub const MIN_DELAY: i64 = 24 * 60 * 60;        // 24 hours
pub const MAX_DELAY: i64 = 30 * 24 * 60 * 60;   // 30 days
pub const GRACE_PERIOD: i64 = 7 * 24 * 60 * 60; // 7 days

// ============================================================
//                    TIMELOCK CONFIG (singleton PDA)
// ============================================================

#[account]
pub struct TimelockConfig {
    pub bump: u8,
    pub authority_bump: u8,    // bump for the timelock_authority PDA (signs dispatched CPIs)
    pub owner: Pubkey,         // Gnosis Safe-equivalent multisig (or any Pubkey)
    pub pending_owner: Pubkey, // two-step ownership transfer (H-9 fix)
    pub guardian: Pubkey,      // emergency-pause-only role
    pub delay: i64,            // current queue delay in seconds
    pub setup_complete: bool,  // H-16 fix: blocks batch_set_pausable_targets after setup
}

impl TimelockConfig {
    pub const SEED: &'static [u8] = b"timelock_config";
    /// PDA the timelock signs as when dispatching queued CPIs (C-3 fix).
    pub const AUTHORITY_SEED: &'static [u8] = b"timelock_authority";
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 32 + 8 + 1;
}

// ============================================================
//                    QUEUED TX (per-tx PDA)
// ============================================================
// Solidity used a mapping(bytes32 => uint256) keyed by keccak256 of
// (target, value, data, eta). Solana: we keep one PDA per queued tx,
// seeded by the same hash so that re-queueing the exact same op fails
// (TxAlreadyQueued).

#[account]
pub struct QueuedTx {
    pub bump: u8,
    pub tx_hash: [u8; 32],          // = sha256(target ‖ instruction_hash ‖ accounts_hash) — bound at queue (H-9)
    pub target: Pubkey,             // target program id (Solana analog of EVM target address)
    pub instruction_hash: [u8; 32], // sha256(serialized ix data) — verified at dispatch
    pub accounts_hash: [u8; 32],    // sha256(account-meta commitment) — verified at dispatch
    pub eta: i64,                   // earliest valid execution time
    pub queued_by: Pubkey,
}

impl QueuedTx {
    pub const SEED_PREFIX: &'static [u8] = b"queued_tx";
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 32 + 32 + 8 + 32;
}

// ============================================================
//                    PAUSABLE TARGET (per-target PDA)
// ============================================================

#[account]
pub struct PausableTarget {
    pub bump: u8,
    pub target: Pubkey,
    pub status: bool,
}

impl PausableTarget {
    pub const SEED_PREFIX: &'static [u8] = b"pausable_target";
    pub const SIZE: usize = 8 + 1 + 32 + 1;
}
