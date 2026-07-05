use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{BadDebt, PositionClosed};
use crate::instructions::cpi_util::invoke_vault_internal_transfer_raw;
use crate::state::*;

// ============================================================
//                    CLOSE POSITION (operator-only)
// ============================================================
// Solidity: PerpEngine.sol _closePosition + _settlePnl (lines 949-1009).
//
// v0.3 wiring #1: PnL settlement via perp_vault.internal_transfer.
// Mirrors Solidity _settlePnl:
//   pnl >= 0 (winner):
//     totalReturn = releasedMargin + pnl
//     vault.internalTransfer(engine_pool, trader, totalReturn)  [Sol:991]
//   pnl < 0 (loser, partial):
//     returnAmount = releasedMargin - loss
//     vault.internalTransfer(engine_pool, trader, returnAmount)  [Sol:1001]
//   pnl < -margin (bad debt):
//     trader gets nothing; margin stays in pool; BadDebt event emitted.
//
// VAULT ACCOUNTS via REMAINING_ACCOUNTS (in this order):
//   0. authority (engine_authority PDA)
//   1. perp_vault_program
//   2. vault_config
//   3. vault_operator_account
//   4. trader_balance (mut)
//   5. engine_pool_balance (mut)
//
// Empty remaining_accounts => CPI skipped (legacy v0.2 behavior).

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
    )]
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

pub(crate) fn handler(ctx: Context<ClosePosition>, fill_price: u64) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);
    require!(fill_price > 0, EngineError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    require!(position.size != 0, EngineError::NoPosition);

    let closed_size = position.size;
    let abs_closed = closed_size.unsigned_abs();
    let released_margin = position.margin;

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

    if closed_size > 0 {
        market.open_interest_long = market.open_interest_long.saturating_sub(abs_closed);
    } else {
        market.open_interest_short = market.open_interest_short.saturating_sub(abs_closed);
    }

    let trader = position.trader;
    let market_id = market.market_id;
    position.size = 0;
    position.entry_price = 0;
    position.margin = 0;
    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    // ---- v0.3 wiring #1: PnL settlement via perp_vault.internal_transfer ----
    let has_vault_accounts = ctx.remaining_accounts.len() >= 6;
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[EngineConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    let mut bad_debt_amount: u64 = 0;

    if realized_pnl >= 0 {
        // Winner path (Solidity _settlePnl 974-993).
        let pnl_u64: u64 = u64::try_from(realized_pnl).map_err(|_| EngineError::MathOverflow)?;
        let total_return = released_margin
            .checked_add(pnl_u64)
            .ok_or(EngineError::MathOverflow)?;

        if has_vault_accounts && total_return > 0 {
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
            // Gate 0a binding (N-2 fix): payout pool + trader dest + authority canonical.
            require!(cfg.engine_pool != Pubkey::default(), EngineError::InvalidParam);
            require!(engine_pool_balance.key() == cfg.engine_pool, EngineError::InvalidParam);
            crate::instructions::cpi_util::assert_canonical_balance(
                trader_balance,
                &trader,
                &cfg.perp_vault,
            )?;
            crate::instructions::cpi_util::assert_engine_authority(authority, cfg.authority_bump)?;

            invoke_vault_internal_transfer_raw(
                vault_program,
                vault_config,
                vault_operator,
                engine_pool_balance,
                trader_balance,
                authority,
                total_return,
                auth_seeds,
            )?;
        }
    } else {
        // Loser path (Solidity _settlePnl 995-1009).
        let loss_i128 = -(realized_pnl as i128);
        let loss_u64: u64 = u64::try_from(loss_i128).map_err(|_| EngineError::MathOverflow)?;

        if loss_u64 < released_margin {
            let return_amount = released_margin - loss_u64;
            if has_vault_accounts {
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
                // Gate 0a binding (N-2 fix): payout pool + trader dest + authority canonical.
                require!(cfg.engine_pool != Pubkey::default(), EngineError::InvalidParam);
                require!(engine_pool_balance.key() == cfg.engine_pool, EngineError::InvalidParam);
                crate::instructions::cpi_util::assert_canonical_balance(
                    trader_balance,
                    &trader,
                    &cfg.perp_vault,
                )?;
                crate::instructions::cpi_util::assert_engine_authority(authority, cfg.authority_bump)?;

                invoke_vault_internal_transfer_raw(
                    vault_program,
                    vault_config,
                    vault_operator,
                    engine_pool_balance,
                    trader_balance,
                    authority,
                    return_amount,
                    auth_seeds,
                )?;
            }
        } else {
            // Bad debt: trader gets nothing; margin stays in pool.
            bad_debt_amount = loss_u64 - released_margin;
            emit!(BadDebt {
                market_id,
                trader,
                amount: bad_debt_amount,
                via_liquidation: false,
            });
        }
    }

    emit!(PositionClosed {
        market_id,
        trader,
        closed_size,
        exit_price: fill_price,
        realized_pnl,
    });

    Ok(())
}
