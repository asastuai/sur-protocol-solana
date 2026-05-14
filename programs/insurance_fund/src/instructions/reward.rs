use anchor_lang::prelude::*;

use crate::errors::InsuranceFundError;
use crate::events::KeeperRewardPaid;
use crate::instructions::cpi_util::invoke_vault_internal_transfer;
use crate::state::*;

// ============================================================
//                    PAY KEEPER REWARD (operator-only)
// ============================================================
// Solidity: InsuranceFund.sol:164-190 — payKeeperReward(keeper, amount)
//   - per-call + daily caps (H-9 fix) fire BEFORE the transfer
//   - vault.balances(insuranceFund) >= amount  (Sol:182-183, enforced by
//     perp_vault::internal_transfer via InsufficientBalance)
//   - vault.internalTransfer(insuranceFund, keeper, amount)  [Sol:185]
//
// v0.3 wiring #2: real CPI to perp_vault.internal_transfer.
// Manual invoke_signed pattern (mirrors order_settlement / engine).
//
// Caps preserved EXACTLY: per-call cap + 24h rolling daily window.
// State (totals + daily counters) updated AFTER successful CPI so a vault
// failure (e.g. InsufficientBalance) leaves the cap counters untouched.

#[derive(Accounts)]
pub struct PayKeeperReward<'info> {
    #[account(
        mut,
        seeds = [InsuranceFundConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, InsuranceFundConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ InsuranceFundError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    pub operator: Signer<'info>,

    /// CHECK: insurance_fund_authority PDA — signs the vault CPI.
    /// Pre-registered as vault operator at one-time setup.
    #[account(
        seeds = [InsuranceFundConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---- perp_vault accounts ----
    /// CHECK: perp_vault program id; constraint vs config.vault.
    #[account(constraint = perp_vault_program.key() == config.vault @ InsuranceFundError::ZeroAddress)]
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: vault_config PDA.
    pub vault_config: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for `authority`.
    pub vault_operator_account: UncheckedAccount<'info>,
    /// CHECK: insurance_fund_authority's perp_vault AccountBalance (debited).
    #[account(mut)]
    pub from_balance: UncheckedAccount<'info>,
    /// CHECK: keeper's perp_vault AccountBalance (credited).
    #[account(mut)]
    pub to_balance: UncheckedAccount<'info>,
}

pub(crate) fn handler(
    ctx: Context<PayKeeperReward>,
    keeper: Pubkey,
    amount: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(!cfg.paused, InsuranceFundError::PausedError);
    if amount == 0 {
        return Ok(());
    }
    require!(keeper != Pubkey::default(), InsuranceFundError::ZeroAddress);

    // ---- H-9: per-call cap (Sol:169-171) ----
    if cfg.max_keeper_reward_per_call > 0 {
        require!(
            amount <= cfg.max_keeper_reward_per_call,
            InsuranceFundError::KeeperRewardExceedsPerCallCap
        );
    }

    // ---- H-9: 24h rolling daily cap (Sol:174-180) ----
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    if now >= cfg.daily_reward_reset_timestamp + ONE_DAY_SECS {
        cfg.daily_keeper_rewards_paid = 0;
        cfg.daily_reward_reset_timestamp = now;
    }
    if cfg.max_daily_keeper_rewards > 0 {
        let projected = cfg
            .daily_keeper_rewards_paid
            .checked_add(amount)
            .ok_or(InsuranceFundError::MathOverflow)?;
        require!(
            projected <= cfg.max_daily_keeper_rewards,
            InsuranceFundError::DailyKeeperRewardCapExceeded
        );
    }

    // ---- v0.3 wiring #2: vault.internalTransfer(fund, keeper, amount) (Sol:185) ----
    // perp_vault enforces InsufficientBalance if fund balance < amount, mirroring
    // Solidity's explicit check at Sol:182-183.
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[
        InsuranceFundConfig::AUTHORITY_SEED,
        std::slice::from_ref(&auth_bump),
    ];

    invoke_vault_internal_transfer(
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.from_balance,
        &ctx.accounts.to_balance,
        &ctx.accounts.authority,
        amount,
        auth_seeds,
    )?;

    // ---- update totals AFTER successful CPI ----
    cfg.total_keeper_rewards_paid = cfg
        .total_keeper_rewards_paid
        .checked_add(amount)
        .ok_or(InsuranceFundError::MathOverflow)?;
    cfg.daily_keeper_rewards_paid = cfg
        .daily_keeper_rewards_paid
        .checked_add(amount)
        .ok_or(InsuranceFundError::MathOverflow)?;

    emit!(KeeperRewardPaid { keeper, amount });
    Ok(())
}
