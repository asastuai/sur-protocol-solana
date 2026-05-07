use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

use crate::errors::DarkPoolError;
use crate::events::{
    FeeBpsUpdated, FeeRecipientUpdated, LargeTradeMinReputationUpdated,
    LargeTradeThresholdUpdated, OwnershipTransferStarted, OwnershipTransferred, ParameterBump,
    PauseStatusChanged,
};
use crate::state::*;

// ============================================================
//                    INITIALIZE
// ============================================================
// Solidity equivalent: constructor(_vault, _engine, _feeRecipient, _owner).
// Anchor: explicit instruction since Solana programs do not have constructors.
// One-time call; the [config] PDA enforces idempotency.

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = DarkPoolConfig::SIZE,
        seeds = [DarkPoolConfig::SEED],
        bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: fee recipient — used as a Pubkey reference; vault CPI will validate
    /// at settlement time once the vault program is wired in.
    pub fee_recipient: UncheckedAccount<'info>,

    /// CHECK: perp_engine program id, validated when CPI lands.
    pub perp_engine: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id, validated when CPI lands.
    pub perp_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    fee_bps: u64,
    large_trade_threshold: u64,
    large_trade_min_reputation: u64,
    min_intent_duration: i64,
    max_intent_duration: i64,
    response_cooldown: i64,
) -> Result<()> {
    require!(fee_bps <= 50, DarkPoolError::FeeBpsTooHigh);
    require!(min_intent_duration > 0, DarkPoolError::InvalidDuration);
    require!(
        max_intent_duration >= min_intent_duration,
        DarkPoolError::InvalidDuration
    );

    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.owner = ctx.accounts.owner.key();
    config.pending_owner = Pubkey::default();
    config.paused = false;

    config.fee_bps = fee_bps;
    config.fee_recipient = ctx.accounts.fee_recipient.key();

    config.min_intent_duration = min_intent_duration;
    config.max_intent_duration = max_intent_duration;
    config.response_cooldown = response_cooldown;

    config.large_trade_threshold = large_trade_threshold;
    config.large_trade_min_reputation = large_trade_min_reputation;

    config.next_intent_id = 1;
    config.next_response_id = 1;

    config.perp_engine = ctx.accounts.perp_engine.key();
    config.perp_vault = ctx.accounts.perp_vault.key();

    Ok(())
}

// ============================================================
//                    ADMIN UPDATE (shared accounts struct)
// ============================================================

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
        has_one = owner @ DarkPoolError::NotOwner,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    pub owner: Signer<'info>,
}

// ============================================================
//                    OWNERSHIP TRANSFER (two-step, like Solidity)
// ============================================================

pub fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), DarkPoolError::ZeroAddress);
    let config = &mut ctx.accounts.config;
    config.pending_owner = new_owner;

    emit!(OwnershipTransferStarted {
        current_owner: config.owner,
        pending_owner: new_owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(
        mut,
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    pub pending_owner: Signer<'info>,
}

pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == config.pending_owner,
        DarkPoolError::NotPendingOwner
    );

    let old_owner = config.owner;
    config.owner = ctx.accounts.pending_owner.key();
    config.pending_owner = Pubkey::default();

    emit!(OwnershipTransferred {
        old_owner,
        new_owner: config.owner,
    });
    Ok(())
}

// ============================================================
//                    FEE BPS (prospective-only — Mapping 3)
// ============================================================

pub fn set_fee_bps(ctx: Context<AdminUpdate>, new_fee_bps: u64) -> Result<()> {
    require!(new_fee_bps <= 50, DarkPoolError::FeeBpsTooHigh);

    let config = &mut ctx.accounts.config;
    let old = config.fee_bps;
    config.fee_bps = new_fee_bps;

    let clock = Clock::get()?;
    emit!(FeeBpsUpdated { new_fee_bps });
    emit!(ParameterBump {
        param_id: keccak::hash(b"A2ADarkPool.feeBps").to_bytes(),
        old_value: old.to_le_bytes().to_vec(),
        new_value: new_fee_bps.to_le_bytes().to_vec(),
        effective_slot: clock.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub fn set_fee_recipient(ctx: Context<AdminUpdate>, new_recipient: Pubkey) -> Result<()> {
    require!(new_recipient != Pubkey::default(), DarkPoolError::ZeroAddress);

    let config = &mut ctx.accounts.config;
    config.fee_recipient = new_recipient;
    emit!(FeeRecipientUpdated { new_recipient });
    Ok(())
}

pub fn set_large_trade_threshold(ctx: Context<AdminUpdate>, threshold: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old = config.large_trade_threshold;
    config.large_trade_threshold = threshold;

    let clock = Clock::get()?;
    emit!(LargeTradeThresholdUpdated {
        new_threshold: threshold,
    });
    emit!(ParameterBump {
        param_id: keccak::hash(b"A2ADarkPool.largeTradeThreshold").to_bytes(),
        old_value: old.to_le_bytes().to_vec(),
        new_value: threshold.to_le_bytes().to_vec(),
        effective_slot: clock.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub fn set_large_trade_min_reputation(ctx: Context<AdminUpdate>, min_rep: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old = config.large_trade_min_reputation;
    config.large_trade_min_reputation = min_rep;

    let clock = Clock::get()?;
    emit!(LargeTradeMinReputationUpdated {
        new_min_reputation: min_rep,
    });
    emit!(ParameterBump {
        param_id: keccak::hash(b"A2ADarkPool.largeTradeMinReputation").to_bytes(),
        old_value: old.to_le_bytes().to_vec(),
        new_value: min_rep.to_le_bytes().to_vec(),
        effective_slot: clock.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

// ============================================================
//                    PAUSE / UNPAUSE
// ============================================================

pub fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = true;
    emit!(PauseStatusChanged { is_paused: true });
    Ok(())
}

pub fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(PauseStatusChanged { is_paused: false });
    Ok(())
}
