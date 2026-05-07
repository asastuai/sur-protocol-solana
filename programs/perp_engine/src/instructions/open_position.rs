use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{PositionModified, PositionOpened};
use crate::state::*;

// ============================================================
//                    OPEN POSITION (operator-only)
// ============================================================
// v0.2 minimal: operator (darkpool, intent_engine, etc.) opens a position
// for a trader. Validates margin, max_position_size, market active.
//
// PnL settlement when modifying an existing position uses current market
// mark_price (same as Solidity for v0.2 — funding accrual + impact-weighted
// entry land in v0.3).
//
// Margin movement (debit trader's vault deposit balance, credit engine
// margin pool) is documented as a CPI stub — wire when we add the
// margin-account abstraction in v0.2.X.

#[derive(Accounts)]
pub struct OpenPosition<'info> {
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
        init_if_needed,
        payer = operator,
        space = Position::SIZE,
        seeds = [Position::SEED_PREFIX, &market.market_id, trader.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: trader is identity only — not signer; operator is the authority for opens.
    pub trader: UncheckedAccount<'info>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ EngineError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

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

    // Initialize position PDA fields on first touch.
    if position.trader == Pubkey::default() {
        position.trader = ctx.accounts.trader.key();
        position.market_id = market.market_id;
        position.bump = ctx.bumps.position;
    }

    let old_size = position.size;
    let new_size = old_size
        .checked_add(size_delta)
        .ok_or(EngineError::MathOverflow)?;

    // Max position size check (absolute).
    let abs_new = new_size.unsigned_abs();
    require!(
        abs_new <= market.max_position_size,
        EngineError::MaxPositionExceeded
    );

    // Compute realized PnL when reducing/flipping.
    let realized_pnl: i64 = if old_size != 0 && (old_size.signum() != new_size.signum() || abs_new < old_size.unsigned_abs()) {
        // Reducing or flipping: realize PnL on the closed portion.
        let closed_size = if old_size.signum() != new_size.signum() {
            old_size // entire old position closed when flipping
        } else {
            // Same side, smaller magnitude: closed = old - new (signed)
            old_size - new_size
        };
        let closed_abs = closed_size.unsigned_abs();
        let pnl_per_unit = if closed_size > 0 {
            // Long closing: pnl = (fill - entry) * size
            (fill_price as i128) - (position.entry_price as i128)
        } else {
            // Short closing: pnl = (entry - fill) * size
            (position.entry_price as i128) - (fill_price as i128)
        };
        // pnl in USDC = pnl_per_unit * closed_abs / SIZE_PRECISION
        let pnl = pnl_per_unit
            .checked_mul(closed_abs as i128)
            .ok_or(EngineError::MathOverflow)?
            / SIZE_PRECISION as i128;
        i64::try_from(pnl).map_err(|_| EngineError::MathOverflow)?
    } else {
        0
    };

    // Compute new entry price (weighted avg when increasing same-side, fresh when opening/flipping).
    let new_entry_price = if old_size == 0 || old_size.signum() != new_size.signum() {
        fill_price
    } else if abs_new > old_size.unsigned_abs() {
        // Increasing same-side: weighted average
        let added = (abs_new - old_size.unsigned_abs()) as u128;
        let kept = old_size.unsigned_abs() as u128;
        let avg = (kept * position.entry_price as u128 + added * fill_price as u128)
            / (abs_new as u128);
        u64::try_from(avg).map_err(|_| EngineError::MathOverflow)?
    } else {
        position.entry_price // reducing same-side, entry unchanged
    };

    // Update OI (open interest).
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

    // Compute required initial margin for the new position size.
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

    // ---- CPI STUB: margin movement via perp_vault.internal_transfer ----
    // In Solidity, engine acts as operator on PerpVault and locks margin
    // from the trader's deposit balance into a margin pool.
    // Wire in v0.2.X. For now, position.margin field reflects "would-be locked".

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
