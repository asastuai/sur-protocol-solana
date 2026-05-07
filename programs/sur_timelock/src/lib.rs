//! sur_timelock — SUR Protocol admin timelock controller.
//!
//! Solana port of SurTimelock.sol. Enforces a delay (24h–30d) between
//! queueing an admin operation and executing it. Guardian role can
//! emergency-pause registered targets without delay.
//!
//! v0.2 ships state-tracking + delay enforcement + event emission.
//! Wiring the actual `invoke_signed` of queued instructions and CPIs to
//! target.pause() lands in v0.3 when this becomes the admin gate for
//! market_registry, perp_engine, perp_vault, oracle_router, etc.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/SurTimelock.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod sur_timelock {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, delay: i64) -> Result<()> {
        instructions::admin::initialize(ctx, delay)
    }

    pub fn set_delay(ctx: Context<AdminUpdate>, new_delay: i64) -> Result<()> {
        instructions::admin::set_delay(ctx, new_delay)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn set_guardian(ctx: Context<AdminUpdate>, new_guardian: Pubkey) -> Result<()> {
        instructions::admin::set_guardian(ctx, new_guardian)
    }

    pub fn set_pausable_target(
        ctx: Context<SetPausableTarget>,
        target: Pubkey,
        status: bool,
    ) -> Result<()> {
        instructions::admin::set_pausable_target(ctx, target, status)
    }

    pub fn complete_setup(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::complete_setup(ctx)
    }

    pub fn queue_transaction(
        ctx: Context<QueueTransaction>,
        tx_hash: [u8; 32],
        target: Pubkey,
        instruction_hash: [u8; 32],
    ) -> Result<()> {
        instructions::queue_exec::queue_transaction(ctx, tx_hash, target, instruction_hash)
    }

    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
        instructions::queue_exec::execute_transaction(ctx)
    }

    pub fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
        instructions::queue_exec::cancel_transaction(ctx)
    }

    pub fn emergency_pause(ctx: Context<EmergencyPauseAction>) -> Result<()> {
        instructions::queue_exec::emergency_pause(ctx)
    }
}
