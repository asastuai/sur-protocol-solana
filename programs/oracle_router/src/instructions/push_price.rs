use anchor_lang::prelude::*;

use crate::errors::OracleError;
use crate::events::{OracleCircuitBreakerTriggered, PriceUpdated};
use crate::state::*;

// ============================================================
//                    PUSH PRICE (operator-only)
// ============================================================
// Solidity: pushPriceWithPyth() / pushPrice() / pushPriceBatch().
//
// v0.2 simplification: operator passes already-validated prices
// (mark_price, index_price, source, publish_timestamp). Real Pyth account
// derivation lands in v0.2.X via pyth-solana-receiver-sdk.
//
// CPI to perp_engine.update_mark_price is NOW WIRED. The oracle_router
// signs as `oracle_authority` PDA (seed `["oracle_authority"]`). That PDA
// must be pre-registered as an operator in perp_engine.

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

    /// CHECK: oracle_authority PDA — signs CPI to perp_engine.update_mark_price.
    /// Must be pre-registered as operator on perp_engine for the CPI to succeed.
    #[account(
        seeds = [b"oracle_authority"],
        bump,
    )]
    pub oracle_authority: UncheckedAccount<'info>,

    // -------- perp_engine CPI accounts --------
    /// CHECK: perp_engine program. Validated by CPI runtime.
    pub perp_engine_program: UncheckedAccount<'info>,

    /// CHECK: engine config PDA. perp_engine validates ownership at CPI entry.
    pub engine_config: UncheckedAccount<'info>,

    /// CHECK: engine market PDA. perp_engine validates ownership + seeds.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,

    /// CHECK: engine operator PDA for oracle_authority. Pre-registered.
    pub engine_operator_account: UncheckedAccount<'info>,
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

    // ---- Update last price (oracle-side state) ----
    feed.last_price = mark_price;
    feed.last_price_timestamp = now;

    // ---- CPI to perp_engine.update_mark_price ----
    let oracle_authority_bump = ctx.bumps.oracle_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"oracle_authority", &[oracle_authority_bump]]];

    let cpi_accounts = perp_engine::cpi::accounts::UpdateMarkPrice {
        engine_config: ctx.accounts.engine_config.to_account_info(),
        market: ctx.accounts.engine_market.to_account_info(),
        operator_account: ctx.accounts.engine_operator_account.to_account_info(),
        operator: ctx.accounts.oracle_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.perp_engine_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    perp_engine::cpi::update_mark_price(cpi_ctx, mark_price, index_price)?;

    emit!(PriceUpdated {
        market_id: feed.market_id,
        mark_price,
        index_price,
        source,
        timestamp: now,
    });

    Ok(())
}

fn calc_deviation_bps(a: u64, b: u64) -> u64 {
    if a == 0 || b == 0 {
        return BPS;
    }
    let diff = if a > b { a - b } else { b - a };
    let avg = a / 2 + b / 2;
    if avg == 0 {
        return BPS;
    }
    ((diff as u128) * BPS as u128 / avg as u128) as u64
}
