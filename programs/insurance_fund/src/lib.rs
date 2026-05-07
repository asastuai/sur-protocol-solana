//! insurance_fund — SUR Protocol bad-debt absorption pool + keeper rewards.
//!
//! Solana port of InsuranceFund.sol. Tracks cumulative bad debt absorbed
//! by the fund + governs keeper reward payouts with H-9 fix per-call and
//! rolling 24h caps preserved.
//!
//! v0.2.2 ships state tracking + caps validation + admin governance.
//! perp_vault.internal_transfer CPI for actual reward payout lands in v0.3
//! using the same manual invoke_signed pattern proven in a2a_darkpool and
//! liquidator.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/InsuranceFund.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("A9TY4wcr6Buzrac5XLC5aQvz4wWyYjQSogsVBvS3eKPp");

#[program]
pub mod insurance_fund {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        max_keeper_reward_per_call: u64,
        max_daily_keeper_rewards: u64,
    ) -> Result<()> {
        instructions::admin::initialize(ctx, max_keeper_reward_per_call, max_daily_keeper_rewards)
    }

    pub fn record_bad_debt(
        ctx: Context<RecordBadDebt>,
        market_id: [u8; 32],
        trader: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::record_bad_debt::handler(ctx, market_id, trader, amount)
    }

    pub fn pay_keeper_reward(
        ctx: Context<PayKeeperReward>,
        keeper: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::reward::handler(ctx, keeper, amount)
    }

    pub fn set_operator(
        ctx: Context<SetOperator>,
        operator: Pubkey,
        status: bool,
    ) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
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

    pub fn set_max_keeper_reward_per_call(
        ctx: Context<AdminUpdate>,
        new_cap: u64,
    ) -> Result<()> {
        instructions::admin::set_max_keeper_reward_per_call(ctx, new_cap)
    }

    pub fn set_max_daily_keeper_rewards(
        ctx: Context<AdminUpdate>,
        new_cap: u64,
    ) -> Result<()> {
        instructions::admin::set_max_daily_keeper_rewards(ctx, new_cap)
    }
}
