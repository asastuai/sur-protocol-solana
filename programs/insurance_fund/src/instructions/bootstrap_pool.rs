use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::errors::InsuranceFundError;
use crate::state::*;

// ============================================================
//                    BOOTSTRAP INSURANCE POOL (owner-only)
// ============================================================
// One-time setup: owner mints/transfers USDC into insurance_fund_authority's
// ATA, then this ix CPIs perp_vault.deposit signed by insurance_fund_authority.
// This initializes the fund's AccountBalance PDA on perp_vault, which is
// required as the from_balance target for pay_keeper_reward
// (vault.internal_transfer requires both balances to pre-exist).
//
// Mirrors perp_engine::bootstrap_engine_pool exactly. The structural
// reason: perp_vault.deposit's AccountBalance PDA is seed-keyed on the
// depositor signer pubkey, so the only way to create a balance keyed on
// insurance_fund_authority is to have insurance_fund_authority sign a
// deposit. That signing happens here via invoke_signed.

#[derive(Accounts)]
pub struct BootstrapInsurancePool<'info> {
    #[account(
        seeds = [InsuranceFundConfig::SEED],
        bump = config.bump,
        has_one = owner @ InsuranceFundError::NotOwner,
    )]
    pub config: Box<Account<'info, InsuranceFundConfig>>,

    /// CHECK: insurance_fund_authority PDA — signs the vault.deposit CPI.
    #[account(
        mut,
        seeds = [InsuranceFundConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id; validated against config.vault.
    #[account(constraint = perp_vault_program.key() == config.vault)]
    pub perp_vault_program: UncheckedAccount<'info>,

    /// CHECK: perp_vault::VaultConfig PDA.
    #[account(mut)]
    pub vault_config: UncheckedAccount<'info>,

    /// CHECK: perp_vault's USDC custody token account.
    #[account(mut)]
    pub usdc_vault: UncheckedAccount<'info>,

    /// CHECK: insurance_fund_authority's USDC ATA — pre-funded by owner.
    #[account(mut)]
    pub authority_usdc: UncheckedAccount<'info>,

    /// CHECK: insurance fund pool AccountBalance PDA on vault.
    #[account(mut)]
    pub fund_pool_balance: UncheckedAccount<'info>,

    /// CHECK: SPL Token program.
    pub token_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

fn anchor_disc(name: &str) -> [u8; 8] {
    let s = format!("global:{}", name);
    let h = hashv(&[s.as_bytes()]);
    let bytes = h.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

pub(crate) fn handler(ctx: Context<BootstrapInsurancePool>, amount: u64) -> Result<()> {
    require!(amount > 0, InsuranceFundError::ZeroAmount);

    let cfg = &ctx.accounts.config;
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[
        InsuranceFundConfig::AUTHORITY_SEED,
        std::slice::from_ref(&auth_bump),
    ];

    // Build perp_vault.deposit CPI (account order from perp_vault::deposit.rs).
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_disc("deposit"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: ctx.accounts.perp_vault_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.vault_config.key(), false),
            AccountMeta::new(ctx.accounts.usdc_vault.key(), false),
            AccountMeta::new(ctx.accounts.authority_usdc.key(), false),
            AccountMeta::new(ctx.accounts.fund_pool_balance.key(), false),
            AccountMeta::new(ctx.accounts.authority.key(), true),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.vault_config.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.authority_usdc.to_account_info(),
            ctx.accounts.fund_pool_balance.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )?;

    Ok(())
}
