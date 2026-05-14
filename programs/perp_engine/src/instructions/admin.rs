use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{OwnershipTransferStarted, OwnershipTransferred, PauseStatusChanged};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = EngineConfig::SIZE,
        seeds = [EngineConfig::SEED],
        bump,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    /// CHECK: engine_authority PDA. Signs CPIs into perp_vault.
    /// Pre-funded by owner with rent for downstream init_if_needed. Must be
    /// pre-registered as operator on perp_vault (one-time set_operator call).
    /// Holds engine_pool AccountBalance (margin + counterparty pool) on vault.
    #[account(
        seeds = [EngineConfig::AUTHORITY_SEED],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id; not invoked at init, validated when CPI lands.
    pub perp_vault: UncheckedAccount<'info>,

    /// CHECK: oracle_router program id.
    pub oracle_router: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let cfg = &mut ctx.accounts.engine_config;
    cfg.bump = ctx.bumps.engine_config;
    cfg.authority_bump = ctx.bumps.authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.perp_vault = ctx.accounts.perp_vault.key();
    cfg.oracle_router = ctx.accounts.oracle_router.key();

    emit!(OwnershipTransferred {
        previous_owner: Pubkey::default(),
        new_owner: ctx.accounts.owner.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
        has_one = owner @ EngineError::NotOwner,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);
    cfg.paused = true;
    emit!(PauseStatusChanged { is_paused: true });
    Ok(())
}

pub(crate) fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.engine_config;
    require!(cfg.paused, EngineError::NotPaused);
    cfg.paused = false;
    emit!(PauseStatusChanged { is_paused: false });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), EngineError::ZeroAddress);
    let cfg = &mut ctx.accounts.engine_config;
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
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.engine_config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        EngineError::NotPendingOwner
    );
    let old = cfg.owner;
    cfg.owner = ctx.accounts.pending_owner.key();
    cfg.pending_owner = Pubkey::default();
    emit!(OwnershipTransferred {
        previous_owner: old,
        new_owner: cfg.owner,
    });
    Ok(())
}
