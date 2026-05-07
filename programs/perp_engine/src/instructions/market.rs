use anchor_lang::prelude::*;

use crate::errors::EngineError;
use crate::events::MarketAdded;
use crate::state::*;

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct AddMarket<'info> {
    #[account(
        seeds = [EngineConfig::SEED],
        bump = engine_config.bump,
        has_one = owner @ EngineError::NotOwner,
    )]
    pub engine_config: Account<'info, EngineConfig>,

    #[account(
        init,
        payer = owner,
        space = Market::SIZE,
        seeds = [Market::SEED_PREFIX, &market_id],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn add_market(
    ctx: Context<AddMarket>,
    market_id: [u8; 32],
    initial_margin_bps: u64,
    maintenance_margin_bps: u64,
    max_position_size: u64,
) -> Result<()> {
    require!(initial_margin_bps > 0, EngineError::InvalidParam);
    require!(maintenance_margin_bps > 0, EngineError::InvalidParam);
    require!(
        maintenance_margin_bps < initial_margin_bps,
        EngineError::InvalidParam
    );
    require!(max_position_size > 0, EngineError::ZeroAmount);

    let m = &mut ctx.accounts.market;
    m.bump = ctx.bumps.market;
    m.market_id = market_id;
    m.active = true;
    m.initial_margin_bps = initial_margin_bps;
    m.maintenance_margin_bps = maintenance_margin_bps;
    m.max_position_size = max_position_size;
    m.mark_price = 0;
    m.index_price = 0;
    m.last_price_update = 0;
    m.open_interest_long = 0;
    m.open_interest_short = 0;

    emit!(MarketAdded {
        market_id,
        initial_margin_bps,
        maintenance_margin_bps,
        max_position_size,
    });

    Ok(())
}
