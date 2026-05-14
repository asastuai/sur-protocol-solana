use anchor_lang::prelude::*;

use crate::errors::CollateralError;
use crate::events::{
    OwnershipTransferStarted, OwnershipTransferred, ParameterBump, PauseStatusChanged,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = CollateralManagerConfig::SIZE,
        seeds = [CollateralManagerConfig::SEED],
        bump,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    /// CHECK: PDA pre-funded so it can pay for init_if_needed at perp_vault
    /// (CollateralOp creates AccountBalance with payer = operator). Must be
    /// pre-registered as operator on perp_vault.
    #[account(
        mut,
        seeds = [CollateralManagerConfig::AUTHORITY_SEED],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id, stored for CPI dispatch.
    pub vault_program: UncheckedAccount<'info>,

    /// CHECK: perp_vault config PDA, stored for CPI account passing.
    pub vault_config: UncheckedAccount<'info>,

    /// CHECK: perp_vault Operator PDA derived from authority, validated at CPI entry.
    pub vault_operator_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(
    ctx: Context<Initialize>,
    liquidation_threshold_bps: u64,
    max_price_deviation_bps: u64,
) -> Result<()> {
    require!(
        liquidation_threshold_bps >= 5000 && liquidation_threshold_bps <= BPS,
        CollateralError::ThresholdInvalid
    );
    require!(
        max_price_deviation_bps >= 100 && max_price_deviation_bps <= 5000,
        CollateralError::DeviationInvalid
    );

    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.authority_bump = ctx.bumps.authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.vault_program = ctx.accounts.vault_program.key();
    cfg.vault_config = ctx.accounts.vault_config.key();
    cfg.vault_operator_account = ctx.accounts.vault_operator_account.key();
    cfg.liquidation_threshold_bps = liquidation_threshold_bps;
    cfg.max_price_deviation_bps = max_price_deviation_bps;
    cfg.supported_token_count = 0;

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
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
        has_one = owner @ CollateralError::NotOwner,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

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

pub(crate) fn set_liquidation_threshold_bps(
    ctx: Context<AdminUpdate>,
    new_threshold: u64,
) -> Result<()> {
    require!(
        new_threshold >= 5000 && new_threshold <= BPS,
        CollateralError::ThresholdInvalid
    );
    let cfg = &mut ctx.accounts.config;
    let old = cfg.liquidation_threshold_bps;
    cfg.liquidation_threshold_bps = new_threshold;

    emit!(crate::events::LiquidationThresholdUpdated {
        old_threshold: old,
        new_threshold,
    });
    let param_id = anchor_lang::solana_program::hash::hash(
        b"CollateralManager.liquidationThresholdBps",
    )
    .to_bytes();
    emit!(ParameterBump {
        param_id,
        old_value: old,
        new_value: new_threshold,
        effective_slot: Clock::get()?.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub(crate) fn set_max_price_deviation_bps(
    ctx: Context<AdminUpdate>,
    new_bps: u64,
) -> Result<()> {
    require!(
        new_bps >= 100 && new_bps <= 5000,
        CollateralError::DeviationInvalid
    );
    let cfg = &mut ctx.accounts.config;
    let old = cfg.max_price_deviation_bps;
    cfg.max_price_deviation_bps = new_bps;

    emit!(crate::events::MaxPriceDeviationUpdated { old_bps: old, new_bps });
    let param_id = anchor_lang::solana_program::hash::hash(
        b"CollateralManager.maxPriceDeviationBps",
    )
    .to_bytes();
    emit!(ParameterBump {
        param_id,
        old_value: old,
        new_value: new_bps,
        effective_slot: Clock::get()?.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), CollateralError::ZeroAddress);
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
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        CollateralError::NotPendingOwner
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
