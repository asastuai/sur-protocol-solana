use anchor_lang::prelude::*;

use crate::errors::InsuranceFundError;
use crate::events::BadDebtRecorded;
use crate::state::*;

// ============================================================
//                    RECORD BAD DEBT (operator-only)
// ============================================================
// Solidity: recordBadDebt(marketId, trader, amount). Operator-gated.
// Aggregates totals + per-market tracking.
//
// v0.2.X simplification: M-15 dedupe (debtHash) NOT ported. Trusting the
// operator (engine via liquidation flow) to call once per liquidation. To
// add: hash (market_id, trader, amount, slot) into a per-debt PDA created
// with init.

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct RecordBadDebt<'info> {
    #[account(
        mut,
        seeds = [InsuranceFundConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, InsuranceFundConfig>,

    #[account(
        init_if_needed,
        payer = operator,
        space = MarketBadDebt::SIZE,
        seeds = [MarketBadDebt::SEED_PREFIX, &market_id],
        bump,
    )]
    pub market_bad_debt: Account<'info, MarketBadDebt>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ InsuranceFundError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(
    ctx: Context<RecordBadDebt>,
    market_id: [u8; 32],
    trader: Pubkey,
    amount: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(!cfg.paused, InsuranceFundError::PausedError);
    if amount == 0 {
        return Ok(());
    }

    let mb = &mut ctx.accounts.market_bad_debt;
    if mb.market_id == [0u8; 32] {
        mb.market_id = market_id;
        mb.bump = ctx.bumps.market_bad_debt;
    }
    mb.cumulative_bad_debt = mb
        .cumulative_bad_debt
        .checked_add(amount)
        .ok_or(InsuranceFundError::MathOverflow)?;

    cfg.total_bad_debt = cfg
        .total_bad_debt
        .checked_add(amount)
        .ok_or(InsuranceFundError::MathOverflow)?;
    cfg.total_liquidations = cfg
        .total_liquidations
        .checked_add(1)
        .ok_or(InsuranceFundError::MathOverflow)?;

    emit!(BadDebtRecorded {
        market_id,
        trader,
        amount,
        total_bad_debt: cfg.total_bad_debt,
    });
    Ok(())
}
