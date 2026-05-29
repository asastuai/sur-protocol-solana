use anchor_lang::prelude::*;

use crate::errors::CollateralError;
use crate::events::CollateralPriceUpdated;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    #[account(
        mut,
        seeds = [CollateralConfig::SEED_PREFIX, collateral.mint.as_ref()],
        bump = collateral.bump,
    )]
    pub collateral: Account<'info, CollateralConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ CollateralError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
    require!(new_price > 0, CollateralError::ZeroAmount);
    let cfg = &ctx.accounts.config;
    // N-9 fix: respect the global pause (consistent with deposit/withdraw).
    require!(!cfg.paused, CollateralError::PausedError);
    let c = &mut ctx.accounts.collateral;

    // H-13: bound per-update deviation.
    if c.price > 0 && cfg.max_price_deviation_bps > 0 {
        let diff = if new_price > c.price {
            new_price - c.price
        } else {
            c.price - new_price
        };
        let dev_bps = (diff as u128)
            .checked_mul(BPS as u128)
            .ok_or(CollateralError::MathOverflow)?
            / c.price as u128;
        require!(
            dev_bps <= cfg.max_price_deviation_bps as u128,
            CollateralError::PriceDeviationTooHigh
        );
    }

    c.price = new_price;
    c.last_price_update = Clock::get()?.unix_timestamp;

    emit!(CollateralPriceUpdated {
        mint: c.mint,
        price: new_price,
        timestamp: c.last_price_update,
    });
    Ok(())
}
