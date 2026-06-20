//! perp_engine — SUR Protocol perpetual futures engine.
//!
//! Solana port of PerpEngine.sol (CORE SUBSET for v0.2).
//!
//! Ships in v0.2:
//!   - Market state (per-market PDA), Position state (per market+trader PDA)
//!   - add_market admin
//!   - update_mark_price (called by oracle_router via operator role)
//!   - open_position / close_position with margin computation, OI accounting,
//!     weighted-avg entry, signed-size handling (long=+, short=-), realized PnL
//!     on reduce/flip
//!   - Operator role + two-step ownership transfer
//!
//! Lands in v0.3 (mirroring upstream Solidity contract split):
//!   - Funding rate accrual (in `funding_engine` program)
//!   - Liquidation eligibility (in `liquidator` program)
//!   - Auto-deleveraging (in `auto_deleveraging` program)
//!   - OI caps + skew caps + margin tiers + price impact (in market_registry)
//!   - Cross/Isolated margin modes
//!
//! Margin movement (locking margin from vault, settling PnL, paying fees) is
//! still STUBBED in v0.2 — `perp_vault.internal_transfer` CPI lands in v0.2.X
//! once we add the margin-account abstraction.
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/PerpEngine.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2");

#[program]
pub mod perp_engine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::admin::initialize(ctx)
    }

    pub fn add_market(
        ctx: Context<AddMarket>,
        market_id: [u8; 32],
        initial_margin_bps: u64,
        maintenance_margin_bps: u64,
        max_position_size: u64,
    ) -> Result<()> {
        instructions::market::add_market(
            ctx,
            market_id,
            initial_margin_bps,
            maintenance_margin_bps,
            max_position_size,
        )
    }

    pub fn update_mark_price(
        ctx: Context<UpdateMarkPrice>,
        new_mark_price: u64,
        new_index_price: u64,
    ) -> Result<()> {
        instructions::update_mark_price::handler(ctx, new_mark_price, new_index_price)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        size_delta: i64,
        fill_price: u64,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, size_delta, fill_price)
    }

    pub fn close_position(ctx: Context<ClosePosition>, fill_price: u64) -> Result<()> {
        instructions::close_position::handler(ctx, fill_price)
    }

    pub fn reduce_position(
        ctx: Context<ReducePosition>,
        size_delta: i64,
        fill_price: u64,
    ) -> Result<()> {
        instructions::reduce_position::handler(ctx, size_delta, fill_price)
    }

    pub fn bootstrap_engine_pool(ctx: Context<BootstrapEnginePool>, amount: u64) -> Result<()> {
        instructions::bootstrap_pool::handler(ctx, amount)
    }

    pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
        instructions::liquidate_position::handler(ctx)
    }

    pub fn set_operator(
        ctx: Context<SetOperator>,
        operator: Pubkey,
        status: bool,
    ) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    pub fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::pause(ctx)
    }

    pub fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
        instructions::admin::unpause(ctx)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }

    pub fn set_insurance_fund_balance(
        ctx: Context<AdminUpdate>,
        balance: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_insurance_fund_balance(ctx, balance)
    }
}
