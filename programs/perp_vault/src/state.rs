use anchor_lang::prelude::*;

// ============================================================
//                    VAULT CONFIG (singleton PDA)
// ============================================================
// Solidity: contract-level state (owner, paused, caps, totals, USDC token ref).
// Anchor: one PDA seeded by ["vault_config"]. The actual USDC custody account
//         is a separate SPL token account owned by the vault_authority PDA.

#[account]
pub struct VaultConfig {
    pub bump: u8,
    pub vault_authority_bump: u8,

    pub owner: Pubkey,
    pub pending_owner: Pubkey,
    pub paused: bool,

    /// USDC mint this vault custodies.
    pub usdc_mint: Pubkey,

    /// SPL token account holding the actual USDC. Owned by vault_authority PDA.
    pub usdc_vault: Pubkey,

    /// Maximum aggregate deposits (0 = unlimited).
    pub deposit_cap: u64,

    /// Maximum withdrawal per transaction (0 = unlimited).
    pub max_withdrawal_per_tx: u64,

    /// Maximum operator-initiated transfer per transaction (0 = unlimited).
    pub max_operator_transfer_per_tx: u64,

    /// Sum of all USDC deposits (mirrors Solidity totalDeposits).
    pub total_deposits: u64,

    /// Sum of all collateral credits from yield-bearing tokens via CollateralManager.
    pub total_collateral_credits: u64,
}

impl VaultConfig {
    pub const SEED: &'static [u8] = b"vault_config";
    pub const AUTHORITY_SEED: &'static [u8] = b"vault_authority";

    // 8 (disc) + 1 + 1 + 32*4 (pubkeys) + 1 (paused) + 8*5 (u64 fields)
    pub const SIZE: usize = 8 + 1 + 1 + 32 + 32 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 8;
}

// ============================================================
//                    ACCOUNT BALANCE (per-trader PDA)
// ============================================================
// Solidity: mapping(address => uint256) balances + mapping(address => uint256) collateralBalances.
// Anchor: one PDA per trader holding both, seed ["balance", trader_pk].
//
// Splitting deposit balance from collateral credits is the C-5 fix from upstream:
// collateral credits are backed by yield-bearing tokens in CollateralManager,
// not by USDC in this vault, and so MUST NOT be withdrawable as USDC.

#[account]
#[derive(Default)]
pub struct AccountBalance {
    pub bump: u8,
    pub trader: Pubkey,

    /// Withdrawable USDC deposit balance.
    pub balance: u64,

    /// Yield-token-backed collateral credits, NOT withdrawable as USDC,
    /// usable for trading margin only.
    pub collateral_balance: u64,
}

impl AccountBalance {
    pub const SEED_PREFIX: &'static [u8] = b"balance";

    // 8 (disc) + 1 + 32 + 8 + 8
    pub const SIZE: usize = 8 + 1 + 32 + 8 + 8;
}

// ============================================================
//                    OPERATOR (per-operator PDA)
// ============================================================
// Solidity: mapping(address => bool) operators.
// Anchor: existence of the PDA == authorization. We close it on revoke.

#[account]
pub struct Operator {
    pub bump: u8,
    pub operator: Pubkey,
    pub authorized: bool,
}

impl Operator {
    pub const SEED_PREFIX: &'static [u8] = b"operator";

    // 8 (disc) + 1 + 32 + 1
    pub const SIZE: usize = 8 + 1 + 32 + 1;
}
