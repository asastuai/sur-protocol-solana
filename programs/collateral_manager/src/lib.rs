//! collateral_manager — SUR Protocol multi-asset margin.
//!
//! Solana port of CollateralManager.sol. Traders deposit yield-bearing SPL
//! tokens (cbETH/wstETH-like analogues; on Solana the LST set is mSOL,
//! jitoSOL, bSOL). Each collateral has a haircut (bps) and oracle-pushed
//! USD price. On deposit, the haircut-adjusted USDC value is credited to
//! the trader's perp_vault collateral_balance via manual invoke_signed CPI.
//! On withdrawal, the proportional USDC credit is debited from the vault
//! and the SPL tokens are returned (yield accrues internally to the LST).
//!
//! v0.2.4 ships:
//!   - SPL custody per collateral (escrow PDA, escrow_authority PDA)
//!   - operator-pushed prices with H-13 deviation bound + staleness check
//!   - Mapping 3 prospective haircut + liquidation-threshold snapshots
//!   - manual invoke_signed CPI to perp_vault.credit_collateral / debit_collateral
//!     (avoids the anchor 0.31.1 cpi+idl-build bug — see docs/KNOWN-ISSUES.md)
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/CollateralManager.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("CzsxUSohWydLesZ2nfAa7WqpiZfWhZkWUHhBMkFS29VU");

#[program]
pub mod collateral_manager {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        liquidation_threshold_bps: u64,
        max_price_deviation_bps: u64,
    ) -> Result<()> {
        instructions::admin::initialize(ctx, liquidation_threshold_bps, max_price_deviation_bps)
    }

    pub fn add_collateral(
        ctx: Context<AddCollateral>,
        symbol: [u8; 16],
        haircut_bps: u64,
        initial_price: u64,
        max_price_age: i64,
        deposit_cap: u64,
    ) -> Result<()> {
        instructions::collateral_admin::add_collateral(
            ctx,
            symbol,
            haircut_bps,
            initial_price,
            max_price_age,
            deposit_cap,
        )
    }

    pub fn update_haircut(ctx: Context<UpdateCollateral>, new_haircut: u64) -> Result<()> {
        instructions::collateral_admin::update_haircut(ctx, new_haircut)
    }

    pub fn pause_collateral(ctx: Context<UpdateCollateral>) -> Result<()> {
        instructions::collateral_admin::pause_collateral(ctx)
    }

    pub fn unpause_collateral(ctx: Context<UpdateCollateral>) -> Result<()> {
        instructions::collateral_admin::unpause_collateral(ctx)
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        instructions::update_price::handler(ctx, new_price)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    pub fn set_operator(ctx: Context<SetOperator>, operator: Pubkey, status: bool) -> Result<()> {
        instructions::operator_admin::set_operator(ctx, operator, status)
    }

    pub fn set_liquidation_threshold_bps(
        ctx: Context<AdminUpdate>,
        new_threshold: u64,
    ) -> Result<()> {
        instructions::admin::set_liquidation_threshold_bps(ctx, new_threshold)
    }

    pub fn set_max_price_deviation_bps(ctx: Context<AdminUpdate>, new_bps: u64) -> Result<()> {
        instructions::admin::set_max_price_deviation_bps(ctx, new_bps)
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
