use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::{
    OracleCircuitBreakerTriggered, PricePushPreviewMode, PriceUpdated,
};
use crate::state::*;

// ============================================================
//                    PUSH PRICE (operator-only)
// ============================================================
// Solidity: pushPriceWithPyth() / pushPrice() / pushPriceBatch().
//
// v0.2 simplification: operator passes already-validated prices in
// (mark_price, index_price, source, publish_timestamp). Real Pyth account
// derivation lands in v0.2.X via pyth-solana-receiver-sdk. The on-chain
// validation logic (staleness, deviation, change-bps circuit breaker, M-17
// good-price-count auto-reset) is fully implemented now.
//
// NOTE: perp_engine.update_mark_price CPI is currently a stub
// (PricePushPreviewMode event marks it). Wire in v0.2.X once perp_engine
// program lands.

#[derive(Accounts)]
pub struct PushPrice<'info> {
    #[account(
        mut,
        seeds = [OracleConfig::SEED],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    #[account(
        mut,
        seeds = [FeedConfig::SEED_PREFIX, &feed.market_id],
        bump = feed.bump,
    )]
    pub feed: Account<'info, FeedConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ OracleError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(
    ctx: Context<PushPrice>,
    mark_price: u64,
    index_price: u64,
    source: u8,
    publish_timestamp: i64,
    confidence_bps: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.oracle_config;
    let feed = &mut ctx.accounts.feed;

    require!(feed.active, OracleError::FeedNotConfigured);
    require!(mark_price > 0, OracleError::PriceNegativeOrZero);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ---- Staleness ----
    require!(publish_timestamp <= now, OracleError::FutureTimestamp);
    let age = now.saturating_sub(publish_timestamp);
    require!(
        age <= feed.max_staleness_seconds,
        OracleError::PriceStale
    );

    // ---- Confidence (Pyth) ----
    if feed.max_confidence_bps > 0 && source == 0 {
        require!(
            confidence_bps <= feed.max_confidence_bps,
            OracleError::ConfidenceTooWide
        );
    }

    // ---- Deviation between mark and index when both sourced (source=2) ----
    if source == 2 && feed.max_deviation_bps > 0 {
        let dev = calc_deviation_bps(mark_price, index_price);
        require!(
            dev <= feed.max_deviation_bps,
            OracleError::PriceDeviationTooHigh
        );
    }

    // ---- Circuit breaker by change-bps ----
    let prev_price = feed.last_price;
    let max_change = cfg.max_price_change_bps;
    if prev_price > 0 && max_change > 0 {
        let change_bps = calc_deviation_bps(mark_price, prev_price);
        if change_bps > max_change {
            cfg.circuit_breaker_active = true;
            cfg.circuit_breaker_triggered_at = now;
            cfg.good_price_count_after_cb = 0;
            emit!(OracleCircuitBreakerTriggered {
                market_id: feed.market_id,
                old_price: prev_price,
                new_price: mark_price,
                change_bps,
                timestamp: now,
            });
            // Solidity returns silently here without pushing — same behaviour.
            return Ok(());
        }
    }

    // ---- M-17 good-price counter ----
    if cfg.circuit_breaker_active {
        cfg.good_price_count_after_cb = cfg.good_price_count_after_cb.saturating_add(1);
        let cooldown_passed = now.saturating_sub(cfg.circuit_breaker_triggered_at)
            >= cfg.cooldown_secs;
        let stable = cfg.good_price_count_after_cb >= cfg.required_good_prices_for_reset;
        if cooldown_passed && stable {
            cfg.circuit_breaker_active = false;
        } else {
            // CB still active — do not push to engine yet.
            return Ok(());
        }
    }

    // ---- Update last price ----
    feed.last_price = mark_price;
    feed.last_price_timestamp = now;

    // ---- CPI STUB to perp_engine.update_mark_price ----
    // Wire in v0.2.X. Until then PricePushPreviewMode event flags this push
    // as not-engine-applied for indexers.

    emit!(PriceUpdated {
        market_id: feed.market_id,
        mark_price,
        index_price,
        source,
        timestamp: now,
    });
    emit!(PricePushPreviewMode {
        market_id: feed.market_id,
        mark_price,
        index_price,
        note: String::from("v0.2 preview: perp_engine CPI not wired"),
    });

    Ok(())
}

fn calc_deviation_bps(a: u64, b: u64) -> u64 {
    if a == 0 || b == 0 {
        return BPS;
    }
    let diff = if a > b { a - b } else { b - a };
    let avg = a / 2 + b / 2; // avoids overflow on u64 sum
    if avg == 0 {
        return BPS;
    }
    ((diff as u128) * BPS as u128 / avg as u128) as u64
}
