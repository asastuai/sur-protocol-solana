use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Deposited;
use crate::state::*;

// ============================================================
//                    DEPOSIT
// ============================================================
// Solidity: function deposit(uint256 amount) external whenNotPaused nonReentrant
//   - check amount > 0
//   - check deposit cap
//   - transferFrom user → vault (USDC)
//   - update balances + totalDeposits
//
// Anchor: SPL token transfer from user_usdc_ata → usdc_vault, then update PDAs.
//
// M-13 fix from upstream (fee-on-transfer guard) is omitted: classic SPL Token
// has no fee-on-transfer extension. If this vault ever supports Token-2022
// with transfer fees, add a balance-before/after check here.

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        constraint = usdc_vault.key() == vault_config.usdc_vault,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_usdc.mint == vault_config.usdc_mint @ VaultError::UsdcMintMismatch,
        constraint = user_usdc.owner == depositor.key(),
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = AccountBalance::SIZE,
        seeds = [AccountBalance::SEED_PREFIX, depositor.key().as_ref()],
        bump,
    )]
    pub account_balance: Account<'info, AccountBalance>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    require!(amount > 0, VaultError::ZeroAmount);

    if cfg.deposit_cap > 0 {
        let new_total = cfg
            .total_deposits
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        require!(new_total <= cfg.deposit_cap, VaultError::DepositCapExceeded);
    }

    // SPL transfer: depositor's ATA → vault's usdc_vault token account.
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_usdc.to_account_info(),
        to: ctx.accounts.usdc_vault.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update accounting AFTER successful transfer.
    let bal = &mut ctx.accounts.account_balance;
    if bal.trader == Pubkey::default() {
        bal.trader = ctx.accounts.depositor.key();
        bal.bump = ctx.bumps.account_balance;
    }
    bal.balance = bal
        .balance
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    cfg.total_deposits = cfg
        .total_deposits
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;

    emit!(Deposited {
        account: ctx.accounts.depositor.key(),
        amount,
        new_balance: bal.balance,
    });

    Ok(())
}
