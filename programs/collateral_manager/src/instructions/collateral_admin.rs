use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::CollateralError;
use crate::events::{
    CollateralAdded, CollateralHaircutUpdated, CollateralPauseChanged, ParameterBump,
};
use crate::state::*;

#[derive(Accounts)]
pub struct AddCollateral<'info> {
    #[account(
        mut,
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
        has_one = owner @ CollateralError::NotOwner,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = CollateralConfig::SIZE,
        seeds = [CollateralConfig::SEED_PREFIX, mint.key().as_ref()],
        bump,
    )]
    pub collateral: Account<'info, CollateralConfig>,

    /// CHECK: PDA that owns the escrow token account, derived per mint.
    #[account(
        seeds = [CollateralConfig::ESCROW_AUTH_SEED_PREFIX, mint.key().as_ref()],
        bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        token::mint = mint,
        token::authority = escrow_authority,
        seeds = [b"escrow", mint.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub(crate) fn add_collateral(
    ctx: Context<AddCollateral>,
    symbol: [u8; 16],
    haircut_bps: u64,
    initial_price: u64,
    max_price_age: i64,
    deposit_cap: u64,
) -> Result<()> {
    require!(
        haircut_bps <= BPS && haircut_bps >= 5000,
        CollateralError::HaircutInvalid
    );
    require!(initial_price > 0, CollateralError::ZeroAmount);
    require!(max_price_age > 0, CollateralError::ZeroAmount);

    let mint = &ctx.accounts.mint;
    let c = &mut ctx.accounts.collateral;
    c.bump = ctx.bumps.collateral;
    c.escrow_authority_bump = ctx.bumps.escrow_authority;
    c.mint = mint.key();
    c.escrow = ctx.accounts.escrow.key();
    c.decimals = mint.decimals;
    c.haircut_bps = haircut_bps;
    c.price = initial_price;
    c.last_price_update = Clock::get()?.unix_timestamp;
    c.max_price_age = max_price_age;
    c.active = true;
    c.total_deposited = 0;
    c.deposit_cap = deposit_cap;
    c.symbol = symbol;

    let cfg = &mut ctx.accounts.config;
    cfg.supported_token_count = cfg
        .supported_token_count
        .checked_add(1)
        .ok_or(CollateralError::MathOverflow)?;

    emit!(CollateralAdded {
        mint: mint.key(),
        symbol,
        haircut_bps,
        decimals: mint.decimals,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateCollateral<'info> {
    #[account(
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
        has_one = owner @ CollateralError::NotOwner,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    #[account(
        mut,
        seeds = [CollateralConfig::SEED_PREFIX, collateral.mint.as_ref()],
        bump = collateral.bump,
    )]
    pub collateral: Account<'info, CollateralConfig>,

    pub owner: Signer<'info>,
}

pub(crate) fn update_haircut(
    ctx: Context<UpdateCollateral>,
    new_haircut: u64,
) -> Result<()> {
    require!(
        new_haircut <= BPS && new_haircut >= 5000,
        CollateralError::HaircutInvalid
    );
    let c = &mut ctx.accounts.collateral;
    let old = c.haircut_bps;
    c.haircut_bps = new_haircut;

    emit!(CollateralHaircutUpdated {
        mint: c.mint,
        old_haircut: old,
        new_haircut,
    });

    // Per-token param id: sha256("CollateralManager.haircut:" || mint).
    let mut buf = Vec::with_capacity(26 + 32);
    buf.extend_from_slice(b"CollateralManager.haircut:");
    buf.extend_from_slice(c.mint.as_ref());
    let param_id = anchor_lang::solana_program::hash::hash(&buf).to_bytes();
    emit!(ParameterBump {
        param_id,
        old_value: old,
        new_value: new_haircut,
        effective_slot: Clock::get()?.slot,
        admin: ctx.accounts.owner.key(),
    });
    Ok(())
}

pub(crate) fn pause_collateral(ctx: Context<UpdateCollateral>) -> Result<()> {
    let c = &mut ctx.accounts.collateral;
    c.active = false;
    emit!(CollateralPauseChanged { mint: c.mint, active: false });
    Ok(())
}

pub(crate) fn unpause_collateral(ctx: Context<UpdateCollateral>) -> Result<()> {
    let c = &mut ctx.accounts.collateral;
    c.active = true;
    emit!(CollateralPauseChanged { mint: c.mint, active: true });
    Ok(())
}
