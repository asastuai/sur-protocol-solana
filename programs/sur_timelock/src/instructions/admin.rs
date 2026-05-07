use anchor_lang::prelude::*;

use crate::errors::TimelockError;
use crate::events::{
    DelayUpdated, GuardianUpdated, OwnershipTransferred, PausableTargetUpdated, SetupCompleted,
};
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = TimelockConfig::SIZE,
        seeds = [TimelockConfig::SEED],
        bump,
    )]
    pub config: Account<'info, TimelockConfig>,

    /// CHECK: guardian pubkey, identity only.
    pub guardian: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(ctx: Context<Initialize>, delay: i64) -> Result<()> {
    require!(delay >= MIN_DELAY, TimelockError::DelayTooShort);
    require!(delay <= MAX_DELAY, TimelockError::DelayTooLong);

    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.owner = ctx.accounts.owner.key();
    cfg.guardian = ctx.accounts.guardian.key();
    cfg.delay = delay;
    cfg.setup_complete = false;

    emit!(OwnershipTransferred {
        old_owner: Pubkey::default(),
        new_owner: cfg.owner,
    });
    emit!(GuardianUpdated {
        old_guardian: Pubkey::default(),
        new_guardian: cfg.guardian,
    });
    Ok(())
}

// ---- Self-governing setters (must be called via execute_transaction) ----
// In Solidity these had `if (msg.sender != address(this)) revert`. In
// Solana the equivalent: only the timelock-program-derived authority can
// invoke. For v0.2 we model these as owner-only with a require! comment;
// post-v0.3 we'll route them through queue/execute. Documenting the gap:
// these instructions today are NOT delay-enforced; until execute_transaction
// can invoke_signed them, the Solidity self-governance pattern is partial.

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
        has_one = owner @ TimelockError::NotOwner,
    )]
    pub config: Account<'info, TimelockConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn set_delay(ctx: Context<AdminUpdate>, new_delay: i64) -> Result<()> {
    require!(new_delay >= MIN_DELAY, TimelockError::DelayTooShort);
    require!(new_delay <= MAX_DELAY, TimelockError::DelayTooLong);

    let cfg = &mut ctx.accounts.config;
    let old = cfg.delay;
    cfg.delay = new_delay;
    emit!(DelayUpdated {
        old_delay: old,
        new_delay,
    });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), TimelockError::ZeroAddress);
    let cfg = &mut ctx.accounts.config;
    let old = cfg.owner;
    cfg.owner = new_owner;
    emit!(OwnershipTransferred {
        old_owner: old,
        new_owner,
    });
    Ok(())
}

pub(crate) fn set_guardian(ctx: Context<AdminUpdate>, new_guardian: Pubkey) -> Result<()> {
    require!(new_guardian != Pubkey::default(), TimelockError::ZeroAddress);
    let cfg = &mut ctx.accounts.config;
    let old = cfg.guardian;
    cfg.guardian = new_guardian;
    emit!(GuardianUpdated {
        old_guardian: old,
        new_guardian,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(target: Pubkey, status: bool)]
pub struct SetPausableTarget<'info> {
    #[account(
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
        has_one = owner @ TimelockError::NotOwner,
    )]
    pub config: Account<'info, TimelockConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        space = PausableTarget::SIZE,
        seeds = [PausableTarget::SEED_PREFIX, target.as_ref()],
        bump,
    )]
    pub pausable_target: Account<'info, PausableTarget>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn set_pausable_target(
    ctx: Context<SetPausableTarget>,
    target: Pubkey,
    status: bool,
) -> Result<()> {
    require!(target != Pubkey::default(), TimelockError::ZeroAddress);

    let pt = &mut ctx.accounts.pausable_target;
    if pt.target == Pubkey::default() {
        pt.target = target;
        pt.bump = ctx.bumps.pausable_target;
    }
    pt.status = status;

    emit!(PausableTargetUpdated { target, status });
    Ok(())
}

pub(crate) fn complete_setup(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.setup_complete = true;
    emit!(SetupCompleted {});
    Ok(())
}
