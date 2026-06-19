//! oracle_router — SUR Protocol unified price router.
//!
//! Solana port of OracleRouter.sol. Pyth-only feed for v0.2 (Chainlink + L2
//! sequencer feed concepts don't map to Solana). Validates pushed prices with
//! staleness, confidence, deviation, and a change-bps circuit breaker (M-17
//! consecutive-good-prices auto-reset preserved).
//!
//! v0.2 ships with operator-pushed prices (price values + timestamp passed
//! by operator). Real Pyth-account integration lands in v0.2.X via
//! `pyth-solana-receiver-sdk`. perp_engine.update_mark_price CPI is also
//! stubbed and emits PricePushPreviewMode alongside PriceUpdated.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/OracleRouter.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx");

#[program]
pub mod oracle_router {
    use super::*;

    // ====================== INIT ======================

    pub fn initialize(
        ctx: Context<Initialize>,
        cooldown_secs: i64,
        max_price_change_bps: u64,
        required_good_prices_for_reset: u64,
    ) -> Result<()> {
        instructions::admin::initialize(
            ctx,
            cooldown_secs,
            max_price_change_bps,
            required_good_prices_for_reset,
        )
    }

    // ====================== FEED CONFIG ======================

    pub fn configure_feed(
        ctx: Context<ConfigureFeed>,
        market_id: [u8; 32],
        pyth_feed: Pubkey,
        max_staleness_seconds: i64,
        max_deviation_bps: u64,
        max_confidence_bps: u64,
    ) -> Result<()> {
        instructions::feed::configure_feed(
            ctx,
            market_id,
            pyth_feed,
            max_staleness_seconds,
            max_deviation_bps,
            max_confidence_bps,
        )
    }

    pub fn deactivate_feed(ctx: Context<DeactivateFeed>) -> Result<()> {
        instructions::feed::deactivate_feed(ctx)
    }

    // ====================== OPERATOR ======================

    pub fn set_operator(ctx: Context<SetOperator>, operator: Pubkey, status: bool) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    // ====================== PUSH PRICE ======================

    pub fn push_price(
        ctx: Context<PushPrice>,
        mark_price: u64,
        index_price: u64,
        source: u8,
        publish_timestamp: i64,
        confidence_bps: u64,
    ) -> Result<()> {
        instructions::push_price::handler(
            ctx,
            mark_price,
            index_price,
            source,
            publish_timestamp,
            confidence_bps,
        )
    }

    // ====================== ADMIN ======================

    pub fn set_circuit_breaker_params(
        ctx: Context<AdminUpdate>,
        cooldown_secs: i64,
        max_change_bps: u64,
    ) -> Result<()> {
        instructions::admin::set_circuit_breaker_params(ctx, cooldown_secs, max_change_bps)
    }

    pub fn reset_circuit_breaker(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::reset_circuit_breaker(ctx)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }
}
