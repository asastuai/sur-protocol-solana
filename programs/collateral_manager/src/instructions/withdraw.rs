use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CollateralError;
use crate::events::CollateralWithdrawn;
use crate::state::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, CollateralManagerConfig>>,

    #[account(
        mut,
        seeds = [CollateralConfig::SEED_PREFIX, mint.key().as_ref()],
        bump = collateral.bump,
    )]
    pub collateral: Box<Account<'info, CollateralConfig>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = escrow.key() == collateral.escrow,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA owns the escrow token account; signs SPL transfer out.
    #[account(
        seeds = [CollateralConfig::ESCROW_AUTH_SEED_PREFIX, mint.key().as_ref()],
        bump = collateral.escrow_authority_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = trader_token.mint == mint.key(),
        constraint = trader_token.owner == trader.key(),
    )]
    pub trader_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [TraderCollateral::SEED_PREFIX, mint.key().as_ref(), trader.key().as_ref()],
        bump = trader_collateral.bump,
        constraint = trader_collateral.trader == trader.key(),
    )]
    pub trader_collateral: Box<Account<'info, TraderCollateral>>,

    #[account(mut)]
    pub trader: Signer<'info>,

    /// CHECK: Authority PDA, signs CPI to perp_vault.debit_collateral.
    #[account(
        mut,
        seeds = [CollateralManagerConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id.
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

pub(crate) fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, CollateralError::PausedError);
    require!(amount > 0, CollateralError::ZeroAmount);

    let c = &mut ctx.accounts.collateral;

    let now = Clock::get()?.unix_timestamp;
    require!(
        now.saturating_sub(c.last_price_update) <= c.max_price_age,
        CollateralError::StalePrice
    );

    let tc = &mut ctx.accounts.trader_collateral;
    require!(tc.amount >= amount, CollateralError::InsufficientCollateral);

    // Proportional debit: debitUsdc = creditedUsdc * amount / tc.amount.
    let debit_u128 = (tc.credited_usdc as u128)
        .checked_mul(amount as u128)
        .ok_or(CollateralError::MathOverflow)?
        / tc.amount as u128;
    let debit: u64 = debit_u128
        .try_into()
        .map_err(|_| CollateralError::MathOverflow)?;

    let auth_bump = ctx.accounts.config.authority_bump;
    let auth_seeds: &[&[u8]] = &[CollateralManagerConfig::AUTHORITY_SEED, &[auth_bump]];

    // Debit vault first (will revert if insufficient collateral_balance).
    if debit > 0 {
        invoke_vault_debit_collateral(
            &ctx.accounts.vault_program,
            &ctx.accounts.vault_config,
            &ctx.accounts.vault_operator_account,
            &ctx.accounts.trader_balance,
            &ctx.accounts.trader.to_account_info(),
            &ctx.accounts.authority,
            &ctx.accounts.system_program.to_account_info(),
            debit,
            auth_seeds,
        )?;
    }

    // CEI: state updates BEFORE escrow transfer-out.
    tc.amount = tc.amount.saturating_sub(amount);
    tc.credited_usdc = tc.credited_usdc.saturating_sub(debit);
    c.total_deposited = c.total_deposited.saturating_sub(amount);

    // Escrow -> trader, signed by escrow_authority PDA.
    let mint_key = c.mint;
    let escrow_bump = [c.escrow_authority_bump];
    let escrow_auth_seeds: [&[u8]; 3] = [
        CollateralConfig::ESCROW_AUTH_SEED_PREFIX,
        mint_key.as_ref(),
        &escrow_bump,
    ];
    let signer_seeds: [&[&[u8]]; 1] = [&escrow_auth_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.escrow.to_account_info(),
        to: ctx.accounts.trader_token.to_account_info(),
        authority: ctx.accounts.escrow_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        &signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    emit!(CollateralWithdrawn {
        trader: ctx.accounts.trader.key(),
        mint: mint_key,
        amount,
        debited_usdc: debit,
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
fn invoke_vault_debit_collateral<'info>(
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
    data.extend_from_slice(&anchor_discriminator("debit_collateral"));
    data.extend_from_slice(&amount.to_le_bytes());

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
