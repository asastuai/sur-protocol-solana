use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::{
    OracleCircuitBreakerReset, OwnershipTransferStarted, OwnershipTransferred,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = OracleConfig::SIZE,
        seeds = [OracleConfig::SEED],
        bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(
    ctx: Context<Initialize>,
    cooldown_secs: i64,
    max_price_change_bps: u64,
    required_good_prices_for_reset: u64,
) -> Result<()> {
    require!(
        cooldown_secs >= 60 && cooldown_secs <= 86_400,
        OracleError::InvalidCooldown
    );
    require!(
        (100..=10_000).contains(&max_price_change_bps),
        OracleError::InvalidMaxChangeBps
    );

    let cfg = &mut ctx.accounts.oracle_config;
    cfg.bump = ctx.bumps.oracle_config;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.circuit_breaker_active = false;
    cfg.circuit_breaker_triggered_at = 0;
    cfg.cooldown_secs = cooldown_secs;
    cfg.max_price_change_bps = max_price_change_bps;
    cfg.good_price_count_after_cb = 0;
    cfg.required_good_prices_for_reset = required_good_prices_for_reset;

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
        seeds = [OracleConfig::SEED],
        bump = oracle_config.bump,
        has_one = owner @ OracleError::NotOwner,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn set_circuit_breaker_params(
    ctx: Context<AdminUpdate>,
    cooldown_secs: i64,
    max_change_bps: u64,
) -> Result<()> {
    require!(
        cooldown_secs >= 60 && cooldown_secs <= 86_400,
        OracleError::InvalidCooldown
    );
    require!(
        (100..=10_000).contains(&max_change_bps),
        OracleError::InvalidMaxChangeBps
    );

    let cfg = &mut ctx.accounts.oracle_config;
    cfg.cooldown_secs = cooldown_secs;
    cfg.max_price_change_bps = max_change_bps;
    Ok(())
}

pub(crate) fn reset_circuit_breaker(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    cfg.circuit_breaker_active = false;
    cfg.good_price_count_after_cb = 0;
    let clock = Clock::get()?;
    emit!(OracleCircuitBreakerReset {
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), OracleError::ZeroAddress);
    let cfg = &mut ctx.accounts.oracle_config;
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
        seeds = [OracleConfig::SEED],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        OracleError::NotPendingOwner
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
