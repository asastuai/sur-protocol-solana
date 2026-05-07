use anchor_lang::prelude::*;

use crate::errors::ADLError;
use crate::events::{ADLExecuted, ADLTriggered};
use crate::state::*;

// ============================================================
//                    EXECUTE ADL (operator-only)
// ============================================================
// Solidity: executeADL(marketId, trader, reduceSize, markPrice, badDebtAmount)
//   - Verifies adl_enabled, cooldown, insurance fund < threshold,
//     bad_debt >= threshold, position exists + profitable
//   - Closes opposite-sign portion via engine.openPosition at mark_price
//   - Updates last_adl_time, total_adl_events, total_bad_debt_covered
//
// v0.2.3 simplifications (documented for v0.3 wire):
// 1) `fund_balance` and `position_size` are operator-passed args. v0.3
//    will read insurance_fund balance + engine position via UncheckedAccount
//    deserialization OR direct CPI to engine view.
// 2) Profitable check (getUnrealizedPnl > 0) deferred to operator-side
//    off-chain; on-chain we trust the operator-supplied bad_debt_amount.
// 3) Actual engine.open_position CPI is STUBBED — same manual invoke_signed
//    pattern as liquidator/darkpool when wiring lands.

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

    pub operator: Signer<'info>,
}

pub(crate) fn handler(
    ctx: Context<ExecuteADL>,
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

    // Cooldown
    require!(
        now >= cfg.last_adl_time + cfg.adl_cooldown_secs,
        ADLError::CooldownActive
    );

    // Insurance fund must be insufficient (operator-passed for v0.2.3)
    require!(
        fund_balance < cfg.min_bad_debt_threshold,
        ADLError::InsuranceFundSufficient
    );

    // Bad debt must exceed threshold
    require!(
        bad_debt_amount >= cfg.min_bad_debt_threshold,
        ADLError::BadDebtBelowThreshold
    );

    require!(position_size != 0, ADLError::NoPosition);

    // Compute size delta (close opposite portion of profitable position)
    let abs_size = position_size.unsigned_abs();
    let actual_reduce = if reduce_size > abs_size { abs_size } else { reduce_size };
    let actual_reduce_i64: i64 = i64::try_from(actual_reduce).map_err(|_| ADLError::MathOverflow)?;
    let size_delta: i64 = if position_size > 0 {
        -actual_reduce_i64
    } else {
        actual_reduce_i64
    };

    // ---- TODO v0.3: CPI to perp_engine.open_position ----
    // Manual invoke_signed pattern same as liquidator/darkpool. Until then
    // we update state-tracking only and emit events.

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
