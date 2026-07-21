use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::VaultWithdraw;
use crate::instructions::cpi_util::invoke_vault_internal_transfer;
use crate::instructions::equity::compute_vault_equity;
use crate::instructions::fees::{accrue_management_fee, collect_performance_fee};
use crate::state::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
        mut,
        seeds = [Depositor::SEED_PREFIX, vault.id.as_ref(), depositor.key().as_ref()],
        bump = depositor_account.bump,
        constraint = depositor_account.depositor == depositor.key(),
    )]
    pub depositor_account: Box<Account<'info, Depositor>>,

    pub depositor: Signer<'info>,

    /// CHECK: Authority PDA. Signs CPI to perp_vault.internal_transfer.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---- perp_vault accounts ----
    /// CHECK: perp_vault program id.
    #[account(constraint = perp_vault_program.key() == config.perp_vault_program)]
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    #[account(constraint = perp_vault_config.key() == config.perp_vault_config)]
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault Operator PDA for the trading_vault authority.
    #[account(constraint = vault_operator_account.key() == config.vault_operator_account)]
    pub vault_operator_account: UncheckedAccount<'info>,

    /// CHECK: depositor's perp_vault AccountBalance PDA — receives USDC.
    #[account(mut)]
    pub depositor_balance: UncheckedAccount<'info>,
    /// CHECK: vault PDA's perp_vault AccountBalance PDA — source.
    #[account(mut)]
    pub vault_balance: UncheckedAccount<'info>,
    /// CHECK: manager's perp_vault AccountBalance PDA — receives fees.
    #[account(mut)]
    pub manager_balance: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>,
    shares: u128,
) -> Result<()> {
    require!(shares > 0, TradingVaultError::ZeroAmount);

    let cfg = ctx.accounts.config.clone();
    let vault_pda = ctx.accounts.vault.key();
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[TradingVaultConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    require!(
        ctx.accounts.depositor_account.shares >= shares,
        TradingVaultError::InsufficientShares
    );

    let now = Clock::get()?.unix_timestamp;

    // Lockup check (Solidity: depositTimestamp + lockupPeriodSecs).
    let unlock_time = ctx
        .accounts
        .depositor_account
        .deposit_timestamp
        .checked_add(ctx.accounts.vault.lockup_period_secs)
        .ok_or(TradingVaultError::MathOverflow)?;
    require!(now >= unlock_time, TradingVaultError::LockupNotExpired);

    // Pre-fee equity.
    let pre_equity = compute_vault_equity(
        &ctx.accounts.vault_balance.to_account_info(),
        ctx.remaining_accounts,
        cfg.perp_vault_program,
        cfg.perp_engine_program,
        vault_pda,
        ctx.accounts.vault.registered_markets(),
    )?;

    // Accrue management fee, then collect performance fee.
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
    let post_mgmt_equity = pre_equity.saturating_sub(mgmt_paid);

    let perf_paid = collect_performance_fee(
        &mut ctx.accounts.vault,
        post_mgmt_equity,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.vault_balance,
        &ctx.accounts.manager_balance,
        &ctx.accounts.authority,
        auth_seeds,
    )?;
    let post_fee_equity = post_mgmt_equity.saturating_sub(perf_paid);

    // usdc_amount = shares * equity / total_shares.
    require!(
        ctx.accounts.vault.total_shares > 0,
        TradingVaultError::InvalidEquity
    );
    let usdc_u128 = shares
        .checked_mul(post_fee_equity as u128)
        .ok_or(TradingVaultError::MathOverflow)?
        / ctx.accounts.vault.total_shares;
    let usdc_amount: u64 = usdc_u128
        .try_into()
        .map_err(|_| TradingVaultError::MathOverflow)?;
    require!(usdc_amount > 0, TradingVaultError::DepositTooSmall);

    // Burn shares + accounting BEFORE the external CPI (CEI).
    let v = &mut ctx.accounts.vault;
    v.total_shares = v
        .total_shares
        .checked_sub(shares)
        .ok_or(TradingVaultError::MathOverflow)?;
    v.total_withdrawn = v
        .total_withdrawn
        .checked_add(usdc_amount)
        .ok_or(TradingVaultError::MathOverflow)?;

    let d = &mut ctx.accounts.depositor_account;
    d.shares = d
        .shares
        .checked_sub(shares)
        .ok_or(TradingVaultError::MathOverflow)?;
    d.total_withdrawn = d
        .total_withdrawn
        .checked_add(usdc_amount)
        .ok_or(TradingVaultError::MathOverflow)?;

    // CPI: vault USDC -> depositor USDC.
    invoke_vault_internal_transfer(
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.vault_balance,
        &ctx.accounts.depositor_balance,
        &ctx.accounts.authority,
        usdc_amount,
        auth_seeds,
    )?;

    let post_eq = post_fee_equity.saturating_sub(usdc_amount);
    emit!(VaultWithdraw {
        vault_id: v.id,
        depositor: ctx.accounts.depositor.key(),
        shares_burned: shares,
        usdc_returned: usdc_amount,
        equity_at_time: post_eq,
    });
    Ok(())
}
