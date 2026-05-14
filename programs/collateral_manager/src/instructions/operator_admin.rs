use anchor_lang::prelude::*;

use crate::errors::CollateralError;
use crate::events::OperatorUpdated;
use crate::state::*;

#[derive(Accounts)]
#[instruction(operator: Pubkey, status: bool)]
pub struct SetOperator<'info> {
    #[account(
        seeds = [CollateralManagerConfig::SEED],
        bump = config.bump,
        has_one = owner @ CollateralError::NotOwner,
    )]
    pub config: Account<'info, CollateralManagerConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        space = Operator::SIZE,
        seeds = [Operator::SEED_PREFIX, operator.as_ref()],
        bump,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn set_operator(
    ctx: Context<SetOperator>,
    operator: Pubkey,
    status: bool,
) -> Result<()> {
    require!(operator != Pubkey::default(), CollateralError::ZeroAddress);
    let op = &mut ctx.accounts.operator_account;
    if op.operator == Pubkey::default() {
        op.operator = operator;
        op.bump = ctx.bumps.operator_account;
    }
    op.authorized = status;
    emit!(OperatorUpdated { operator, status });
    Ok(())
}
