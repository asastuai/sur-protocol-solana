use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{PositionModified, PositionOpened};
use crate::instructions::cpi_util::invoke_vault_internal_transfer_raw;
use crate::state::*;

// ============================================================
//                    OPEN POSITION (operator-only)
// ============================================================
// Solidity: PerpEngine.sol _openNewPosition / _increasePosition.
// Operator (darkpool, intent_engine, order_settlement) opens a position
// for a trader. Validates margin, max_position_size, market active.
//
// PnL realization on reduce/flip uses fill_price (same as Solidity for v0.2).
//
// v0.3 wiring #1: margin lock via perp_vault.internal_transfer.
// Mirrors Solidity isolated mode (PerpEngine.sol:809):
//   vault.internalTransfer(trader, address(this), requiredMargin)
// Trader vault deposit balance debited; engine_authority pool credited.
//
// VAULT ACCOUNTS PASSED VIA REMAINING_ACCOUNTS (in this exact order):
//   0. authority           (engine_authority PDA UncheckedAccount)
//   1. perp_vault_program  (UncheckedAccount)
//   2. vault_config        (UncheckedAccount)
//   3. vault_operator      (UncheckedAccount, derived from authority)
//   4. trader_balance      (mut UncheckedAccount, seeded by trader)
//   5. engine_pool_balance (mut UncheckedAccount, seeded by authority)
//
// If remaining_accounts is empty, the CPI is skipped (legacy v0.2 behavior).
// This preserves backward compat for existing CPI callers (darkpool,
// order_settlement, trading_vault) that have NOT yet been migrated. Those
// callers will be updated in subsequent v0.3 wiring patches.

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
    )]
    pub engine_config: Box<Account<'info, EngineConfig>>,

    #[account(
        mut,
        seeds = [Market::SEED_PREFIX, &market.market_id],
        bump = market.bump,
        constraint = market.active @ EngineError::MarketNotActive,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init_if_needed,
        payer = operator,
        space = Position::SIZE,
        seeds = [Position::SEED_PREFIX, &market.market_id, trader.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// CHECK: trader is identity only - not signer; operator is the authority for opens.
    pub trader: UncheckedAccount<'info>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ EngineError::NotOperator,
    )]
    pub operator_account: Box<Account<'info, Operator>>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(
    ctx: Context<OpenPosition>,
    size_delta: i64,
    fill_price: u64,
) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);
    require!(size_delta != 0, EngineError::ZeroAmount);
    require!(fill_price > 0, EngineError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    if position.trader == Pubkey::default() {
        position.trader = ctx.accounts.trader.key();
        position.market_id = market.market_id;
        position.bump = ctx.bumps.position;
    }

    let old_size = position.size;
    let old_margin = position.margin;
    let new_size = old_size
        .checked_add(size_delta)
        .ok_or(EngineError::MathOverflow)?;

    let abs_new = new_size.unsigned_abs();
    require!(
        abs_new <= market.max_position_size,
        EngineError::MaxPositionExceeded
    );

    let realized_pnl: i64 = if old_size != 0 && (old_size.signum() != new_size.signum() || abs_new < old_size.unsigned_abs()) {
        let closed_size = if old_size.signum() != new_size.signum() {
            old_size
        } else {
            old_size - new_size
        };
        let closed_abs = closed_size.unsigned_abs();
        let pnl_per_unit = if closed_size > 0 {
            (fill_price as i128) - (position.entry_price as i128)
        } else {
            (position.entry_price as i128) - (fill_price as i128)
        };
        let pnl = pnl_per_unit
            .checked_mul(closed_abs as i128)
            .ok_or(EngineError::MathOverflow)?
            / SIZE_PRECISION as i128;
        i64::try_from(pnl).map_err(|_| EngineError::MathOverflow)?
    } else {
        0
    };

    let new_entry_price = if old_size == 0 || old_size.signum() != new_size.signum() {
        fill_price
    } else if abs_new > old_size.unsigned_abs() {
        let added = (abs_new - old_size.unsigned_abs()) as u128;
        let kept = old_size.unsigned_abs() as u128;
        let avg = (kept * position.entry_price as u128 + added * fill_price as u128)
            / (abs_new as u128);
        u64::try_from(avg).map_err(|_| EngineError::MathOverflow)?
    } else {
        position.entry_price
    };

    let old_long = if old_size > 0 { old_size as u64 } else { 0 };
    let old_short = if old_size < 0 { (-old_size) as u64 } else { 0 };
    let new_long = if new_size > 0 { new_size as u64 } else { 0 };
    let new_short = if new_size < 0 { (-new_size) as u64 } else { 0 };

    market.open_interest_long = market
        .open_interest_long
        .saturating_sub(old_long)
        .saturating_add(new_long);
    market.open_interest_short = market
        .open_interest_short
        .saturating_sub(old_short)
        .saturating_add(new_short);

    let notional_u128 = (abs_new as u128)
        .checked_mul(new_entry_price as u128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as u128;
    let required_margin_u128 = notional_u128
        .checked_mul(market.initial_margin_bps as u128)
        .ok_or(EngineError::MathOverflow)?
        / BPS as u128;
    let required_margin: u64 = u64::try_from(required_margin_u128)
        .map_err(|_| EngineError::MathOverflow)?;

    // ---- v0.3 wiring #1: margin lock via perp_vault.internal_transfer ----
    // Solidity:809 - vault.internalTransfer(trader, address(this), requiredMargin)
    // Vault accounts come via remaining_accounts (file header for order).
    // Empty remaining_accounts => skip CPI (legacy v0.2 behavior, used by
    // existing CPI callers until they are migrated).
    let additional_margin = required_margin.saturating_sub(old_margin);

    if additional_margin > 0 {
        // H-1 fix: margin lock is MANDATORY when margin is required. Never skip it
        // because a caller omitted accounts (that path opened phantom-collateral
        // positions with no USDC locked → protocol insolvency).
        require!(
            ctx.remaining_accounts.len() >= 6,
            EngineError::InvalidParam
        );
        let auth_bump = cfg.authority_bump;
        let auth_seeds: &[&[u8]] = &[EngineConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

        let authority = &ctx.remaining_accounts[0];
        let vault_program = &ctx.remaining_accounts[1];
        let vault_config = &ctx.remaining_accounts[2];
        let vault_operator = &ctx.remaining_accounts[3];
        let trader_balance = &ctx.remaining_accounts[4];
        let engine_pool_balance = &ctx.remaining_accounts[5];

        require!(
            vault_program.key() == cfg.perp_vault,
            EngineError::InvalidParam
        );
        // Gate 0a binding: pool + trader balance + authority must be canonical.
        require!(cfg.engine_pool != Pubkey::default(), EngineError::InvalidParam);
        require!(engine_pool_balance.key() == cfg.engine_pool, EngineError::InvalidParam);
        crate::instructions::cpi_util::assert_canonical_balance(
            trader_balance,
            &position.trader,
            &cfg.perp_vault,
        )?;
        crate::instructions::cpi_util::assert_engine_authority(authority, cfg.authority_bump)?;

        invoke_vault_internal_transfer_raw(
            vault_program,
            vault_config,
            vault_operator,
            trader_balance,
            engine_pool_balance,
            authority,
            additional_margin,
            auth_seeds,
        )?;
    }

    let clock = Clock::get()?;
    if old_size == 0 {
        position.size = new_size;
        position.entry_price = new_entry_price;
        position.margin = required_margin;
        position.last_updated = clock.unix_timestamp;
        emit!(PositionOpened {
            market_id: market.market_id,
            trader: position.trader,
            size: new_size,
            entry_price: new_entry_price,
            margin: required_margin,
        });
    } else {
        position.size = new_size;
        position.entry_price = new_entry_price;
        position.margin = required_margin;
        position.last_updated = clock.unix_timestamp;
        emit!(PositionModified {
            market_id: market.market_id,
            trader: position.trader,
            old_size,
            new_size,
            new_entry_price,
            new_margin: required_margin,
            realized_pnl,
        });
    }

    Ok(())
}
