use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Withdrawn;
use crate::state::*;

// ============================================================
//                    WITHDRAW
// ============================================================
// Solidity: function withdraw(uint256 amount) external whenNotPaused nonReentrant
//   - amount > 0
//   - balance >= amount
//   - amount <= maxWithdrawalPerTx (if set)
//   - state update BEFORE transfer (CEI)
//   - transfer USDC vault → user
//
// Note: in v0.2 we do NOT yet check open-position margin (PerpEngine isn't ported).
// When PerpEngine lands, withdraw must call PerpEngine via CPI to verify
// remaining balance covers locked margin.

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: vault_authority PDA, signs the SPL transfer out of usdc_vault.
    #[account(
        seeds = [VaultConfig::AUTHORITY_SEED],
        bump = vault_config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = usdc_vault.key() == vault_config.usdc_vault,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_usdc.mint == vault_config.usdc_mint @ VaultError::UsdcMintMismatch,
        constraint = user_usdc.owner == withdrawer.key(),
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [AccountBalance::SEED_PREFIX, withdrawer.key().as_ref()],
        bump = account_balance.bump,
        constraint = account_balance.trader == withdrawer.key(),
    )]
    pub account_balance: Account<'info, AccountBalance>,

    pub withdrawer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub(crate) fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    require!(amount > 0, VaultError::ZeroAmount);

    let bal = &mut ctx.accounts.account_balance;
    require!(amount <= bal.balance, VaultError::InsufficientBalance);

    if cfg.max_withdrawal_per_tx > 0 {
        require!(
            amount <= cfg.max_withdrawal_per_tx,
            VaultError::WithdrawalTooLarge
        );
    }

    // ---- CEI: state update BEFORE external (token) call ----
    // N-5 hardening: `amount <= bal.balance` is required above, so use checked
    // math on both the per-account balance and the aggregate counter — an
    // underflow here is a conservation-invariant violation and must error, not
    // silently clamp to 0 (which would hide insolvency from off-chain monitors).
    bal.balance = bal
        .balance
        .checked_sub(amount)
        .ok_or(VaultError::MathOverflow)?;
    cfg.total_deposits = cfg
        .total_deposits
        .checked_sub(amount)
        .ok_or(VaultError::MathOverflow)?;

    // SPL transfer signed by vault_authority PDA.
    let auth_bump = cfg.vault_authority_bump;
    let auth_seeds: &[&[u8]] = &[VaultConfig::AUTHORITY_SEED, &[auth_bump]];
    let signer_seeds = &[auth_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.usdc_vault.to_account_info(),
        to: ctx.accounts.user_usdc.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    emit!(Withdrawn {
        account: ctx.accounts.withdrawer.key(),
        amount,
        new_balance: bal.balance,
    });

    Ok(())
}
