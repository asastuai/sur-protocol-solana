use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::MarkPriceUpdated;
use crate::state::*;

// ============================================================
//                    UPDATE MARK PRICE
// ============================================================
// Called by oracle_router to push fresh prices into the engine. Operator
// authorization here is the oracle_router program's `oracle_router_signer`
// — we restrict via a simple operator PDA check (oracle_router becomes
// an operator on engine after init).

#[derive(Accounts)]
pub struct UpdateMarkPrice<'info> {
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
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ EngineError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(
    ctx: Context<UpdateMarkPrice>,
    new_mark_price: u64,
    new_index_price: u64,
) -> Result<()> {
    require!(new_mark_price > 0, EngineError::InvalidPrice);

    let m = &mut ctx.accounts.market;
    let old = m.mark_price;
    m.mark_price = new_mark_price;
    m.index_price = if new_index_price > 0 { new_index_price } else { new_mark_price };
    let clock = Clock::get()?;
    m.last_price_update = clock.unix_timestamp;

    emit!(MarkPriceUpdated {
        market_id: m.market_id,
        old_price: old,
        new_price: new_mark_price,
        timestamp: m.last_price_update,
    });

    Ok(())
}
