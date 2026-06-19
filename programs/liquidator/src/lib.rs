//! liquidator — SUR Protocol permissionless liquidator.
//!
//! Anyone can call `liquidate(market_id)` to close an undercollateralized
//! position. The engine validates `is_liquidatable` internally and performs
//! the close. Liquidator program tracks per-keeper stats for leaderboards.
//!
//! v0.3 wiring #2: liquidator forwards vault remaining_accounts to engine
//! so engine's internal vault CPI fires. Keeper reward + insurance routing
//! happens INSIDE engine.liquidate_position (mirrors PerpEngine.sol
//! _distributeLiquidationRewards Sol:1543-1568).
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/Liquidator.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8aerVEjWfL65UtdTTLSYJmrNp2uabou8ySjdLw8BXD5p");

#[program]
pub mod liquidator {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::admin::initialize(ctx)
    }

    pub fn liquidate<'info>(
        ctx: Context<'_, '_, '_, 'info, Liquidate<'info>>,
        market_id: [u8; 32],
    ) -> Result<()> {
        instructions::liquidate::handler(ctx, market_id)
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
}
