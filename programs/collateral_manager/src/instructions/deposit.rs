use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CollateralError;
use crate::events::CollateralDeposited;
use crate::state::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, CollateralManagerConfig>>,

    #[account(
        mut,
        seeds = [CollateralConfig::SEED_PREFIX, mint.key().as_ref()],
        bump = collateral.bump,
        constraint = collateral.mint == mint.key() @ CollateralError::CollateralNotSupported,
    )]
    pub collateral: Box<Account<'info, CollateralConfig>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = escrow.key() == collateral.escrow,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = trader_token.mint == mint.key(),
        constraint = trader_token.owner == trader.key(),
    )]
    pub trader_token: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = trader,
        space = TraderCollateral::SIZE,
        seeds = [TraderCollateral::SEED_PREFIX, mint.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub trader_collateral: Box<Account<'info, TraderCollateral>>,

    #[account(mut)]
    pub trader: Signer<'info>,

    /// CHECK: Authority PDA, signs CPI to perp_vault.credit_collateral.
    /// Mut so it can pay rent for init_if_needed AccountBalance at vault.
    #[account(
        mut,
        seeds = [CollateralManagerConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---- perp_vault CPI accounts ----
    /// CHECK: perp_vault program id, must match config.vault_program.
    #[account(constraint = vault_program.key() == config.vault_program)]
    pub vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    #[account(mut, constraint = vault_config.key() == config.vault_config)]
    pub vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault Operator PDA for the authority.
    #[account(constraint = vault_operator_account.key() == config.vault_operator_account)]
    pub vault_operator_account: UncheckedAccount<'info>,
    /// CHECK: per-trader AccountBalance PDA at perp_vault.
    #[account(mut)]
    pub trader_balance: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, CollateralError::PausedError);
    require!(amount > 0, CollateralError::ZeroAmount);

    let c = &mut ctx.accounts.collateral;
    require!(c.active, CollateralError::CollateralPausedError);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now.saturating_sub(c.last_price_update) <= c.max_price_age,
        CollateralError::StalePrice
    );

    if c.deposit_cap > 0 {
        let new_total = c
            .total_deposited
            .checked_add(amount)
            .ok_or(CollateralError::MathOverflow)?;
        require!(new_total <= c.deposit_cap, CollateralError::DepositCapExceeded);
    }

    // Mirror Solidity: creditedUsdc = (amount * price * haircutBps) / (10**decimals * BPS).
    // Output is USDC 6-decimals because price is stored 6-decimals (PRICE_PRECISION).
    let denom = (10u128)
        .checked_pow(c.decimals as u32)
        .ok_or(CollateralError::MathOverflow)?
        .checked_mul(BPS as u128)
        .ok_or(CollateralError::MathOverflow)?;
    let credited_u128 = (amount as u128)
        .checked_mul(c.price as u128)
        .ok_or(CollateralError::MathOverflow)?
        .checked_mul(c.haircut_bps as u128)
        .ok_or(CollateralError::MathOverflow)?
        / denom;
    let credited: u64 = credited_u128
        .try_into()
        .map_err(|_| CollateralError::MathOverflow)?;
    require!(credited > 0, CollateralError::DepositTooSmall);

    let tc = &mut ctx.accounts.trader_collateral;
    if tc.amount == 0 {
        if tc.trader == Pubkey::default() {
            tc.trader = ctx.accounts.trader.key();
            tc.mint = c.mint;
            tc.bump = ctx.bumps.trader_collateral;
        }
        // Mapping 3: snapshot haircut + threshold at fresh entry. Top-ups
        // inherit existing snapshot. Full close + redeposit re-snapshots.
        tc.haircut_at_deposit = c.haircut_bps;
        tc.liquidation_threshold_at_deposit = ctx.accounts.config.liquidation_threshold_bps;
    }
    tc.amount = tc
        .amount
        .checked_add(amount)
        .ok_or(CollateralError::MathOverflow)?;
    tc.credited_usdc = tc
        .credited_usdc
        .checked_add(credited)
        .ok_or(CollateralError::MathOverflow)?;
    c.total_deposited = c
        .total_deposited
        .checked_add(amount)
        .ok_or(CollateralError::MathOverflow)?;

    let cpi_accounts = Transfer {
        from: ctx.accounts.trader_token.to_account_info(),
        to: ctx.accounts.escrow.to_account_info(),
        authority: ctx.accounts.trader.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    let auth_bump = ctx.accounts.config.authority_bump;
    let auth_seeds: &[&[u8]] = &[CollateralManagerConfig::AUTHORITY_SEED, &[auth_bump]];

    invoke_vault_credit_collateral(
        &ctx.accounts.vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.trader_balance,
        &ctx.accounts.trader.to_account_info(),
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        credited,
        auth_seeds,
    )?;

    emit!(CollateralDeposited {
        trader: ctx.accounts.trader.key(),
        mint: c.mint,
        amount,
        credited_usdc: credited,
    });
    Ok(())
}

fn anchor_discriminator(method_name: &str) -> [u8; 8] {
    let mut full_name = String::with_capacity(7 + method_name.len());
    full_name.push_str("global:");
    full_name.push_str(method_name);
    let h = hashv(&[full_name.as_bytes()]);
    let bytes = h.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

#[allow(clippy::too_many_arguments)]
fn invoke_vault_credit_collateral<'info>(
    vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    trader_balance: &UncheckedAccount<'info>,
    trader: &AccountInfo<'info>,
    authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_discriminator("credit_collateral"));
    data.extend_from_slice(&amount.to_le_bytes());

    // perp_vault.collateral::CollateralOp account order:
    //   vault_config (mut), operator_account, trader_balance (mut, init_if_needed),
    //   trader (UncheckedAccount), operator (signer + mut, payer), system_program.
    let ix = Instruction {
        program_id: vault_program.key(),
        accounts: vec![
            AccountMeta::new(vault_config.key(), false),
            AccountMeta::new_readonly(vault_operator_account.key(), false),
            AccountMeta::new(trader_balance.key(), false),
            AccountMeta::new_readonly(trader.key(), false),
            AccountMeta::new(authority.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            vault_config.to_account_info(),
            vault_operator_account.to_account_info(),
            trader_balance.to_account_info(),
            trader.clone(),
            authority.to_account_info(),
            system_program.clone(),
            vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}
