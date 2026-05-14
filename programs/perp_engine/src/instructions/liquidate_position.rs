use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::{BadDebt, LiquidationDistributed, PositionClosed};
use crate::instructions::cpi_util::invoke_vault_internal_transfer_raw;
use crate::state::*;

// ============================================================
//                    LIQUIDATE POSITION (operator-only)
// ============================================================
// Solidity: PerpEngine.sol liquidatePosition + _distributeLiquidationRewards
// (lines 1139, 1543-1568).
//
// v0.3 wiring #1: keeper reward + insurance routing.
//   effectiveMargin <= 0 (BAD DEBT):
//     keeperReward = liquidatedNotional * 5 / BPS  (0.05%)
//     vault.internalTransfer(insurance_fund, keeper, keeperReward)  [Sol:1553]
//   effectiveMargin > 0 (SOLVENT):
//     keeperReward = min(remaining/2, liquidatedNotional * 500 / BPS)
//     insurancePayout = remaining - keeperReward
//     vault.internalTransfer(engine_pool, keeper, keeperReward)  [Sol:1562]
//     vault.internalTransfer(engine_pool, insurance_fund, insurancePayout)  [Sol:1564]
//
// VAULT ACCOUNTS via REMAINING_ACCOUNTS (in this order):
//   0. authority (engine_authority PDA)
//   1. perp_vault_program
//   2. vault_config
//   3. vault_operator_account
//   4. keeper_balance (mut)
//   5. engine_pool_balance (mut)
//   6. insurance_fund_balance (mut)
//
// Empty remaining_accounts (or len < 7) => CPI skipped (legacy v0.2).

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
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

pub(crate) fn handler(ctx: Context<LiquidatePosition>) -> Result<()> {
    let cfg = &ctx.accounts.engine_config;
    require!(!cfg.paused, EngineError::PausedError);

    let market = &mut ctx.accounts.market;
    require!(market.mark_price > 0, EngineError::InvalidPrice);

    let position = &mut ctx.accounts.position;
    require!(position.size != 0, EngineError::NoPosition);

    let mark = market.mark_price as i128;
    let size = position.size as i128;
    let entry = position.entry_price as i128;
    let abs_size = size.unsigned_abs();

    let pnl_per_unit: i128 = if size > 0 {
        mark - entry
    } else {
        entry - mark
    };
    let unrealized_pnl_usdc = pnl_per_unit
        .checked_mul(abs_size as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;

    let equity_signed: i128 = (position.margin as i128)
        .checked_add(unrealized_pnl_usdc)
        .ok_or(EngineError::MathOverflow)?;

    let notional_u128 = (market.mark_price as u128)
        .checked_mul(abs_size)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as u128;

    let maintenance_required_u128 = notional_u128
        .checked_mul(market.maintenance_margin_bps as u128)
        .ok_or(EngineError::MathOverflow)?
        / BPS as u128;

    let liquidatable = if equity_signed < 0 {
        true
    } else {
        (equity_signed as u128) < maintenance_required_u128
    };
    require!(liquidatable, EngineError::PositionNotLiquidatable);

    let closed_size = position.size;
    let abs_closed = closed_size.unsigned_abs();
    let released_margin = position.margin;

    let realized_pnl_i128 = pnl_per_unit
        .checked_mul(abs_closed as i128)
        .ok_or(EngineError::MathOverflow)?
        / SIZE_PRECISION as i128;
    let realized_pnl: i64 = i64::try_from(realized_pnl_i128).map_err(|_| EngineError::MathOverflow)?;

    if closed_size > 0 {
        market.open_interest_long = market.open_interest_long.saturating_sub(abs_closed);
    } else {
        market.open_interest_short = market.open_interest_short.saturating_sub(abs_closed);
    }

    let trader = position.trader;
    let market_id = market.market_id;
    let mark_price = market.mark_price;

    position.size = 0;
    position.entry_price = 0;
    position.margin = 0;
    let clock = Clock::get()?;
    position.last_updated = clock.unix_timestamp;

    // ---- v0.3 wiring #1: _distributeLiquidationRewards ----
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[EngineConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    let liquidated_notional_u128 = notional_u128;

    let effective_margin: i128 = (released_margin as i128)
        .checked_add(realized_pnl as i128)
        .ok_or(EngineError::MathOverflow)?;

    let mut keeper_reward: u64 = 0;
    let mut insurance_payout: u64 = 0;
    let mut bad_debt: u64 = 0;
    let mut keeper_pubkey: Pubkey = Pubkey::default();

    let has_vault_accounts = ctx.remaining_accounts.len() >= 7;

    if effective_margin <= 0 {
        let bd = (-effective_margin) as u128;
        bad_debt = u64::try_from(bd).map_err(|_| EngineError::MathOverflow)?;

        let kr_u128 = liquidated_notional_u128
            .checked_mul(KEEPER_REWARD_BAD_DEBT_BPS as u128)
            .ok_or(EngineError::MathOverflow)?
            / BPS as u128;
        keeper_reward = u64::try_from(kr_u128).map_err(|_| EngineError::MathOverflow)?;

        if has_vault_accounts && keeper_reward > 0 {
            let authority = &ctx.remaining_accounts[0];
            let vault_program = &ctx.remaining_accounts[1];
            let vault_config = &ctx.remaining_accounts[2];
            let vault_operator = &ctx.remaining_accounts[3];
            let keeper_balance = &ctx.remaining_accounts[4];
            let _engine_pool_balance = &ctx.remaining_accounts[5];
            let insurance_fund_balance = &ctx.remaining_accounts[6];

            require!(
                vault_program.key() == cfg.perp_vault,
                EngineError::InvalidParam
            );
            keeper_pubkey = keeper_balance.key();

            invoke_vault_internal_transfer_raw(
                vault_program,
                vault_config,
                vault_operator,
                insurance_fund_balance,
                keeper_balance,
                authority,
                keeper_reward,
                auth_seeds,
            )?;
        }

        emit!(BadDebt {
            market_id,
            trader,
            amount: bad_debt,
            via_liquidation: true,
        });
    } else {
        let remaining = effective_margin as u128;
        let max_reward_u128 = liquidated_notional_u128
            .checked_mul(KEEPER_REWARD_CAP_BPS as u128)
            .ok_or(EngineError::MathOverflow)?
            / BPS as u128;
        let half = remaining / 2;
        let kr_u128 = if half > max_reward_u128 { max_reward_u128 } else { half };
        keeper_reward = u64::try_from(kr_u128).map_err(|_| EngineError::MathOverflow)?;
        let payout_u128 = remaining
            .checked_sub(kr_u128)
            .ok_or(EngineError::MathOverflow)?;
        insurance_payout = u64::try_from(payout_u128).map_err(|_| EngineError::MathOverflow)?;

        if has_vault_accounts {
            let authority = &ctx.remaining_accounts[0];
            let vault_program = &ctx.remaining_accounts[1];
            let vault_config = &ctx.remaining_accounts[2];
            let vault_operator = &ctx.remaining_accounts[3];
            let keeper_balance = &ctx.remaining_accounts[4];
            let engine_pool_balance = &ctx.remaining_accounts[5];
            let insurance_fund_balance = &ctx.remaining_accounts[6];

            require!(
                vault_program.key() == cfg.perp_vault,
                EngineError::InvalidParam
            );
            keeper_pubkey = keeper_balance.key();

            if keeper_reward > 0 {
                invoke_vault_internal_transfer_raw(
                    vault_program,
                    vault_config,
                    vault_operator,
                    engine_pool_balance,
                    keeper_balance,
                    authority,
                    keeper_reward,
                    auth_seeds,
                )?;
            }
            if insurance_payout > 0 {
                invoke_vault_internal_transfer_raw(
                    vault_program,
                    vault_config,
                    vault_operator,
                    engine_pool_balance,
                    insurance_fund_balance,
                    authority,
                    insurance_payout,
                    auth_seeds,
                )?;
            }
        }
    }

    emit!(PositionClosed {
        market_id,
        trader,
        closed_size,
        exit_price: mark_price,
        realized_pnl,
    });

    emit!(LiquidationDistributed {
        market_id,
        trader,
        keeper: keeper_pubkey,
        keeper_reward,
        insurance_payout,
        bad_debt,
    });

    Ok(())
}
