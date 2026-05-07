use anchor_lang::prelude::*;

use crate::errors::InsuranceFundError;
use crate::events::KeeperRewardPaid;
use crate::state::*;

// ============================================================
//                    PAY KEEPER REWARD (operator-only)
// ============================================================
// Solidity: payKeeperReward(keeper, amount) onlyOperator whenNotPaused.
//   - per-call + daily caps with 24h rolling reset
//   - vault.internalTransfer(insuranceFund, keeper, amount)
//
// v0.2.2: validates caps + records state. The actual CPI to
// perp_vault.internal_transfer is TODO in v0.3 when we wire engine→vault
// for margin lock + PnL settlement (same manual invoke_signed pattern as
// darkpool / liquidator). Until then, the keeper is "credited" via state
// only — no USDC actually moves.

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

    // ---- H-9: per-call cap ----
    if cfg.max_keeper_reward_per_call > 0 {
        require!(
            amount <= cfg.max_keeper_reward_per_call,
            InsuranceFundError::KeeperRewardExceedsPerCallCap
        );
    }

    // ---- H-9: 24h rolling daily cap ----
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

    // ---- TODO v0.3: CPI to perp_vault.internal_transfer ----
    // The fund balance check (`vault.balances(insuranceFund) >= amount`)
    // and the actual transfer happen at the vault. Wire when engine→vault
    // CPI lands using the same manual invoke_signed pattern as
    // a2a_darkpool/accept_and_settle.

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
