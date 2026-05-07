use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::IntentPosted;
use crate::state::*;

// ============================================================
//                    POST INTENT
// ============================================================
// Solidity: function postIntent(marketId, isBuy, size, minPrice, maxPrice, duration)
//   - validates inputs
//   - checks reputation gate for large trades
//   - creates Intent struct in mapping
//   - emits IntentPosted
//
// Anchor differences:
//   - Intent is its own PDA (init payer = agent)
//   - Reputation PDA is init_if_needed for new agents
//   - block.timestamp → Clock::get()?.unix_timestamp

#[derive(Accounts)]
pub struct PostIntent<'info> {
    #[account(
        mut,
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(
        init,
        payer = agent,
        space = Intent::SIZE,
        seeds = [Intent::SEED_PREFIX, &config.next_intent_id.to_le_bytes()],
        bump,
    )]
    pub intent: Account<'info, Intent>,

    #[account(
        init_if_needed,
        payer = agent,
        space = AgentReputation::SIZE,
        seeds = [AgentReputation::SEED_PREFIX, agent.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, AgentReputation>,

    #[account(mut)]
    pub agent: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(
    ctx: Context<PostIntent>,
    market_id: [u8; 32],
    is_buy: bool,
    size: u64,
    min_price: u64,
    max_price: u64,
    duration: i64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.paused, DarkPoolError::PausedError);
    require!(size > 0, DarkPoolError::ZeroAmount);
    require!(min_price <= max_price, DarkPoolError::InvalidPriceRange);
    require!(
        duration >= config.min_intent_duration && duration <= config.max_intent_duration,
        DarkPoolError::InvalidDuration
    );

    // Initialize reputation PDA on first touch (init_if_needed leaves zeroed fields).
    let reputation = &mut ctx.accounts.reputation;
    if reputation.agent == Pubkey::default() {
        reputation.agent = ctx.accounts.agent.key();
        reputation.bump = ctx.bumps.reputation;
    }

    // Reputation gate for large trades.
    // Solidity: notional = (maxPrice * size) / SIZE_PRECISION; compared against largeTradeThreshold.
    let notional = (max_price as u128)
        .checked_mul(size as u128)
        .ok_or(DarkPoolError::MathOverflow)?
        / SIZE_PRECISION as u128;

    if notional > config.large_trade_threshold as u128 {
        let score = reputation.get_score();
        require!(
            score >= config.large_trade_min_reputation,
            DarkPoolError::InsufficientReputation
        );
    }

    let clock = Clock::get()?;
    let intent_id = config.next_intent_id;
    let expires_at = clock
        .unix_timestamp
        .checked_add(duration)
        .ok_or(DarkPoolError::MathOverflow)?;

    let intent = &mut ctx.accounts.intent;
    intent.bump = ctx.bumps.intent;
    intent.id = intent_id;
    intent.agent = ctx.accounts.agent.key();
    intent.market_id = market_id;
    intent.is_buy = is_buy;
    intent.size = size;
    intent.min_price = min_price;
    intent.max_price = max_price;
    intent.created_at = clock.unix_timestamp;
    intent.expires_at = expires_at;
    intent.status = IntentStatus::Open;
    intent.filled_response_id = 0;
    intent.fee_bps_at_post = config.fee_bps;

    config.next_intent_id = config
        .next_intent_id
        .checked_add(1)
        .ok_or(DarkPoolError::MathOverflow)?;

    emit!(IntentPosted {
        intent_id,
        agent: ctx.accounts.agent.key(),
        market_id,
        is_buy,
        size,
        min_price,
        max_price,
        expires_at: intent.expires_at,
    });

    Ok(())
}
