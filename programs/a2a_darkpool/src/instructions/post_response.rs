use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::ResponsePosted;
use crate::state::*;

// ============================================================
//                    POST RESPONSE
// ============================================================
// Solidity: function postResponse(intentId, price, duration)
//   - intent must be Open + not expired
//   - cannot self-trade
//   - price must be within [minPrice, maxPrice]
//   - cooldown enforced via lastResponseTime mapping
//
// Anchor: cooldown is now stored on AgentReputation.last_response_time
// to avoid carrying a separate PDA just for that field.

#[derive(Accounts)]
pub struct PostResponse<'info> {
    #[account(
        mut,
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(
        seeds = [Intent::SEED_PREFIX, &intent.id.to_le_bytes()],
        bump = intent.bump,
    )]
    pub intent: Account<'info, Intent>,

    #[account(
        init,
        payer = responder,
        space = Response::SIZE,
        seeds = [Response::SEED_PREFIX, &config.next_response_id.to_le_bytes()],
        bump,
    )]
    pub response: Account<'info, Response>,

    #[account(
        init_if_needed,
        payer = responder,
        space = AgentReputation::SIZE,
        seeds = [AgentReputation::SEED_PREFIX, responder.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, AgentReputation>,

    #[account(mut)]
    pub responder: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<PostResponse>, price: u64, duration: i64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.paused, DarkPoolError::PausedError);

    let intent = &ctx.accounts.intent;
    require!(
        intent.status == IntentStatus::Open,
        DarkPoolError::IntentNotOpen
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp <= intent.expires_at,
        DarkPoolError::IntentExpired
    );
    require!(
        intent.agent != ctx.accounts.responder.key(),
        DarkPoolError::SelfTrade
    );
    require!(
        price >= intent.min_price && price <= intent.max_price,
        DarkPoolError::PriceOutOfRange
    );
    require!(duration > 0, DarkPoolError::InvalidDuration);

    // Initialize reputation PDA on first touch.
    let reputation = &mut ctx.accounts.reputation;
    if reputation.agent == Pubkey::default() {
        reputation.agent = ctx.accounts.responder.key();
        reputation.bump = ctx.bumps.reputation;
    }

    // Cooldown — Solidity: require(now >= lastResponseTime[msg.sender] + responseCooldown).
    require!(
        clock.unix_timestamp
            >= reputation
                .last_response_time
                .saturating_add(config.response_cooldown),
        DarkPoolError::CooldownActive
    );
    reputation.last_response_time = clock.unix_timestamp;

    let response_id = config.next_response_id;
    let response_expires_at = clock
        .unix_timestamp
        .checked_add(duration)
        .ok_or(DarkPoolError::MathOverflow)?;

    let response = &mut ctx.accounts.response;
    response.bump = ctx.bumps.response;
    response.id = response_id;
    response.intent_id = intent.id;
    response.agent = ctx.accounts.responder.key();
    response.price = price;
    response.created_at = clock.unix_timestamp;
    response.expires_at = response_expires_at;
    response.status = ResponseStatus::Pending;

    config.next_response_id = config
        .next_response_id
        .checked_add(1)
        .ok_or(DarkPoolError::MathOverflow)?;

    emit!(ResponsePosted {
        response_id,
        intent_id: intent.id,
        responder: ctx.accounts.responder.key(),
        price,
    });

    Ok(())
}
