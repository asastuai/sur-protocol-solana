use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::{FeedConfigured, FeedDeactivated};
use crate::state::*;

// ============================================================
//                    CONFIGURE FEED
// ============================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ConfigureFeed<'info> {
    #[account(
        seeds = [OracleConfig::SEED],
        bump = oracle_config.bump,
        has_one = owner @ OracleError::NotOwner,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        space = FeedConfig::SIZE,
        seeds = [FeedConfig::SEED_PREFIX, &market_id],
        bump,
    )]
    pub feed: Account<'info, FeedConfig>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn configure_feed(
    ctx: Context<ConfigureFeed>,
    market_id: [u8; 32],
    pyth_feed: Pubkey,
    max_staleness_seconds: i64,
    max_deviation_bps: u64,
    max_confidence_bps: u64,
) -> Result<()> {
    let feed = &mut ctx.accounts.feed;
    if feed.market_id == [0u8; 32] {
        feed.bump = ctx.bumps.feed;
        feed.market_id = market_id;
    }
    feed.pyth_feed = pyth_feed;
    feed.max_staleness_seconds = max_staleness_seconds;
    feed.max_deviation_bps = max_deviation_bps;
    feed.max_confidence_bps = max_confidence_bps;
    feed.active = true;

    emit!(FeedConfigured {
        market_id,
        pyth_feed,
        max_staleness_seconds,
        max_deviation_bps,
        max_confidence_bps,
    });

    Ok(())
}

// ============================================================
//                    DEACTIVATE FEED
// ============================================================

#[derive(Accounts)]
pub struct DeactivateFeed<'info> {
    #[account(
        seeds = [OracleConfig::SEED],
        bump = oracle_config.bump,
        has_one = owner @ OracleError::NotOwner,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(
        mut,
        seeds = [FeedConfig::SEED_PREFIX, &feed.market_id],
        bump = feed.bump,
    )]
    pub feed: Account<'info, FeedConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn deactivate_feed(ctx: Context<DeactivateFeed>) -> Result<()> {
    let feed = &mut ctx.accounts.feed;
    feed.active = false;
    emit!(FeedDeactivated {
        market_id: feed.market_id,
    });
    Ok(())
}
