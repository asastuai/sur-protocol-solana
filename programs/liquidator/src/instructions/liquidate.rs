use anchor_lang::prelude::*;

use crate::errors::LiquidatorError;
use crate::events::LiquidationExecuted;
use crate::instructions::cpi_util::invoke_engine_liquidate_position;
use crate::state::*;

// ============================================================
//                    LIQUIDATE (permissionless)
// ============================================================
// Solidity: Liquidator.sol:45-60. Anyone can call. Engine performs
// the actual close + keeper reward distribution. We just signal:
//   engine.liquidatePosition(marketId, trader, msg.sender)  [Sol:53]
//
// On Solana the keeper-reward + insurance routing happens INSIDE
// engine.liquidate_position (v0.3 wiring #1). Liquidator no longer
// computes the reward — it just forwards the vault accounts.
//
// CPI signed as `liquidator_authority` PDA (seed `["liquidator_authority"]`).
// PDA is pre-registered as an engine operator (test setup) and pre-funded
// with SOL.
//
// Manual invoke_signed pattern same as a2a_darkpool — sidesteps anchor
// 0.31.1 cpi+idl-build bug.
//
// VAULT ACCOUNTS forwarded to engine via remaining_accounts (file order
// locked by perp_engine::liquidate_position.rs file header):
//   0. engine_authority        (read)  — engine's signing PDA
//   1. perp_vault_program      (read)
//   2. vault_config            (read)
//   3. vault_operator          (read)  — vault Operator PDA for engine_authority
//   4. keeper_balance          (mut)
//   5. engine_pool_balance     (mut)   — engine_authority's vault account
//   6. insurance_fund_balance  (mut)
//
// Empty/short remaining_accounts => engine skips internal vault CPI
// (legacy v0.2 path; preserved for backward compat with smoke tests).

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        mut,
        seeds = [LiquidatorConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, LiquidatorConfig>,

    /// Per-keeper stats — incremented on each successful liquidation.
    #[account(
        init_if_needed,
        payer = keeper,
        space = KeeperStats::SIZE,
        seeds = [KeeperStats::SEED_PREFIX, keeper.key().as_ref()],
        bump,
    )]
    pub keeper_stats: Account<'info, KeeperStats>,

    /// CHECK: liquidator_authority PDA — signs CPI to engine.
    /// Mut so it can pay rent if engine accounts get init_if_needed.
    /// Pre-registered as engine operator, pre-funded with SOL.
    #[account(
        mut,
        seeds = [b"liquidator_authority"],
        bump,
    )]
    pub liquidator_authority: UncheckedAccount<'info>,

    /// Anyone can call — keeper claims signature for stats.
    #[account(mut)]
    pub keeper: Signer<'info>,

    // ---- engine accounts (validated at engine CPI entry) ----
    /// CHECK: perp_engine program id.
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: engine_config PDA.
    pub engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: position PDA being liquidated.
    #[account(mut)]
    pub engine_position: UncheckedAccount<'info>,
    /// CHECK: engine operator PDA for liquidator_authority.
    pub engine_operator_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Liquidate<'info>>,
    market_id: [u8; 32],
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(!cfg.paused, LiquidatorError::PausedError);

    // ---- Initialize keeper stats on first touch ----
    let keeper_stats = &mut ctx.accounts.keeper_stats;
    if keeper_stats.keeper == Pubkey::default() {
        keeper_stats.keeper = ctx.accounts.keeper.key();
        keeper_stats.bump = ctx.bumps.keeper_stats;
    }

    // ---- CPI: engine.liquidate_position ----
    // Engine validates is_liquidatable internally. Vault accounts forwarded
    // via remaining_accounts so engine's internal vault CPI fires.
    let auth_bump = ctx.bumps.liquidator_authority;
    let auth_seeds: &[&[u8]] = &[b"liquidator_authority", std::slice::from_ref(&auth_bump)];

    invoke_engine_liquidate_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.engine_position,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.liquidator_authority,
        ctx.remaining_accounts,
        auth_seeds,
    )?;

    // ---- Bump stats + emit ----
    cfg.total_liquidations = cfg
        .total_liquidations
        .checked_add(1)
        .ok_or(LiquidatorError::MathOverflow)?;
    keeper_stats.liquidations = keeper_stats
        .liquidations
        .checked_add(1)
        .ok_or(LiquidatorError::MathOverflow)?;

    let clock = Clock::get()?;
    emit!(LiquidationExecuted {
        market_id,
        trader: Pubkey::default(), // engine_position.trader available off-chain via PDA fetch
        keeper: ctx.accounts.keeper.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
