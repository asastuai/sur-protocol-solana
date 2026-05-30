//! insurance_fund — SUR Protocol bad-debt absorption pool + keeper rewards.
//!
//! Solana port of InsuranceFund.sol. Tracks cumulative bad debt absorbed
//! by the fund + governs keeper reward payouts with H-9 fix per-call and
//! rolling 24h caps preserved.
//!
//! v0.3 wiring #2: pay_keeper_reward fires real CPI to perp_vault.
//! internal_transfer signed by `insurance_fund_authority` PDA. Caps fire
//! BEFORE the CPI; state updated AFTER. Bootstrap_insurance_pool ix
//! (mirrors engine bootstrap) seeds the fund's vault balance one-time.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/InsuranceFund.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("33WMHTYxURf1t65CoHuPGSD1ZPcRQ3KQi22Bdo92nxpA");

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

    pub fn bootstrap_insurance_pool(
        ctx: Context<BootstrapInsurancePool>,
        amount: u64,
    ) -> Result<()> {
        instructions::bootstrap_pool::handler(ctx, amount)
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
