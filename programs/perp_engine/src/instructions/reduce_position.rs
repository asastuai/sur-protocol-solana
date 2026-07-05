use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{BadDebt, PositionModified};
use crate::instructions::cpi_util::{
    assert_canonical_balance, assert_engine_authority, invoke_vault_internal_transfer_raw,
};
use crate::state::*;

// ============================================================
//                  REDUCE POSITION (operator-only)
// ============================================================
// The settling path for a VOLUNTARY reduce or flip (order_settlement, a2a,
// trading_vault). It returns the margin freed on the closed portion plus the
// realized PnL to the trader via perp_vault.internal_transfer — the way
// close_position settles, but on the closed delta rather than the whole margin.
//
// WHY a separate instruction: open_position only moves value INBOUND (margin
// lock); a reduce there leaves additional_margin == 0 so it returns nothing,
// stranding the freed margin in engine_pool (the confirmed High). open_position
// is deliberately left as-is because ADL reduces through it and relies on the
// no-settle behavior; ADL gets its own pool-aware settlement separately.
//
// Two cases:
//   PURE REDUCE (same sign, smaller abs):
//     released = old_margin - required_margin (the freed delta); the surviving
//     position keeps required_margin. Pay (released +/- realized_pnl) out.
//     A realized loss exceeding the freed margin is rejected
//     (InsufficientMargin) — the survivor-absorbs / partial-bad-debt model is a
//     follow-up; those positions go through liquidation/close.
//   FLIP (sign change): the whole old side closes and a new opposite side opens.
//     released = old_margin (whole); settle the old side three-way (winner /
//     loser-partial / bad-debt, exactly like close_position), and lock the FULL
//     new_required_margin for the opened side. Net flow can be either direction.
//
// A full close (new_size == 0) must use close_position.
//
// VAULT ACCOUNTS via REMAINING_ACCOUNTS (same order as open/close_position):
//   0. authority (engine_authority PDA)
//   1. perp_vault_program
//   2. vault_config
//   3. vault_operator_account
//   4. trader_balance (mut)
//   5. engine_pool_balance (mut)
// MANDATORY whenever value moves — a missing-accounts reduce/flip REVERTS, it
// never silently skips the settlement (that silent skip is the bug).

#[derive(Accounts)]
pub struct ReducePosition<'info> {
    #[account(seeds = [EngineConfig::SEED], bump = engine_config.bump)]
    pub engine_config: Box<Account<'info, EngineConfig>>,

    #[account(
        mut,
        seeds = [Market::SEED_PREFIX, &market.market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, &market.market_id, position.trader.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ EngineError::NotOperator,
    )]
    pub operator_account: Box<Account<'info, Operator>>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(
    ctx: Context<ReducePosition>,
    size_delta: i64,
    fill_price: u64,
) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);
    require!(size_delta != 0, EngineError::ZeroAmount);
    require!(fill_price > 0, EngineError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    require!(position.size != 0, EngineError::NoPosition);

    let old_size = position.size;
    let old_margin = position.margin;
    let old_entry = position.entry_price;
    let new_size = old_size
        .checked_add(size_delta)
        .ok_or(EngineError::MathOverflow)?;
    require!(new_size != 0, EngineError::NotAReduce); // full close => close_position

    let is_flip = old_size.signum() != new_size.signum();
    if !is_flip {
        // Same-sign: must strictly shrink (an increase is open_position's job).
        require!(
            new_size.unsigned_abs() < old_size.unsigned_abs(),
            EngineError::NotAReduce
        );
    } else {
        // A flip opens fresh exposure on the new side -> market must be active.
        require!(market.active, EngineError::MarketNotActive);
    }

    // New side entry: flip resets to the fill; a pure reduce keeps the old entry.
    let new_entry_price = if is_flip { fill_price } else { old_entry };
    let abs_new = new_size.unsigned_abs();
    require!(abs_new <= market.max_position_size, EngineError::MaxPositionExceeded);

    // Required margin for the surviving / newly-opened side.
    let notional_u128 = (abs_new as u128)
        .checked_mul(new_entry_price as u128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as u128;
    let required_margin_u128 = notional_u128
        .checked_mul(market.initial_margin_bps as u128)
        .ok_or(EngineError::MathOverflow)?
        / BPS as u128;
    let required_margin: u64 =
        u64::try_from(required_margin_u128).map_err(|_| EngineError::MathOverflow)?;

    // Closed portion (always on the OLD side) and its realized PnL.
    let closed_abs = if is_flip {
        old_size.unsigned_abs()
    } else {
        (old_size - new_size).unsigned_abs()
    };
    let pnl_per_unit: i128 = if old_size > 0 {
        (fill_price as i128) - (old_entry as i128)
    } else {
        (old_entry as i128) - (fill_price as i128)
    };
    let pnl_u128 = pnl_per_unit
        .checked_mul(closed_abs as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;
    let realized_pnl: i64 = i64::try_from(pnl_u128).map_err(|_| EngineError::MathOverflow)?;

    // Margin released by closing the closed portion:
    //   flip   -> the whole old margin (old side fully closed)
    //   reduce -> the freed delta (old_margin - required_margin); the residual
    //             required_margin stays locked for the surviving side.
    let released = if is_flip {
        old_margin
    } else {
        old_margin.saturating_sub(required_margin)
    };
    // New margin to lock (flip only — the surviving reduce side keeps its own).
    let lock_new = if is_flip { required_margin } else { 0 };

    // Three-way settle on the released amount (mirror close_position).
    let mut bad_debt: u64 = 0;
    let payout_out: u64 = if realized_pnl >= 0 {
        let pnl_u64 = u64::try_from(realized_pnl).map_err(|_| EngineError::MathOverflow)?;
        released
            .checked_add(pnl_u64)
            .ok_or(EngineError::MathOverflow)?
    } else {
        let loss_i128 = -(realized_pnl as i128);
        let loss_u64 = u64::try_from(loss_i128).map_err(|_| EngineError::MathOverflow)?;
        if loss_u64 <= released {
            released - loss_u64
        } else if is_flip {
            // Whole old side closed -> clean bad debt, like close_position.
            bad_debt = loss_u64 - released;
            0
        } else {
            // Pure reduce with loss > freed margin: survivor-absorbs model
            // deferred. Such positions go through liquidation/close.
            return Err(EngineError::InsufficientMargin.into());
        }
    };

    // Open interest: drop the closed portion from the old side; a flip then adds
    // the newly-opened side.
    if old_size > 0 {
        market.open_interest_long = market.open_interest_long.saturating_sub(closed_abs);
    } else {
        market.open_interest_short = market.open_interest_short.saturating_sub(closed_abs);
    }
    if is_flip {
        if new_size > 0 {
            market.open_interest_long = market.open_interest_long.saturating_add(abs_new);
        } else {
            market.open_interest_short = market.open_interest_short.saturating_add(abs_new);
        }
    }

    // ── CEI: commit ALL state BEFORE the outbound settlement CPIs ───────────
    let trader = position.trader;
    let market_id = market.market_id;
    position.size = new_size;
    position.entry_price = new_entry_price;
    position.margin = required_margin;
    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    // ── Settlement. Accounts MANDATORY whenever value moves. ────────────────
    let owes = lock_new > 0 || payout_out > 0 || released > 0 || realized_pnl != 0;
    if owes {
        require!(ctx.remaining_accounts.len() >= 6, EngineError::InvalidParam);
        let auth_bump = cfg.authority_bump;
        let auth_seeds: &[&[u8]] =
            &[EngineConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

        let authority = &ctx.remaining_accounts[0];
        let vault_program = &ctx.remaining_accounts[1];
        let vault_config = &ctx.remaining_accounts[2];
        let vault_operator = &ctx.remaining_accounts[3];
        let trader_balance = &ctx.remaining_accounts[4];
        let engine_pool_balance = &ctx.remaining_accounts[5];

        require!(vault_program.key() == cfg.perp_vault, EngineError::InvalidParam);
        // Gate 0a binding (same as close_position payout): canonical pool + dest.
        require!(cfg.engine_pool != Pubkey::default(), EngineError::InvalidParam);
        require!(
            engine_pool_balance.key() == cfg.engine_pool,
            EngineError::InvalidParam
        );
        assert_canonical_balance(trader_balance, &trader, &cfg.perp_vault)?;
        assert_engine_authority(authority, cfg.authority_bump)?;

        // Flip: lock the new side first (funds the pool) then pay the old side
        // out. Both legs are atomic in one tx; either failing reverts cleanly.
        if lock_new > 0 {
            invoke_vault_internal_transfer_raw(
                vault_program,
                vault_config,
                vault_operator,
                trader_balance,      // from: trader
                engine_pool_balance, // to: pool
                authority,
                lock_new,
                auth_seeds,
            )?;
        }
        if payout_out > 0 {
            invoke_vault_internal_transfer_raw(
                vault_program,
                vault_config,
                vault_operator,
                engine_pool_balance, // from: pool
                trader_balance,      // to: trader
                authority,
                payout_out,
                auth_seeds,
            )?;
        }
    }

    if bad_debt > 0 {
        emit!(BadDebt {
            market_id,
            trader,
            amount: bad_debt,
            via_liquidation: false,
        });
    }
    emit!(PositionModified {
        market_id,
        trader,
        old_size,
        new_size,
        new_entry_price,
        new_margin: required_margin,
        realized_pnl,
    });

    Ok(())
}
