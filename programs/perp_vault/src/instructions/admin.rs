use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::VaultError;
use crate::events::{
    DepositCapUpdated, MaxOperatorTransferUpdated, MaxWithdrawalUpdated, OwnershipTransferStarted,
    OwnershipTransferred, PauseStatusChanged,
};
use crate::state::*;

// ============================================================
//                    INITIALIZE
// ============================================================
// Solidity: constructor(usdc, owner, depositCap).
// Anchor: explicit instruction. Creates the vault_config PDA AND the
//         USDC token account owned by vault_authority PDA.

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = VaultConfig::SIZE,
        seeds = [VaultConfig::SEED],
        bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: vault_authority PDA. Owns the usdc_vault token account.
    /// Seed-derived; never written to directly.
    #[account(
        seeds = [VaultConfig::AUTHORITY_SEED],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [b"usdc_vault"],
        bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub(crate) fn initialize(
    ctx: Context<Initialize>,
    deposit_cap: u64,
    max_withdrawal_per_tx: u64,
    max_operator_transfer_per_tx: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    cfg.bump = ctx.bumps.vault_config;
    cfg.vault_authority_bump = ctx.bumps.vault_authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.paused = false;
    cfg.usdc_mint = ctx.accounts.usdc_mint.key();
    cfg.usdc_vault = ctx.accounts.usdc_vault.key();
    cfg.deposit_cap = deposit_cap;
    cfg.max_withdrawal_per_tx = max_withdrawal_per_tx;
    cfg.max_operator_transfer_per_tx = max_operator_transfer_per_tx;
    cfg.total_deposits = 0;
    cfg.total_collateral_credits = 0;

    emit!(OwnershipTransferred {
        previous_owner: Pubkey::default(),
        new_owner: ctx.accounts.owner.key(),
    });

    if deposit_cap > 0 {
        emit!(DepositCapUpdated {
            old_cap: 0,
            new_cap: deposit_cap,
        });
    }

    Ok(())
}

// ============================================================
//                    ADMIN UPDATE (shared accounts struct)
// ============================================================

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        has_one = owner @ VaultError::NotOwner,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    cfg.paused = true;
    emit!(PauseStatusChanged { is_paused: true });
    Ok(())
}

pub(crate) fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(cfg.paused, VaultError::NotPaused);
    cfg.paused = false;
    emit!(PauseStatusChanged { is_paused: false });
    Ok(())
}

pub(crate) fn set_deposit_cap(ctx: Context<AdminUpdate>, new_cap: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    let old = cfg.deposit_cap;
    cfg.deposit_cap = new_cap;
    emit!(DepositCapUpdated {
        old_cap: old,
        new_cap,
    });
    Ok(())
}

pub(crate) fn set_max_withdrawal_per_tx(ctx: Context<AdminUpdate>, new_max: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    let old = cfg.max_withdrawal_per_tx;
    cfg.max_withdrawal_per_tx = new_max;
    emit!(MaxWithdrawalUpdated {
        old_max: old,
        new_max,
    });
    Ok(())
}

pub(crate) fn set_max_operator_transfer_per_tx(
    ctx: Context<AdminUpdate>,
    new_max: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    let old = cfg.max_operator_transfer_per_tx;
    cfg.max_operator_transfer_per_tx = new_max;
    emit!(MaxOperatorTransferUpdated {
        old_max: old,
        new_max,
    });
    Ok(())
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), VaultError::ZeroAddress);
    let cfg = &mut ctx.accounts.vault_config;
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
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        VaultError::NotPendingOwner
    );

    let old_owner = cfg.owner;
    cfg.owner = ctx.accounts.pending_owner.key();
    cfg.pending_owner = Pubkey::default();
    emit!(OwnershipTransferred {
        previous_owner: old_owner,
        new_owner: cfg.owner,
    });
    Ok(())
}
