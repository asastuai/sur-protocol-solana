//! order_settlement — SUR Protocol off-chain matcher → on-chain executor.
//!
//! Solana port of OrderSettlement.sol. Receives matched trade pairs from the
//! off-chain matching engine, verifies trader signatures + nonces + expiry,
//! collects maker/taker fees via perp_vault, then opens positions for both
//! sides via perp_engine. Supports MEV protection via commit-reveal with a
//! per-order parameter snapshot (Mapping 3 prospective semantics).
//!
//! Key deviation vs. Solidity: signature scheme. EVM uses EIP-712 (secp256k1
//! + ecrecover). Solana wallets sign ed25519 + BPF has no ecrecover. We use
//! the native ed25519 precompile + Sysvar<Instructions> walk, with a
//! canonical 145-byte message layout. See `signature.rs` for full spec.
//!
//! Math + state semantics + error semantics are byte-for-byte ports.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/OrderSettlement.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod signature;
pub mod state;

use instructions::admin::*;
use instructions::commit_order::*;
use instructions::operator_admin::*;
use instructions::settle::*;
use state::*;

declare_id!("8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ");

#[program]
pub mod order_settlement {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, cluster_id: u64) -> Result<()> {
        instructions::admin::initialize(ctx, cluster_id)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }

    pub fn set_fee_recipient(ctx: Context<SetFeeRecipient>) -> Result<()> {
        instructions::admin::set_fee_recipient(ctx)
    }

    pub fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::pause(ctx)
    }

    pub fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::unpause(ctx)
    }

    pub fn set_fees(ctx: Context<AdminUpdate>, maker: u32, taker: u32) -> Result<()> {
        instructions::admin::set_fees(ctx, maker, taker)
    }

    pub fn set_settlement_delay(
        ctx: Context<AdminUpdate>,
        min_delay: i64,
        max_delay: i64,
    ) -> Result<()> {
        instructions::admin::set_settlement_delay(ctx, min_delay, max_delay)
    }

    pub fn set_dynamic_spread_enabled(ctx: Context<AdminUpdate>, enabled: bool) -> Result<()> {
        instructions::admin::set_dynamic_spread_enabled(ctx, enabled)
    }

    pub fn set_dynamic_spread_tiers(
        ctx: Context<AdminUpdate>,
        tier1: u32,
        tier2: u32,
        tier3: u32,
    ) -> Result<()> {
        instructions::admin::set_dynamic_spread_tiers(ctx, tier1, tier2, tier3)
    }

    pub fn set_operator(
        ctx: Context<SetOperator>,
        operator: Pubkey,
        status: bool,
    ) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    pub fn commit_order(ctx: Context<CommitOrder>, commit_hash: [u8; 32], order: SignedOrder) -> Result<()> {
        instructions::commit_order::commit_order(ctx, commit_hash, order)
    }

    pub fn settle_one(ctx: Context<SettleOne>, trade: MatchedTrade) -> Result<()> {
        instructions::settle::settle_one(ctx, trade)
    }
}
