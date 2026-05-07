use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::errors::LiquidatorError;
use crate::events::LiquidationExecuted;
use crate::state::*;

// ============================================================
//                    LIQUIDATE (permissionless)
// ============================================================
// Solidity: anyone can call. Engine.liquidatePosition(marketId, trader, keeper)
// performs the actual close + keeper reward.
//
// Solana: same permissionless model. Liquidator program signs CPI to
// perp_engine.liquidate_position via `liquidator_authority` PDA (seed
// `["liquidator_authority"]`). PDA pre-registered as engine operator +
// pre-funded with SOL.
//
// CPI uses manual invoke_signed (same pattern as darkpool — sidesteps
// anchor 0.31.1 cpi+idl-build bug).

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

pub(crate) fn handler(ctx: Context<Liquidate>, market_id: [u8; 32]) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(!cfg.paused, LiquidatorError::PausedError);

    // ---- Initialize keeper stats on first touch ----
    let keeper_stats = &mut ctx.accounts.keeper_stats;
    if keeper_stats.keeper == Pubkey::default() {
        keeper_stats.keeper = ctx.accounts.keeper.key();
        keeper_stats.bump = ctx.bumps.keeper_stats;
    }

    // ---- CPI: engine.liquidate_position ----
    // Engine validates is_liquidatable internally; we just trigger.
    let auth_bump = ctx.bumps.liquidator_authority;
    let auth_seeds: &[&[u8]] = &[b"liquidator_authority", &[auth_bump]];

    invoke_engine_liquidate_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.engine_position,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.liquidator_authority,
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

fn anchor_discriminator(method_name: &str) -> [u8; 8] {
    let mut full_name = String::with_capacity(7 + method_name.len());
    full_name.push_str("global:");
    full_name.push_str(method_name);
    let h = hashv(&[full_name.as_bytes()]);
    let bytes = h.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

#[allow(clippy::too_many_arguments)]
fn invoke_engine_liquidate_position<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    engine_position: &UncheckedAccount<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    liquidator_authority: &UncheckedAccount<'info>,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    // engine.liquidate_position takes no args
    let mut data = Vec::with_capacity(8);
    data.extend_from_slice(&anchor_discriminator("liquidate_position"));

    let ix = Instruction {
        program_id: perp_engine_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(engine_config.key(), false),
            AccountMeta::new(engine_market.key(), false),
            AccountMeta::new(engine_position.key(), false),
            AccountMeta::new_readonly(engine_operator_account.key(), false),
            AccountMeta::new_readonly(liquidator_authority.key(), true), // signer
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            engine_config.to_account_info(),
            engine_market.to_account_info(),
            engine_position.to_account_info(),
            engine_operator_account.to_account_info(),
            liquidator_authority.to_account_info(),
            perp_engine_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}
