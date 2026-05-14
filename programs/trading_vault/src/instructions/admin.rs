use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::{
    DrawdownCooldownUpdated, OperatorUpdated, OwnershipTransferStarted, OwnershipTransferred,
};
use crate::state::*;

// ============================================================
//                    INITIALIZE
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = TradingVaultConfig::SIZE,
        seeds = [TradingVaultConfig::SEED],
        bump,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    /// CHECK: Authority PDA. Pre-funded with rent-exempt SOL by owner so it
    /// can pay rent for init_if_needed AccountBalance + Position PDAs at the
    /// callee programs. Must be pre-registered as operator on perp_vault and
    /// perp_engine before any deposit/trade.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id; stored.
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault::VaultConfig PDA; stored.
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault::Operator PDA derived from authority; stored.
    pub vault_operator_account: UncheckedAccount<'info>,

    /// CHECK: perp_engine program id; stored.
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: perp_engine::EngineConfig PDA; stored.
    pub perp_engine_config: UncheckedAccount<'info>,
    /// CHECK: perp_engine::Operator PDA derived from authority; stored.
    pub engine_operator_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.bump = ctx.bumps.config;
    cfg.authority_bump = ctx.bumps.authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.perp_vault_program = ctx.accounts.perp_vault_program.key();
    cfg.perp_vault_config = ctx.accounts.perp_vault_config.key();
    cfg.vault_operator_account = ctx.accounts.vault_operator_account.key();
    cfg.perp_engine_program = ctx.accounts.perp_engine_program.key();
    cfg.perp_engine_config = ctx.accounts.perp_engine_config.key();
    cfg.engine_operator_account = ctx.accounts.engine_operator_account.key();
    cfg.drawdown_cooldown_secs = DEFAULT_DRAWDOWN_COOLDOWN_SECS;
    cfg.vault_count = 0;

    emit!(OwnershipTransferred {
        old_owner: Pubkey::default(),
        new_owner: cfg.owner,
    });
    Ok(())
}

// ============================================================
//                    OWNER ADMIN
// ============================================================

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
        has_one = owner @ TradingVaultError::NotOwner,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), TradingVaultError::ZeroAddress);
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
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        TradingVaultError::NotPendingOwner
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

pub(crate) fn set_drawdown_cooldown_secs(
    ctx: Context<AdminUpdate>,
    new_secs: i64,
) -> Result<()> {
    require!(new_secs >= 0, TradingVaultError::InvalidDrawdownLimit);
    let cfg = &mut ctx.accounts.config;
    let old = cfg.drawdown_cooldown_secs;
    cfg.drawdown_cooldown_secs = new_secs;
    emit!(DrawdownCooldownUpdated {
        old_secs: old,
        new_secs,
    });
    Ok(())
}

// ============================================================
//                    OPERATOR ADMIN (owner-only)
// ============================================================

#[derive(Accounts)]
#[instruction(operator: Pubkey, status: bool)]
pub struct SetOperator<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
        has_one = owner @ TradingVaultError::NotOwner,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        space = Operator::SIZE,
        seeds = [Operator::SEED_PREFIX, operator.as_ref()],
        bump,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn set_operator(
    ctx: Context<SetOperator>,
    operator: Pubkey,
    status: bool,
) -> Result<()> {
    require!(operator != Pubkey::default(), TradingVaultError::ZeroAddress);
    let op = &mut ctx.accounts.operator_account;
    if op.operator == Pubkey::default() {
        op.operator = operator;
        op.bump = ctx.bumps.operator_account;
    }
    op.authorized = status;
    emit!(OperatorUpdated { operator, status });
    Ok(())
}
