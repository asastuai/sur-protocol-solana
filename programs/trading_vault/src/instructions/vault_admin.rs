use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::{VaultCreated, VaultPauseChanged, VaultSafetyLimitsUpdated};
use crate::state::*;

// ============================================================
//                    CREATE VAULT
// ============================================================
// Vault id is generated client-side (sha256 of name+manager+salt) and
// passed in as instruction arg. Mirrors Solidity bytes32 vaultId.

#[derive(Accounts)]
#[instruction(
    vault_id: [u8; 32],
    name: Vec<u8>,
    description: Vec<u8>,
    performance_fee_bps: u64,
    management_fee_bps: u64,
    deposit_cap: u64,
    lockup_period_secs: i64,
    max_drawdown_bps: u64,
)]
pub struct CreateVault<'info> {
    #[account(
        mut,
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    #[account(
        init,
        payer = manager,
        space = Vault::SIZE,
        seeds = [Vault::SEED_PREFIX, vault_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn create_vault(
    ctx: Context<CreateVault>,
    vault_id: [u8; 32],
    name: Vec<u8>,
    description: Vec<u8>,
    performance_fee_bps: u64,
    management_fee_bps: u64,
    deposit_cap: u64,
    lockup_period_secs: i64,
    max_drawdown_bps: u64,
) -> Result<()> {
    require!(performance_fee_bps <= 3000, TradingVaultError::InvalidFees);
    require!(management_fee_bps <= 500, TradingVaultError::InvalidFees);
    require!(
        max_drawdown_bps > 0 && max_drawdown_bps <= 9000,
        TradingVaultError::InvalidDrawdownLimit
    );
    require!(lockup_period_secs >= 0, TradingVaultError::ZeroAmount);
    require!(name.len() <= NAME_MAX_LEN, TradingVaultError::NameTooLong);
    require!(
        description.len() <= DESCRIPTION_MAX_LEN,
        TradingVaultError::DescriptionTooLong
    );

    let clock = Clock::get()?;
    let v = &mut ctx.accounts.vault;
    v.bump = ctx.bumps.vault;
    v.id = vault_id;
    v.manager = ctx.accounts.manager.key();
    v.paused = false;
    v.total_shares = 0;
    v.total_deposited = 0;
    v.total_withdrawn = 0;
    v.performance_fee_bps = performance_fee_bps;
    v.management_fee_bps = management_fee_bps;
    v.high_water_mark = PRICE_PRECISION;
    v.last_fee_accrual = clock.unix_timestamp;
    v.deposit_cap = deposit_cap;
    v.lockup_period_secs = lockup_period_secs;
    v.max_drawdown_bps = max_drawdown_bps;
    v.drawdown_paused_at = 0;
    v.created_at = clock.unix_timestamp;

    v.name_len = name.len() as u8;
    v.name = [0u8; NAME_MAX_LEN];
    v.name[..name.len()].copy_from_slice(&name);

    v.description_len = description.len() as u16;
    v.description = [0u8; DESCRIPTION_MAX_LEN];
    v.description[..description.len()].copy_from_slice(&description);

    let cfg = &mut ctx.accounts.config;
    cfg.vault_count = cfg
        .vault_count
        .checked_add(1)
        .ok_or(TradingVaultError::MathOverflow)?;

    emit!(VaultCreated {
        vault_id,
        manager: ctx.accounts.manager.key(),
        performance_fee_bps,
        management_fee_bps,
    });
    Ok(())
}

// ============================================================
//                    INIT VAULT BALANCE
// ============================================================
// Called once after create_vault. Bootstraps the vault PDA's perp_vault
// AccountBalance via credit_collateral(1) + debit_collateral(1) — leaves
// all balances at zero. Required because perp_vault.internal_transfer
// (used by deposit/withdraw) does NOT init_if_needed the destination
// balance, but credit_collateral does.

#[derive(Accounts)]
pub struct InitVaultBalance<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    #[account(
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Authority PDA — signs CPI as perp_vault operator.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id.
    #[account(constraint = perp_vault_program.key() == config.perp_vault_program)]
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    #[account(mut, constraint = perp_vault_config.key() == config.perp_vault_config)]
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault Operator PDA for the trading_vault authority.
    #[account(constraint = vault_operator_account.key() == config.vault_operator_account)]
    pub vault_operator_account: UncheckedAccount<'info>,

    /// CHECK: vault PDA's perp_vault AccountBalance — created by CPI here.
    #[account(mut)]
    pub vault_balance: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn init_vault_balance(ctx: Context<InitVaultBalance>) -> Result<()> {
    use crate::instructions::cpi_util::{
        invoke_vault_credit_collateral, invoke_vault_debit_collateral,
    };
    let auth_bump = ctx.accounts.config.authority_bump;
    let auth_seeds: &[&[u8]] = &[
        TradingVaultConfig::AUTHORITY_SEED,
        std::slice::from_ref(&auth_bump),
    ];
    invoke_vault_credit_collateral(
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.vault_balance,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        1,
        auth_seeds,
    )?;
    invoke_vault_debit_collateral(
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.vault_operator_account,
        &ctx.accounts.vault_balance,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        1,
        auth_seeds,
    )?;
    Ok(())
}

// ============================================================
//                    PAUSE / UNPAUSE
// ============================================================
// - Manager can unpause: enforces drawdown cooldown if paused by drawdown.
// - Owner emergency_pause: force-pause any vault. No cooldown to bypass.

#[derive(Accounts)]
pub struct ManagerPause<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
        constraint = vault.manager == manager.key() @ TradingVaultError::NotManager,
    )]
    pub vault: Account<'info, Vault>,

    pub manager: Signer<'info>,
}

pub(crate) fn unpause_vault(ctx: Context<ManagerPause>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let v = &mut ctx.accounts.vault;
    if v.drawdown_paused_at > 0 {
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(v.drawdown_paused_at);
        require!(
            elapsed >= cfg.drawdown_cooldown_secs,
            TradingVaultError::DrawdownCooldownActive
        );
        v.drawdown_paused_at = 0;
    }
    v.paused = false;
    emit!(VaultPauseChanged {
        vault_id: v.id,
        is_paused: false,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct OwnerVaultPause<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
        has_one = owner @ TradingVaultError::NotOwner,
    )]
    pub config: Account<'info, TradingVaultConfig>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub owner: Signer<'info>,
}

pub(crate) fn emergency_pause(ctx: Context<OwnerVaultPause>) -> Result<()> {
    let v = &mut ctx.accounts.vault;
    v.paused = true;
    emit!(VaultPauseChanged {
        vault_id: v.id,
        is_paused: true,
    });
    Ok(())
}

// ============================================================
//                    UPDATE SAFETY LIMITS (manager-only)
// ============================================================
// Solidity does not expose a setter for these on TradingVault.sol — fees
// + drawdown limits are immutable after creation. Port preserves immutability
// of fee bps and max_drawdown_bps, but allows manager to RAISE deposit_cap
// or REDUCE lockup_period_secs (operationally lenient changes only). Anything
// stricter would require a new vault.
//
// Decision: only allow deposit_cap raise and lockup reduce. Reject otherwise.

#[derive(Accounts)]
pub struct UpdateVaultSafetyLimits<'info> {
    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
        constraint = vault.manager == manager.key() @ TradingVaultError::NotManager,
    )]
    pub vault: Account<'info, Vault>,

    pub manager: Signer<'info>,
}

pub(crate) fn update_vault_safety_limits(
    ctx: Context<UpdateVaultSafetyLimits>,
    new_deposit_cap: u64,
    new_lockup_period_secs: i64,
) -> Result<()> {
    let v = &mut ctx.accounts.vault;
    require!(new_lockup_period_secs >= 0, TradingVaultError::ZeroAmount);
    if v.deposit_cap > 0 {
        require!(
            new_deposit_cap == 0 || new_deposit_cap >= v.deposit_cap,
            TradingVaultError::InvalidFees
        );
    }
    require!(
        new_lockup_period_secs <= v.lockup_period_secs,
        TradingVaultError::InvalidFees
    );
    v.deposit_cap = new_deposit_cap;
    v.lockup_period_secs = new_lockup_period_secs;

    emit!(VaultSafetyLimitsUpdated {
        vault_id: v.id,
        deposit_cap: new_deposit_cap,
        lockup_period_secs: new_lockup_period_secs,
        max_drawdown_bps: v.max_drawdown_bps,
    });
    Ok(())
}
