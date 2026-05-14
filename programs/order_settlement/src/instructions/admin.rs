use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::OrderSettlementError;
use crate::events::*;
use crate::signature::compute_domain_separator;
use crate::state::*;

// ============================================================
//                    INITIALIZE
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = OrderSettlementConfig::SIZE,
        seeds = [OrderSettlementConfig::SEED],
        bump,
    )]
    pub config: Account<'info, OrderSettlementConfig>,

    /// CHECK: Authority PDA. Pre-funded by owner with rent for init_if_needed
    /// PDAs at perp_engine + perp_vault (positions, balances). Must be
    /// pre-registered as operator on both callee programs.
    #[account(
        mut,
        seeds = [OrderSettlementConfig::AUTHORITY_SEED],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: perp_engine program id; stored.
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: perp_engine::EngineConfig PDA; stored.
    pub perp_engine_config: UncheckedAccount<'info>,
    /// CHECK: perp_engine::Operator PDA derived from authority; stored.
    pub engine_operator_account: UncheckedAccount<'info>,

    /// CHECK: perp_vault program id; stored.
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault::VaultConfig PDA; stored.
    pub perp_vault_config: UncheckedAccount<'info>,
    /// CHECK: perp_vault::Operator PDA derived from authority; stored.
    pub vault_operator_account: UncheckedAccount<'info>,

    /// CHECK: fee recipient pubkey; stored.
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn initialize(ctx: Context<Initialize>, cluster_id: u64) -> Result<()> {
    let cfg = &mut ctx.accounts.config;

    require!(
        ctx.accounts.fee_recipient.key() != Pubkey::default(),
        OrderSettlementError::ZeroAddress
    );

    cfg.bump = ctx.bumps.config;
    cfg.authority_bump = ctx.bumps.authority;
    cfg.owner = ctx.accounts.owner.key();
    cfg.pending_owner = Pubkey::default();
    cfg.fee_recipient = ctx.accounts.fee_recipient.key();
    cfg.paused = false;

    cfg.perp_engine_program = ctx.accounts.perp_engine_program.key();
    cfg.perp_engine_config = ctx.accounts.perp_engine_config.key();
    cfg.engine_operator_account = ctx.accounts.engine_operator_account.key();

    cfg.perp_vault_program = ctx.accounts.perp_vault_program.key();
    cfg.perp_vault_config = ctx.accounts.perp_vault_config.key();
    cfg.vault_operator_account = ctx.accounts.vault_operator_account.key();

    cfg.maker_fee_bps = DEFAULT_MAKER_FEE_BPS;
    cfg.taker_fee_bps = DEFAULT_TAKER_FEE_BPS;
    cfg.min_settlement_delay = DEFAULT_MIN_SETTLEMENT_DELAY;
    cfg.max_settlement_delay = DEFAULT_MAX_SETTLEMENT_DELAY;

    cfg.dynamic_spread_enabled = true;
    cfg.spread_tier_1_bps = DEFAULT_SPREAD_TIER1_BPS;
    cfg.spread_tier_2_bps = DEFAULT_SPREAD_TIER2_BPS;
    cfg.spread_tier_3_bps = DEFAULT_SPREAD_TIER3_BPS;

    cfg.batch_counter = 0;
    cfg.cluster_id = cluster_id;
    cfg.domain_separator = compute_domain_separator(ctx.program_id, cluster_id);

    emit!(OwnershipTransferred {
        previous_owner: Pubkey::default(),
        new_owner: cfg.owner,
    });
    Ok(())
}

// ============================================================
//                    OWNER ADMIN
// ============================================================

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [OrderSettlementConfig::SEED],
        bump = config.bump,
        has_one = owner @ OrderSettlementError::NotOwner,
    )]
    pub config: Account<'info, OrderSettlementConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn transfer_ownership(ctx: Context<AdminUpdate>, new_owner: Pubkey) -> Result<()> {
    require!(new_owner != Pubkey::default(), OrderSettlementError::ZeroAddress);
    let cfg = &mut ctx.accounts.config;
    cfg.pending_owner = new_owner;
    emit!(OwnershipTransferStarted {
        current_owner: cfg.owner,
        pending_owner: new_owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    #[account(
        mut,
        seeds = [OrderSettlementConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderSettlementConfig>,

    pub pending_owner: Signer<'info>,
}

pub(crate) fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(
        ctx.accounts.pending_owner.key() == cfg.pending_owner,
        OrderSettlementError::NotPendingOwner
    );
    let old = cfg.owner;
    cfg.owner = ctx.accounts.pending_owner.key();
    cfg.pending_owner = Pubkey::default();
    emit!(OwnershipTransferred {
        previous_owner: old,
        new_owner: cfg.owner,
    });
    Ok(())
}

// ============================================================
//                    SET FEE RECIPIENT
// ============================================================

#[derive(Accounts)]
pub struct SetFeeRecipient<'info> {
    #[account(
        mut,
        seeds = [OrderSettlementConfig::SEED],
        bump = config.bump,
        has_one = owner @ OrderSettlementError::NotOwner,
    )]
    pub config: Account<'info, OrderSettlementConfig>,

    /// CHECK: new fee recipient pubkey.
    pub new_recipient: UncheckedAccount<'info>,

    pub owner: Signer<'info>,
}

pub(crate) fn set_fee_recipient(ctx: Context<SetFeeRecipient>) -> Result<()> {
    let new = ctx.accounts.new_recipient.key();
    require!(new != Pubkey::default(), OrderSettlementError::ZeroAddress);
    let cfg = &mut ctx.accounts.config;
    let old = cfg.fee_recipient;
    cfg.fee_recipient = new;
    emit!(FeeRecipientUpdated {
        old_recipient: old,
        new_recipient: new,
    });
    Ok(())
}

// ============================================================
//                    PAUSE / UNPAUSE
// ============================================================

pub(crate) fn pause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = true;
    emit!(PauseStatusChanged { is_paused: true });
    Ok(())
}

pub(crate) fn unpause(ctx: Context<AdminUpdate>) -> Result<()> {
    ctx.accounts.config.paused = false;
    emit!(PauseStatusChanged { is_paused: false });
    Ok(())
}

// ============================================================
//                    SET FEES (prospective param bump)
// ============================================================

pub(crate) fn set_fees(ctx: Context<AdminUpdate>, maker: u32, taker: u32) -> Result<()> {
    require!(
        maker <= MAX_FEE_BPS && taker <= MAX_FEE_BPS,
        OrderSettlementError::FeeTooHigh
    );
    let slot = Clock::get()?.slot;
    let cfg = &mut ctx.accounts.config;
    let old_maker = cfg.maker_fee_bps;
    let old_taker = cfg.taker_fee_bps;
    cfg.maker_fee_bps = maker;
    cfg.taker_fee_bps = taker;

    emit!(FeesUpdated {
        maker_fee_bps: maker,
        taker_fee_bps: taker,
    });
    emit!(ParameterBump {
        param_id: hashv(&[b"OrderSettlement.makerFeeBps"]).to_bytes(),
        old_value: old_maker.to_le_bytes().to_vec(),
        new_value: maker.to_le_bytes().to_vec(),
        effective_slot: slot,
        admin: ctx.accounts.owner.key(),
    });
    emit!(ParameterBump {
        param_id: hashv(&[b"OrderSettlement.takerFeeBps"]).to_bytes(),
        old_value: old_taker.to_le_bytes().to_vec(),
        new_value: taker.to_le_bytes().to_vec(),
        effective_slot: slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

// ============================================================
//                    SET SETTLEMENT DELAY
// ============================================================

pub(crate) fn set_settlement_delay(
    ctx: Context<AdminUpdate>,
    min_delay: i64,
    max_delay: i64,
) -> Result<()> {
    require!(min_delay >= 0 && max_delay >= 0, OrderSettlementError::DelayMisordered);
    require!(max_delay >= min_delay, OrderSettlementError::DelayMisordered);
    require!(max_delay <= MAX_DELAY_SECS, OrderSettlementError::DelayTooHigh);

    let slot = Clock::get()?.slot;
    let cfg = &mut ctx.accounts.config;
    let old_min = cfg.min_settlement_delay;
    cfg.min_settlement_delay = min_delay;
    cfg.max_settlement_delay = max_delay;

    emit!(TimeLockUpdated {
        new_min_delay_secs: min_delay,
    });
    emit!(ParameterBump {
        param_id: hashv(&[b"OrderSettlement.minSettlementDelay"]).to_bytes(),
        old_value: old_min.to_le_bytes().to_vec(),
        new_value: min_delay.to_le_bytes().to_vec(),
        effective_slot: slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

// ============================================================
//                    SET DYNAMIC SPREAD ENABLED + TIERS
// ============================================================

pub(crate) fn set_dynamic_spread_enabled(
    ctx: Context<AdminUpdate>,
    enabled: bool,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let cfg = &mut ctx.accounts.config;
    let old = cfg.dynamic_spread_enabled;
    cfg.dynamic_spread_enabled = enabled;
    emit!(DynamicSpreadUpdated { enabled });
    emit!(ParameterBump {
        param_id: hashv(&[b"OrderSettlement.dynamicSpreadEnabled"]).to_bytes(),
        old_value: vec![if old { 1 } else { 0 }],
        new_value: vec![if enabled { 1 } else { 0 }],
        effective_slot: slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub(crate) fn set_dynamic_spread_tiers(
    ctx: Context<AdminUpdate>,
    tier1: u32,
    tier2: u32,
    tier3: u32,
) -> Result<()> {
    require!(tier1 <= tier2 && tier2 <= tier3, OrderSettlementError::TiersNotAscending);
    let slot = Clock::get()?.slot;
    let cfg = &mut ctx.accounts.config;
    let old1 = cfg.spread_tier_1_bps;
    let old2 = cfg.spread_tier_2_bps;
    let old3 = cfg.spread_tier_3_bps;
    cfg.spread_tier_1_bps = tier1;
    cfg.spread_tier_2_bps = tier2;
    cfg.spread_tier_3_bps = tier3;

    let mut old_tup = Vec::with_capacity(12);
    old_tup.extend_from_slice(&old1.to_le_bytes());
    old_tup.extend_from_slice(&old2.to_le_bytes());
    old_tup.extend_from_slice(&old3.to_le_bytes());
    let mut new_tup = Vec::with_capacity(12);
    new_tup.extend_from_slice(&tier1.to_le_bytes());
    new_tup.extend_from_slice(&tier2.to_le_bytes());
    new_tup.extend_from_slice(&tier3.to_le_bytes());

    emit!(DynamicSpreadTiersUpdated { tier1, tier2, tier3 });
    emit!(ParameterBump {
        param_id: hashv(&[b"OrderSettlement.spreadTiersBps"]).to_bytes(),
        old_value: old_tup,
        new_value: new_tup,
        effective_slot: slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}
