use anchor_lang::prelude::*;

use crate::errors::LiquidatorError;
use crate::events::{
    OwnershipTransferStarted, OwnershipTransferred, PauseStatusChanged,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = LiquidatorConfig::SIZE,
        seeds = [LiquidatorConfig::SEED],
        bump,
    )]
    pub config: Account<'info, LiquidatorConfig>,

    /// CHECK: perp_engine program id, validated when CPI fires.
    pub perp_engine: UncheckedAccount<'info>,

    /// CHECK: insurance_fund program id; reserved for v0.3.
    pub insurance_fund: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.perp_engine = ctx.accounts.perp_engine.key();
    cfg.insurance_fund = ctx.accounts.insurance_fund.key();
    cfg.total_liquidations = 0;

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
        seeds = [LiquidatorConfig::SEED],
        bump = config.bump,
        has_one = owner @ LiquidatorError::NotOwner,
    )]
    pub config: Account<'info, LiquidatorConfig>,

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
    require!(new_owner != Pubkey::default(), LiquidatorError::ZeroAddress);
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
        seeds = [LiquidatorConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, LiquidatorConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        LiquidatorError::NotPendingOwner
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
