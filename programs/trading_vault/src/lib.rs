//! trading_vault — SUR Protocol pooled trading vaults (HLP-style).
//!
//! Solana port of TradingVault.sol. Anyone creates a vault → depositors put
//! USDC in → receive shares pro-rata to vault equity → manager trades via
//! perp_engine using vault USDC as margin → profits/losses split per share.
//! Manager earns performance fee (% of profits, with HWM) and management fee
//! (% AUM/year, accrued per second). Lockup period, deposit cap, drawdown
//! auto-pause with 24h cooldown (H-14 fix).
//!
//! v0.2 ships:
//!   - vault registry + per-(vault, depositor) share PDA
//!   - on-chain equity = vault perp_vault.balance + Σ(margin + unrealized PnL)
//!     with positions passed via remaining_accounts (audit-fidelity choice
//!     vs. trusting an off-chain equity arg)
//!   - manual invoke_signed CPIs to perp_vault.internal_transfer +
//!     perp_engine.open_position / close_position (avoids anchor 0.31.1
//!     cpi+idl-build bug — see docs/KNOWN-ISSUES.md)
//!   - H-14 drawdown cooldown preserved byte-for-byte
//!
//! Source: github.com/asastuai/sur-protocol/blob/master/contracts/src/TradingVault.sol

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::admin::*;
use instructions::deposit::*;
use instructions::manager_trade::*;
use instructions::vault_admin::*;
use instructions::withdraw::*;

declare_id!("aMYTJ33dzuTXXHpRSAp9UsR5jogu7sdJUDtVrSx9bjT");

#[program]
pub mod trading_vault {
    use super::*;

    // ====================== INIT + ADMIN ======================

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::admin::initialize(ctx)
    }

    pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }

    pub fn set_drawdown_cooldown_secs(ctx: Context<AdminUpdate>, new_secs: i64) -> Result<()> {
        instructions::admin::set_drawdown_cooldown_secs(ctx, new_secs)
    }

    pub fn set_operator(ctx: Context<SetOperator>, operator: Pubkey, status: bool) -> Result<()> {
        instructions::admin::set_operator(ctx, operator, status)
    }

    // ====================== VAULT ADMIN ======================

    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        name: Vec<u8>,
        description: Vec<u8>,
        performance_fee_bps: u64,
        management_fee_bps: u64,
        deposit_cap: u64,
        lockup_period_secs: i64,
        max_drawdown_bps: u64,
    ) -> Result<()> {
        instructions::vault_admin::create_vault(
            ctx,
            vault_id,
            name,
            description,
            performance_fee_bps,
            management_fee_bps,
            deposit_cap,
            lockup_period_secs,
            max_drawdown_bps,
        )
    }

    pub fn init_vault_balance(ctx: Context<InitVaultBalance>) -> Result<()> {
        instructions::vault_admin::init_vault_balance(ctx)
    }

    pub fn unpause_vault(ctx: Context<ManagerPause>) -> Result<()> {
        instructions::vault_admin::unpause_vault(ctx)
    }

    pub fn emergency_pause(ctx: Context<OwnerVaultPause>) -> Result<()> {
        instructions::vault_admin::emergency_pause(ctx)
    }

    pub fn update_vault_safety_limits(
        ctx: Context<UpdateVaultSafetyLimits>,
        new_deposit_cap: u64,
        new_lockup_period_secs: i64,
    ) -> Result<()> {
        instructions::vault_admin::update_vault_safety_limits(
            ctx,
            new_deposit_cap,
            new_lockup_period_secs,
        )
    }

    // ====================== DEPOSIT / WITHDRAW ======================

    pub fn deposit<'info>(
        ctx: Context<'_, '_, '_, 'info, Deposit<'info>>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw<'info>(
        ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>,
        shares: u128,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, shares)
    }

    // ====================== MANAGER TRADING ======================

    pub fn manager_open_position<'info>(
        ctx: Context<'_, '_, '_, 'info, ManagerOpenPosition<'info>>,
        market_id: [u8; 32],
        size_delta: i64,
        fill_price: u64,
    ) -> Result<()> {
        instructions::manager_trade::manager_open_position(ctx, market_id, size_delta, fill_price)
    }

    pub fn manager_close_position(
        ctx: Context<ManagerClosePosition>,
        market_id: [u8; 32],
        fill_price: u64,
    ) -> Result<()> {
        instructions::manager_trade::manager_close_position(ctx, market_id, fill_price)
    }
}
