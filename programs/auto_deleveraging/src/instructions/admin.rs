use anchor_lang::prelude::*;

use crate::errors::ADLError;
use crate::events::{
    ADLEnabledChanged, ADLParamsUpdated, OwnershipTransferStarted, OwnershipTransferred,
    PauseStatusChanged,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = ADLConfig::SIZE,
        seeds = [ADLConfig::SEED],
        bump,
    )]
    pub config: Account<'info, ADLConfig>,

    /// CHECK: perp_engine program id.
    pub perp_engine: UncheckedAccount<'info>,
    /// CHECK: perp_vault program id.
    pub perp_vault: UncheckedAccount<'info>,
    /// CHECK: insurance_fund program id.
    pub insurance_fund: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(
    ctx: Context<Initialize>,
    min_bad_debt_threshold: u64,
    adl_cooldown_secs: i64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.adl_enabled = true;
    cfg.min_bad_debt_threshold = min_bad_debt_threshold;
    cfg.adl_cooldown_secs = adl_cooldown_secs;
    cfg.last_adl_time = 0;
    cfg.total_adl_events = 0;
    cfg.total_bad_debt_covered = 0;
    cfg.perp_engine = ctx.accounts.perp_engine.key();
    cfg.perp_vault = ctx.accounts.perp_vault.key();
    cfg.insurance_fund = ctx.accounts.insurance_fund.key();

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
        seeds = [ADLConfig::SEED],
        bump = config.bump,
        has_one = owner @ ADLError::NotOwner,
    )]
    pub config: Account<'info, ADLConfig>,

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

pub(crate) fn set_adl_enabled(ctx: Context<AdminUpdate>, enabled: bool) -> Result<()> {
    ctx.accounts.config.adl_enabled = enabled;
    emit!(ADLEnabledChanged { enabled });
    Ok(())
}

pub(crate) fn set_adl_params(
    ctx: Context<AdminUpdate>,
    min_bad_debt_threshold: u64,
    cooldown_secs: i64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.min_bad_debt_threshold = min_bad_debt_threshold;
    cfg.adl_cooldown_secs = cooldown_secs;
    emit!(ADLParamsUpdated {
        min_bad_debt_threshold,
        cooldown_secs,
    });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), ADLError::ZeroAddress);
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
        seeds = [ADLConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ADLConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        ADLError::NotPendingOwner
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
