use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::VaultTradeExecuted;
use crate::instructions::cpi_util::{
    invoke_engine_close_position, invoke_engine_open_position, invoke_engine_reduce_position,
    read_position_size,
};
use crate::instructions::equity::compute_vault_equity;
use crate::instructions::fees::check_drawdown;
use crate::state::*;

// ============================================================
//                    MANAGER OPEN POSITION
// ============================================================

#[derive(Accounts)]
pub struct ManagerOpenPosition<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, TradingVaultConfig>>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
        constraint = vault.manager == manager.key() @ TradingVaultError::NotManager,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub manager: Signer<'info>,

    /// CHECK: Authority PDA. Signs CPI to perp_engine.open_position.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_engine program id.
    #[account(constraint = perp_engine_program.key() == config.perp_engine_program)]
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: perp_engine EngineConfig PDA.
    #[account(constraint = perp_engine_config.key() == config.perp_engine_config)]
    pub perp_engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA matching market_id arg (validated by engine).
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: position PDA for this vault PDA + market_id (init_if_needed by engine).
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: engine Operator PDA for the trading_vault authority.
    #[account(constraint = engine_operator_account.key() == config.engine_operator_account)]
    pub engine_operator_account: UncheckedAccount<'info>,

    /// CHECK: vault's perp_vault AccountBalance PDA — used for both drawdown
    /// equity read AND src_balance for engine's margin-lock CPI (v0.3.1).
    #[account(mut)]
    pub vault_balance: UncheckedAccount<'info>,

    // --- engine_authority + its vault wiring (forwarded into engine.open_position via remaining_accounts) ---
    /// CHECK: engine_authority PDA — engine signs its internal vault.internal_transfer as this PDA.
    pub engine_authority: UncheckedAccount<'info>,
    /// CHECK: perp_vault program id — the engine's internal CPI target.
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for engine_authority.
    pub engine_vault_operator: UncheckedAccount<'info>,
    /// CHECK: engine_authority's vault AccountBalance PDA (margin pool destination, mut).
    #[account(mut)]
    pub engine_pool_balance: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn manager_open_position<'info>(
    ctx: Context<'_, '_, '_, 'info, ManagerOpenPosition<'info>>,
    market_id: [u8; 32],
    size_delta: i64,
    fill_price: u64,
) -> Result<()> {
    require!(!ctx.accounts.vault.paused, TradingVaultError::VaultPausedError);

    let cfg = ctx.accounts.config.clone();
    let vault_pda = ctx.accounts.vault.key();
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] =
        &[TradingVaultConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    let now = Clock::get()?.unix_timestamp;

    // Drawdown check uses on-chain equity.
    let equity = compute_vault_equity(
        &ctx.accounts.vault_balance.to_account_info(),
        ctx.remaining_accounts,
        cfg.perp_vault_program,
        cfg.perp_engine_program,
        vault_pda,
        ctx.accounts.vault.registered_markets(),
    )?;
    let breached = check_drawdown(&mut ctx.accounts.vault, equity, now)?;
    if breached {
        // Vault auto-paused; do not execute trade. Returning Ok preserves
        // the pause + drawdown_paused_at state across the tx (a return Err
        // would roll it back, mirroring the Solidity bug).
        return Ok(());
    }

    // Routing (stranded-margin High fix): a delta that shrinks or flips the
    // vault's existing position must settle the freed margin + realized PnL
    // back to vault_balance — open_position only moves value INBOUND:
    //   fresh open / same-sign increase -> open_position
    //   exact full close               -> close_position
    //   partial reduce or flip         -> reduce_position
    let cur_size = read_position_size(&ctx.accounts.position);
    let new_size = cur_size
        .checked_add(size_delta)
        .ok_or(TradingVaultError::MathOverflow)?;

    if cur_size == 0 || (cur_size > 0) == (size_delta > 0) {
        invoke_engine_open_position(
            &ctx.accounts.perp_engine_program,
            &ctx.accounts.perp_engine_config,
            &ctx.accounts.engine_market,
            &ctx.accounts.position,
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.engine_operator_account,
            &ctx.accounts.authority,
            &ctx.accounts.system_program.to_account_info(),
            // v0.3.1 wiring: forward vault accounts so engine's margin-lock CPI fires.
            // src_balance = vault PDA's own perp_vault.AccountBalance (vault is the trader).
            &ctx.accounts.engine_authority,
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.perp_vault_config,
            &ctx.accounts.engine_vault_operator,
            &ctx.accounts.vault_balance,
            &ctx.accounts.engine_pool_balance,
            size_delta,
            fill_price,
            auth_seeds,
        )?;
    } else if new_size == 0 {
        invoke_engine_close_position(
            &ctx.accounts.perp_engine_program,
            &ctx.accounts.perp_engine_config,
            &ctx.accounts.engine_market,
            &ctx.accounts.position,
            &ctx.accounts.engine_operator_account,
            &ctx.accounts.authority,
            &ctx.accounts.engine_authority,
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.perp_vault_config,
            &ctx.accounts.engine_vault_operator,
            &ctx.accounts.vault_balance,
            &ctx.accounts.engine_pool_balance,
            fill_price,
            auth_seeds,
        )?;
    } else {
        invoke_engine_reduce_position(
            &ctx.accounts.perp_engine_program,
            &ctx.accounts.perp_engine_config,
            &ctx.accounts.engine_market,
            &ctx.accounts.position,
            &ctx.accounts.engine_operator_account,
            &ctx.accounts.authority,
            &ctx.accounts.engine_authority,
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.perp_vault_config,
            &ctx.accounts.engine_vault_operator,
            &ctx.accounts.vault_balance,
            &ctx.accounts.engine_pool_balance,
            size_delta,
            fill_price,
            auth_seeds,
        )?;
    }

    // CRITICAL-1 fix (2026-07-21 audit): register this market in the vault's equity
    // registry (add-only) so deposits/withdrawals/drawdown must value the full set.
    if !ctx.accounts.vault.has_market(&market_id) {
        require!(
            ctx.accounts.vault.push_market(market_id),
            TradingVaultError::TooManyMarkets
        );
    }

    emit!(VaultTradeExecuted {
        vault_id: ctx.accounts.vault.id,
        market_id,
        size_delta,
        price: fill_price,
    });
    Ok(())
}

// ============================================================
//                    MANAGER CLOSE POSITION
// ============================================================

#[derive(Accounts)]
pub struct ManagerClosePosition<'info> {
    #[account(
        seeds = [TradingVaultConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, TradingVaultConfig>>,

    #[account(
        seeds = [Vault::SEED_PREFIX, vault.id.as_ref()],
        bump = vault.bump,
        constraint = vault.manager == manager.key() @ TradingVaultError::NotManager,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub manager: Signer<'info>,

    /// CHECK: Authority PDA. Signs CPI to perp_engine.close_position.
    #[account(
        mut,
        seeds = [TradingVaultConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_engine program id.
    #[account(constraint = perp_engine_program.key() == config.perp_engine_program)]
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: perp_engine EngineConfig PDA.
    #[account(constraint = perp_engine_config.key() == config.perp_engine_config)]
    pub perp_engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: position PDA for this vault PDA + market_id.
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: engine Operator PDA for the trading_vault authority.
    #[account(constraint = engine_operator_account.key() == config.engine_operator_account)]
    pub engine_operator_account: UncheckedAccount<'info>,

    // --- engine_authority + its vault wiring (forwarded into engine.close_position via remaining_accounts) ---
    /// CHECK: engine_authority PDA — engine signs its internal vault.internal_transfer as this PDA.
    pub engine_authority: UncheckedAccount<'info>,
    /// CHECK: perp_vault program id — the engine's internal CPI target.
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault VaultConfig PDA.
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for engine_authority.
    pub engine_vault_operator: UncheckedAccount<'info>,
    /// CHECK: vault's perp_vault AccountBalance PDA — destination for PnL settlement.
    #[account(mut)]
    pub vault_balance: UncheckedAccount<'info>,
    /// CHECK: engine_authority's vault AccountBalance PDA (margin pool source, mut).
    #[account(mut)]
    pub engine_pool_balance: UncheckedAccount<'info>,
}

pub(crate) fn manager_close_position(
    ctx: Context<ManagerClosePosition>,
    market_id: [u8; 32],
    fill_price: u64,
) -> Result<()> {
    let auth_bump = ctx.accounts.config.authority_bump;
    let auth_seeds: &[&[u8]] =
        &[TradingVaultConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    invoke_engine_close_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.perp_engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.position,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.authority,
        // v0.3.1 wiring: forward vault accounts so engine's PnL-settlement CPI fires.
        // src_balance is vault PDA's own balance — that's where margin returns to.
        &ctx.accounts.engine_authority,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.perp_vault_config,
        &ctx.accounts.engine_vault_operator,
        &ctx.accounts.vault_balance,
        &ctx.accounts.engine_pool_balance,
        fill_price,
        auth_seeds,
    )?;

    emit!(VaultTradeExecuted {
        vault_id: ctx.accounts.vault.id,
        market_id,
        size_delta: 0,
        price: fill_price,
    });
    Ok(())
}
