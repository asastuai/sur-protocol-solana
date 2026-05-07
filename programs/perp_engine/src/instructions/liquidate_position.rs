use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::PositionClosed;
use crate::state::*;

// ============================================================
//                    LIQUIDATE POSITION (operator-only)
// ============================================================
// Solidity: PerpEngine.liquidatePosition(marketId, trader, keeper)
//   - Verifies is_liquidatable: equity < maintenance margin requirement
//   - Closes position at mark_price (forced fill)
//   - Computes realized PnL on the closed position
//   - Resets position state, decrements OI
//   - Emits PositionClosed (we reuse the same event for liquidation closes;
//     consumers can distinguish by realized_pnl < 0 or by keeper presence in tx logs)
//
// v0.2.1: keeper reward distribution is NOT YET wired (would require CPI to
// perp_vault). The position is closed and PnL computed; keeper reward CPI
// lands in v0.3 when we wire engine→vault for margin lock + PnL settlement.
//
// is_liquidatable formula (from upstream PerpEngine.sol):
//   equity = position.margin + signed_unrealized_pnl
//   notional = mark_price * |size| / SIZE_PRECISION
//   maintenance_required = notional * market.maintenance_margin_bps / BPS
//   liquidatable iff equity < maintenance_required

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    #[account(
        mut,
        seeds = [Market::SEED_PREFIX, &market.market_id],
        bump = market.bump,
        constraint = market.active @ EngineError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, &market.market_id, position.trader.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ EngineError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(ctx: Context<LiquidatePosition>) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);

    let market = &mut ctx.accounts.market;
    require!(market.mark_price > 0, EngineError::InvalidPrice);

    let position = &mut ctx.accounts.position;
    require!(position.size != 0, EngineError::NoPosition);

    // ---- is_liquidatable computation ----
    let mark = market.mark_price as i128;
    let size = position.size as i128;
    let entry = position.entry_price as i128;
    let abs_size = size.unsigned_abs();

    // Unrealized PnL: long = (mark - entry) * size; short = (entry - mark) * |size|
    let pnl_per_unit: i128 = if size > 0 {
        mark - entry
    } else {
        entry - mark
    };
    let unrealized_pnl_usdc = pnl_per_unit
        .checked_mul(abs_size as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;

    // Equity = margin + unrealized_pnl (signed, can be negative)
    let equity_signed: i128 = (position.margin as i128)
        .checked_add(unrealized_pnl_usdc)
        .ok_or(EngineError::MathOverflow)?;

    // Notional at mark = mark * |size| / SIZE_PRECISION
    let notional_u128 = (market.mark_price as u128)
        .checked_mul(abs_size)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as u128;

    // Maintenance required = notional * maintenance_margin_bps / BPS
    let maintenance_required_u128 = notional_u128
        .checked_mul(market.maintenance_margin_bps as u128)
        .ok_or(EngineError::MathOverflow)?
        / BPS as u128;

    // Liquidatable iff equity < maintenance_required.
    // equity_signed can be negative — treat negative as < 0 < maintenance.
    let liquidatable = if equity_signed < 0 {
        true
    } else {
        (equity_signed as u128) < maintenance_required_u128
    };
    require!(liquidatable, EngineError::PositionNotLiquidatable);

    // ---- Close position at mark_price (forced) ----
    let closed_size = position.size;
    let abs_closed = closed_size.unsigned_abs();

    let realized_pnl_i128 = pnl_per_unit
        .checked_mul(abs_closed as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;
    let realized_pnl: i64 = i64::try_from(realized_pnl_i128).map_err(|_| EngineError::MathOverflow)?;

    // Update OI
    if closed_size > 0 {
        market.open_interest_long = market.open_interest_long.saturating_sub(abs_closed);
    } else {
        market.open_interest_short = market.open_interest_short.saturating_sub(abs_closed);
    }

    // Reset position
    position.size = 0;
    position.entry_price = 0;
    position.margin = 0;
    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    // ---- CPI STUB: keeper reward via perp_vault.internal_transfer ----
    // v0.3: pay keeper a fraction of liquidated margin. Wire when engine→vault
    // CPI lands (same manual invoke_signed pattern as darkpool).

    emit!(PositionClosed {
        market_id: market.market_id,
        trader: position.trader,
        closed_size,
        exit_price: market.mark_price,
        realized_pnl,
    });

    Ok(())
}
