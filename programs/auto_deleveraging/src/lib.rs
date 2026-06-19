//! auto_deleveraging — SUR Protocol last-resort ADL when insurance fund insufficient.
//!
//! Solana port of AutoDeleveraging.sol. Forcibly closes opposite-sign
//! portions of profitable positions to absorb bad debt.
//!
//! v0.3 wiring #2: execute_adl fires real CPI to perp_engine.open_position
//! (forced reduce on the profitable counterparty), signed by `adl_authority`
//! PDA which is registered as an engine operator. Vault remaining_accounts
//! forwarded so engine's internal vault CPI fires when needed.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/AutoDeleveraging.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6rg7CTKmrsxWLxRPApT9gkidE8i3aqJKf8AKCVgbENRf");

#[program]
pub mod auto_deleveraging {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        min_bad_debt_threshold: u64,
        adl_cooldown_secs: i64,
    ) -> Result<()> {
        instructions::admin::initialize(ctx, min_bad_debt_threshold, adl_cooldown_secs)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute_adl<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteADL<'info>>,
        market_id: [u8; 32],
        trader: Pubkey,
        position_size: i64,
        reduce_size: u64,
        mark_price: u64,
        bad_debt_amount: u64,
        fund_balance: u64,
    ) -> Result<()> {
        instructions::execute_adl::handler(
            ctx,
            market_id,
            trader,
            position_size,
            reduce_size,
            mark_price,
            bad_debt_amount,
            fund_balance,
        )
    }

    pub fn set_operator(ctx: Context<SetOperator>, operator: Pubkey, status: bool) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    pub fn set_adl_enabled(ctx: Context<AdminUpdate>, enabled: bool) -> Result<()> {
        instructions::admin::set_adl_enabled(ctx, enabled)
    }

    pub fn set_adl_params(
        ctx: Context<AdminUpdate>,
        min_bad_debt_threshold: u64,
        cooldown_secs: i64,
    ) -> Result<()> {
        instructions::admin::set_adl_params(ctx, min_bad_debt_threshold, cooldown_secs)
    }

    pub fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::pause(ctx)
    }

    pub fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::unpause(ctx)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }
}
