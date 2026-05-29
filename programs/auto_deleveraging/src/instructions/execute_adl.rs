use anchor_lang::prelude::*;

use crate::errors::ADLError;
use crate::events::{ADLExecuted, ADLTriggered};
use crate::instructions::cpi_util::invoke_engine_open_position;
use crate::state::*;

// ============================================================
//                    EXECUTE ADL (operator-only)
// ============================================================
// Solidity: AutoDeleveraging.sol:130-182 — executeADL(marketId, trader,
// reduceSize, markPrice, badDebtAmount).
//   - Verifies adl_enabled, cooldown, insurance fund < threshold,
//     bad_debt >= threshold, position exists + profitable
//   - Closes opposite-sign portion via engine.openPosition at mark_price
//     [Sol:174 — engine.openPosition(marketId, trader, sizeDelta, markPrice)]
//   - Updates last_adl_time, total_adl_events, total_bad_debt_covered
//
// v0.3 wiring #2: real CPI to perp_engine.open_position. Manual
// invoke_signed pattern (mirrors order_settlement / liquidator).
//
// Operator-supplied args (until on-chain views land):
// 1) `fund_balance` and `position_size` are operator-passed args.
// 2) Profitable check (getUnrealizedPnl > 0, Sol:159-160) deferred to
//    operator-side off-chain; on-chain we trust the bad_debt_amount the
//    operator supplied (gated by the cooldown + threshold caps + caller is
//    a registered ADL operator).
//
// Note re Solidity vs port: Solidity reverts via PositionNotProfitable on
// pnl <= 0 (Sol:160). We don't replicate that on-chain because reading the
// engine's unrealized pnl from another program requires either a view CPI
// or borrow + manual deserialize of the Position PDA — out of scope for
// v0.3 #2 (preserves v0.2.3 behavior). Operators are trusted to not call
// ADL on a losing position; the on-chain caps prevent the worst abuse.

#[derive(Accounts)]
pub struct ExecuteADL<'info> {
    #[account(
        mut,
        seeds = [ADLConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ADLConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ ADLError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(mut)]
    pub operator: Signer<'info>,

    /// CHECK: adl_authority PDA — signs the engine CPI.
    /// Pre-registered as engine operator.
    /// Mut so it can fund init_if_needed paths inside engine.
    #[account(
        mut,
        seeds = [ADLConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---- engine accounts ----
    /// CHECK: perp_engine program id; constraint vs config.perp_engine.
    #[account(constraint = perp_engine_program.key() == config.perp_engine @ ADLError::ZeroAddress)]
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: engine_config PDA.
    pub engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: target trader's Position PDA (mut; engine settles PnL into it).
    #[account(mut)]
    pub engine_position: UncheckedAccount<'info>,
    /// CHECK: trader pubkey identity reference.
    pub trader_account: UncheckedAccount<'info>,
    /// CHECK: engine Operator PDA for `authority`.
    pub engine_operator_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteADL<'info>>,
    market_id: [u8; 32],
    trader: Pubkey,
    position_size: i64,
    reduce_size: u64,
    mark_price: u64,
    bad_debt_amount: u64,
    fund_balance: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(!cfg.paused, ADLError::PausedError);
    require!(cfg.adl_enabled, ADLError::ADLDisabled);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Cooldown (Sol:140-142)
    require!(
        now >= cfg.last_adl_time.saturating_add(cfg.adl_cooldown_secs),
        ADLError::CooldownActive
    );

    // Insurance fund must be insufficient (Sol:145-148)
    require!(
        fund_balance < cfg.min_bad_debt_threshold,
        ADLError::InsuranceFundSufficient
    );

    // Bad debt must exceed threshold (Sol:151-153)
    require!(
        bad_debt_amount >= cfg.min_bad_debt_threshold,
        ADLError::BadDebtBelowThreshold
    );

    require!(position_size != 0, ADLError::NoPosition);

    // Sanity: trader pubkey must match the operator-supplied trader arg.
    require!(
        ctx.accounts.trader_account.key() == trader,
        ADLError::ZeroAddress
    );

    // Compute size delta (close opposite portion of profitable position) (Sol:163-171)
    let abs_size = position_size.unsigned_abs();
    let actual_reduce = if reduce_size > abs_size { abs_size } else { reduce_size };
    let actual_reduce_i64: i64 = i64::try_from(actual_reduce).map_err(|_| ADLError::MathOverflow)?;
    let size_delta: i64 = if position_size > 0 {
        -actual_reduce_i64
    } else {
        actual_reduce_i64
    };

    // ---- v0.3 wiring #2: engine.open_position(market, trader, delta, mark) (Sol:174) ----
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[
        ADLConfig::AUTHORITY_SEED,
        std::slice::from_ref(&auth_bump),
    ];

    invoke_engine_open_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.engine_position,
        &ctx.accounts.trader_account,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        ctx.remaining_accounts,
        size_delta,
        mark_price,
        auth_seeds,
    )?;

    // ---- update state AFTER successful CPI (Sol:176-178) ----
    cfg.last_adl_time = now;
    cfg.total_adl_events = cfg
        .total_adl_events
        .checked_add(1)
        .ok_or(ADLError::MathOverflow)?;
    cfg.total_bad_debt_covered = cfg
        .total_bad_debt_covered
        .checked_add(bad_debt_amount)
        .ok_or(ADLError::MathOverflow)?;

    emit!(ADLExecuted {
        market_id,
        deleveraged_trader: trader,
        reduced_size: size_delta,
        close_price: mark_price,
        bad_debt_covered: bad_debt_amount,
        timestamp: now,
    });
    emit!(ADLTriggered {
        market_id,
        total_bad_debt: bad_debt_amount,
        insurance_fund_balance: fund_balance,
        timestamp: now,
    });

    Ok(())
}
