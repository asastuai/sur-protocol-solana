use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::errors::EngineError;
use crate::state::*;

// ============================================================
//                    BOOTSTRAP ENGINE POOL (owner-only)
// ============================================================
// One-time setup: owner mints/transfers USDC into engine_authority's ATA,
// then this ix CPIs perp_vault.deposit signed by engine_authority. This
// initializes the engine pool's AccountBalance PDA on perp_vault, which is
// required as the to_balance target for the trader-margin-lock CPI in
// open_position (vault.internal_transfer requires both balances to pre-exist).
//
// This is a workaround for the structural mismatch: perp_vault.deposit's
// AccountBalance PDA is seed-keyed on the depositor signer pubkey, so the
// only way to create a balance keyed on engine_authority is to have
// engine_authority sign a deposit. That signing happens here via invoke_signed.
//
// Solidity equivalent: address(this).balances on PerpVault is created
// implicitly the first time the engine receives funds. On Solana we must
// pre-create the PDA explicitly.

#[derive(Accounts)]
pub struct BootstrapEnginePool<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
        has_one = owner @ EngineError::NotOwner,
    )]
    pub engine_config: Box<Account<'info, EngineConfig>>,

    /// CHECK: engine_authority PDA - signs the vault.deposit CPI.
    #[account(
        mut,
        seeds = [EngineConfig::AUTHORITY_SEED],
        bump = engine_config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id; validated against engine_config.perp_vault.
    #[account(constraint = perp_vault_program.key() == engine_config.perp_vault)]
    pub perp_vault_program: UncheckedAccount<'info>,

    /// CHECK: perp_vault::VaultConfig PDA.
    #[account(mut)]
    pub vault_config: UncheckedAccount<'info>,

    /// CHECK: perp_vault's USDC custody token account.
    #[account(mut)]
    pub usdc_vault: UncheckedAccount<'info>,

    /// CHECK: engine_authority's USDC ATA - pre-funded by owner.
    #[account(mut)]
    pub authority_usdc: UncheckedAccount<'info>,

    /// CHECK: engine pool AccountBalance PDA on vault.
    #[account(mut)]
    pub engine_pool_balance: UncheckedAccount<'info>,

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

pub(crate) fn handler(ctx: Context<BootstrapEnginePool>, amount: u64) -> Result<()> {
    require!(amount > 0, EngineError::ZeroAmount);

    let cfg = &ctx.accounts.engine_config;
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[EngineConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    // Build perp_vault.deposit CPI.
    // Vault Deposit Accounts order (programs/perp_vault/src/instructions/deposit.rs):
    //   0. vault_config (mut)
    //   1. usdc_vault (mut)
    //   2. user_usdc (mut)
    //   3. account_balance (init_if_needed, mut)
    //   4. depositor (signer, mut)
    //   5. token_program
    //   6. system_program
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_disc("deposit"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: ctx.accounts.perp_vault_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.vault_config.key(), false),
            AccountMeta::new(ctx.accounts.usdc_vault.key(), false),
            AccountMeta::new(ctx.accounts.authority_usdc.key(), false),
            AccountMeta::new(ctx.accounts.engine_pool_balance.key(), false),
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
            ctx.accounts.engine_pool_balance.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )?;

    Ok(())
}
