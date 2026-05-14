use anchor_lang::prelude::*;

use crate::errors::InsuranceFundError;
use crate::events::{
    MaxKeeperRewardUpdated, OwnershipTransferStarted, OwnershipTransferred, PauseStatusChanged,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = InsuranceFundConfig::SIZE,
        seeds = [InsuranceFundConfig::SEED],
        bump,
    )]
    pub config: Account<'info, InsuranceFundConfig>,

    /// CHECK: insurance_fund_authority PDA — signs CPIs into perp_vault.
    /// Must be pre-registered as operator on perp_vault (one-time set_operator
    /// call from vault owner). Holds the insurance fund's vault AccountBalance.
    #[account(
        seeds = [InsuranceFundConfig::AUTHORITY_SEED],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: vault program id, validated when CPI lands.
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(
    ctx: Context<Initialize>,
    max_keeper_reward_per_call: u64,
    max_daily_keeper_rewards: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.authority_bump = ctx.bumps.authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.vault = ctx.accounts.vault.key();
    cfg.total_bad_debt = 0;
    cfg.total_keeper_rewards_paid = 0;
    cfg.total_liquidations = 0;
    cfg.max_keeper_reward_per_call = max_keeper_reward_per_call;
    cfg.max_daily_keeper_rewards = max_daily_keeper_rewards;
    cfg.daily_keeper_rewards_paid = 0;
    cfg.daily_reward_reset_timestamp = 0;

    emit!(OwnershipTransferred {
        old_owner: Pubkey::default(),
        new_owner: cfg.owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [InsuranceFundConfig::SEED],
        bump = config.bump,
        has_one = owner @ InsuranceFundError::NotOwner,
    )]
    pub config: Account<'info, InsuranceFundConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = true;
    emit!(PauseStatusChanged { is_paused: true });
    Ok(())
}

pub(crate) fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(PauseStatusChanged { is_paused: false });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), InsuranceFundError::ZeroAddress);
    let cfg = &mut ctx.accounts.config;
    cfg.pending_owner = new_owner;
    emit!(OwnershipTransferStarted {
        current_owner: cfg.owner,
        pending_owner: new_owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(
        mut,
        seeds = [InsuranceFundConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, InsuranceFundConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        InsuranceFundError::NotPendingOwner
    );
    let old = cfg.owner;
    cfg.owner = ctx.accounts.pending_owner.key();
    cfg.pending_owner = Pubkey::default();
    emit!(OwnershipTransferred {
        old_owner: old,
        new_owner: cfg.owner,
    });
    Ok(())
}

pub(crate) fn set_max_keeper_reward_per_call(
    ctx: Context<AdminUpdate>,
    new_cap: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.max_keeper_reward_per_call = new_cap;
    emit!(MaxKeeperRewardUpdated {
        per_call: new_cap,
        daily: cfg.max_daily_keeper_rewards,
    });
    Ok(())
}

pub(crate) fn set_max_daily_keeper_rewards(
    ctx: Context<AdminUpdate>,
    new_cap: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.max_daily_keeper_rewards = new_cap;
    emit!(MaxKeeperRewardUpdated {
        per_call: cfg.max_keeper_reward_per_call,
        daily: new_cap,
    });
    Ok(())
}
