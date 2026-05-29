use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::{CollateralCredited, CollateralDebited};
use crate::state::*;

// ============================================================
//                    CREDIT / DEBIT COLLATERAL
// ============================================================
// Solidity: creditCollateral(trader, amount) / debitCollateral(trader, amount)
//   onlyOperator whenNotPaused. Used by CollateralManager when traders deposit
//   yield-bearing tokens. Credits go to collateral_balance (NOT withdrawable
//   as USDC — backed by yield tokens in CollateralManager).

#[derive(Accounts)]
pub struct CollateralOp<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ VaultError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(
        init_if_needed,
        payer = operator,
        space = AccountBalance::SIZE,
        seeds = [AccountBalance::SEED_PREFIX, trader.key().as_ref()],
        bump,
    )]
    pub trader_balance: Account<'info, AccountBalance>,

    /// CHECK: trader pubkey is identity only — no signing required for collateral CPI from operator.
    pub trader: UncheckedAccount<'info>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn credit_collateral(ctx: Context<CollateralOp>, amount: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    require!(amount > 0, VaultError::ZeroAmount);
    require!(
        ctx.accounts.trader.key() != Pubkey::default(),
        VaultError::ZeroAddress
    );

    let bal = &mut ctx.accounts.trader_balance;
    if bal.trader == Pubkey::default() {
        bal.trader = ctx.accounts.trader.key();
        bal.bump = ctx.bumps.trader_balance;
    }
    bal.collateral_balance = bal
        .collateral_balance
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    cfg.total_collateral_credits = cfg
        .total_collateral_credits
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;

    emit!(CollateralCredited {
        trader: ctx.accounts.trader.key(),
        amount,
    });
    Ok(())
}

pub(crate) fn debit_collateral(ctx: Context<CollateralOp>, amount: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    require!(amount > 0, VaultError::ZeroAmount);

    let bal = &mut ctx.accounts.trader_balance;
    require!(amount <= bal.collateral_balance, VaultError::InsufficientBalance);

    // N-5 hardening: `amount <= collateral_balance` is required above; use checked
    // math so an aggregate-counter underflow surfaces as an error instead of
    // silently clamping to 0 (which would mask a conservation-invariant break).
    bal.collateral_balance = bal
        .collateral_balance
        .checked_sub(amount)
        .ok_or(VaultError::MathOverflow)?;
    cfg.total_collateral_credits = cfg
        .total_collateral_credits
        .checked_sub(amount)
        .ok_or(VaultError::MathOverflow)?;

    emit!(CollateralDebited {
        trader: ctx.accounts.trader.key(),
        amount,
    });
    Ok(())
}
