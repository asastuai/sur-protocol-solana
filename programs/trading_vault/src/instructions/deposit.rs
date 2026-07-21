use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::VaultDeposit;
use crate::instructions::cpi_util::invoke_vault_internal_transfer;
use crate::instructions::equity::compute_vault_equity;
use crate::instructions::fees::accrue_management_fee;
use crate::state::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, TradingVaultConfig>>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = Depositor::SIZE,
        seeds = [Depositor::SEED_PREFIX, vault.id.as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub depositor_account: Box<Account<'info, Depositor>>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    /// CHECK: Authority PDA. Signs CPI to perp_vault.internal_transfer.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---- perp_vault accounts ----
    /// CHECK: perp_vault program id, must match config.perp_vault_program.
    #[account(constraint = perp_vault_program.key() == config.perp_vault_program)]
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    #[account(constraint = perp_vault_config.key() == config.perp_vault_config)]
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault Operator PDA for the trading_vault authority.
    #[account(constraint = vault_operator_account.key() == config.vault_operator_account)]
    pub vault_operator_account: UncheckedAccount<'info>,

    /// CHECK: depositor's perp_vault AccountBalance PDA — source of USDC.
    #[account(mut)]
    pub depositor_balance: UncheckedAccount<'info>,
    /// CHECK: vault PDA's perp_vault AccountBalance PDA — destination.
    #[account(mut)]
    pub vault_balance: UncheckedAccount<'info>,
    /// CHECK: manager's perp_vault AccountBalance PDA — receives mgmt fee.
    #[account(mut)]
    pub manager_balance: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Deposit<'info>>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, TradingVaultError::ZeroAmount);

    let cfg = ctx.accounts.config.clone();
    let vault_pda = ctx.accounts.vault.key();
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[TradingVaultConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    // Drawdown check + pause check on cached vault state.
    require!(!ctx.accounts.vault.paused, TradingVaultError::VaultPausedError);

    let now = Clock::get()?.unix_timestamp;

    // Compute pre-deposit equity from on-chain state.
    let pre_equity = compute_vault_equity(
        &ctx.accounts.vault_balance.to_account_info(),
        ctx.remaining_accounts,
        cfg.perp_vault_program,
        cfg.perp_engine_program,
        vault_pda,
        ctx.accounts.vault.registered_markets(),
    )?;

    // Accrue management fee FIRST (H-15) — uses pre-deposit equity.
    let mgmt_paid = accrue_management_fee(
        &mut ctx.accounts.vault,
        pre_equity,
        now,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.vault_balance,
        &ctx.accounts.manager_balance,
        &ctx.accounts.authority,
        auth_seeds,
    )?;
    let post_fee_equity = pre_equity.saturating_sub(mgmt_paid);

    // Deposit cap check on post-fee equity.
    if ctx.accounts.vault.deposit_cap > 0 {
        let new_total = post_fee_equity
            .checked_add(amount)
            .ok_or(TradingVaultError::MathOverflow)?;
        require!(
            new_total <= ctx.accounts.vault.deposit_cap,
            TradingVaultError::DepositCapExceeded
        );
    }

    // Compute shares against post-fee equity.
    let shares: u128 = if ctx.accounts.vault.total_shares == 0 {
        require!(
            amount >= MIN_FIRST_DEPOSIT,
            TradingVaultError::MinFirstDepositNotMet
        );
        (amount as u128)
            .checked_mul(SHARE_PER_PRICE)
            .ok_or(TradingVaultError::MathOverflow)?
    } else {
        require!(post_fee_equity > 0, TradingVaultError::InvalidEquity);
        (amount as u128)
            .checked_mul(ctx.accounts.vault.total_shares)
            .ok_or(TradingVaultError::MathOverflow)?
            / (post_fee_equity as u128)
    };
    require!(shares > 0, TradingVaultError::DepositTooSmall);

    // CPI: depositor's vault USDC -> vault's vault USDC.
    invoke_vault_internal_transfer(
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.depositor_balance,
        &ctx.accounts.vault_balance,
        &ctx.accounts.authority,
        amount,
        auth_seeds,
    )?;

    // Update vault state.
    let v = &mut ctx.accounts.vault;
    v.total_shares = v
        .total_shares
        .checked_add(shares)
        .ok_or(TradingVaultError::MathOverflow)?;
    v.total_deposited = v
        .total_deposited
        .checked_add(amount)
        .ok_or(TradingVaultError::MathOverflow)?;

    // Depositor PDA accounting.
    let d = &mut ctx.accounts.depositor_account;
    if d.depositor == Pubkey::default() {
        d.depositor = ctx.accounts.depositor.key();
        d.vault_id = v.id;
        d.bump = ctx.bumps.depositor_account;
    }
    d.shares = d
        .shares
        .checked_add(shares)
        .ok_or(TradingVaultError::MathOverflow)?;
    d.deposit_timestamp = now;
    d.total_deposited = d
        .total_deposited
        .checked_add(amount)
        .ok_or(TradingVaultError::MathOverflow)?;

    // Update HWM inline (G-31): newEquity = post_fee_equity + amount.
    let new_equity = post_fee_equity
        .checked_add(amount)
        .ok_or(TradingVaultError::MathOverflow)?;
    let eps = if v.total_shares > 0 {
        (new_equity as u128)
            .checked_mul(SHARE_PRECISION)
            .ok_or(TradingVaultError::MathOverflow)?
            / v.total_shares
    } else {
        PRICE_PRECISION
    };
    if eps > v.high_water_mark {
        v.high_water_mark = eps;
    }

    emit!(VaultDeposit {
        vault_id: v.id,
        depositor: ctx.accounts.depositor.key(),
        usdc_amount: amount,
        shares_issued: shares,
        equity_at_time: new_equity,
    });
    Ok(())
}
