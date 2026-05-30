//! perp_vault — SUR Protocol custodial USDC vault.
//!
//! Solana port of PerpVault.sol. Holds user USDC deposits + collateral credits
//! backed by yield-bearing tokens (CollateralManager). Operator-gated internal
//! transfers for trade settlement. CEI ordering preserved manually
//! (Anchor/Solana provide reentrancy guarantee at runtime).
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/PerpVault.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1");

#[program]
pub mod perp_vault {
    use super::*;

    // ====================== INIT ======================

    pub fn initialize(
        ctx: Context<Initialize>,
        deposit_cap: u64,
        max_withdrawal_per_tx: u64,
        max_operator_transfer_per_tx: u64,
    ) -> Result<()> {
        instructions::admin::initialize(
            ctx,
            deposit_cap,
            max_withdrawal_per_tx,
            max_operator_transfer_per_tx,
        )
    }

    // ====================== USER ======================

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    // ====================== OPERATOR ======================

    pub fn internal_transfer(ctx: Context<InternalTransfer>, amount: u64) -> Result<()> {
        instructions::internal_transfer::handler(ctx, amount)
    }

    pub fn credit_collateral(ctx: Context<CollateralOp>, amount: u64) -> Result<()> {
        instructions::collateral::credit_collateral(ctx, amount)
    }

    pub fn debit_collateral(ctx: Context<CollateralOp>, amount: u64) -> Result<()> {
        instructions::collateral::debit_collateral(ctx, amount)
    }

    // ====================== ADMIN ======================

    pub fn set_operator(ctx: Context<SetOperator>, operator: Pubkey, status: bool) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    pub fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::pause(ctx)
    }

    pub fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::unpause(ctx)
    }

    pub fn set_deposit_cap(ctx: Context<AdminUpdate>, new_cap: u64) -> Result<()> {
        instructions::admin::set_deposit_cap(ctx, new_cap)
    }

    pub fn set_max_withdrawal_per_tx(ctx: Context<AdminUpdate>, new_max: u64) -> Result<()> {
        instructions::admin::set_max_withdrawal_per_tx(ctx, new_max)
    }

    pub fn set_max_operator_transfer_per_tx(
        ctx: Context<AdminUpdate>,
        new_max: u64,
    ) -> Result<()> {
        instructions::admin::set_max_operator_transfer_per_tx(ctx, new_max)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }
}
