use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::PositionClosed;
use crate::state::*;

// ============================================================
//                    CLOSE POSITION
// ============================================================
// Closes the entire position at fill_price. Realizes PnL.
// Operator-only (caller is the orchestrator: darkpool, intent_engine, or a
// user-facing instruction wrapped behind an operator pubkey).

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    #[account(
        mut,
        seeds = [Market::SEED_PREFIX, &market.market_id],
        bump = market.bump,
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

pub(crate) fn handler(ctx: Context<ClosePosition>, fill_price: u64) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);
    require!(fill_price > 0, EngineError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    require!(position.size != 0, EngineError::NoPosition);

    let closed_size = position.size;
    let abs_closed = closed_size.unsigned_abs();

    // PnL realization
    let pnl_per_unit: i128 = if closed_size > 0 {
        (fill_price as i128) - (position.entry_price as i128)
    } else {
        (position.entry_price as i128) - (fill_price as i128)
    };
    let pnl_u128 = pnl_per_unit
        .checked_mul(abs_closed as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;
    let realized_pnl: i64 = i64::try_from(pnl_u128).map_err(|_| EngineError::MathOverflow)?;

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

    // ---- CPI STUB: settle realized PnL via perp_vault.internal_transfer ----
    // If realized_pnl > 0: vault.internal_transfer(insurance/counterparty, trader, pnl).
    // If realized_pnl < 0: vault.internal_transfer(trader, insurance, -pnl).
    // Wire in v0.2.X.

    emit!(PositionClosed {
        market_id: market.market_id,
        trader: position.trader,
        closed_size,
        exit_price: fill_price,
        realized_pnl,
    });

    Ok(())
}
