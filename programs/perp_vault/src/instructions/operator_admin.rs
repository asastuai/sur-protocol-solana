use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::OperatorUpdated;
use crate::state::*;

// ============================================================
//                    SET OPERATOR
// ============================================================
// Solidity: function setOperator(address operator, bool status) onlyOwner.
// Anchor: init_if_needed the Operator PDA, flip authorized flag.

#[derive(Accounts)]
#[instruction(operator: Pubkey, status: bool)]
pub struct SetOperator<'info> {
    #[account(
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        has_one = owner @ VaultError::NotOwner,
    )]
    pub vault_config: Account<'info, VaultConfig>,

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
    require!(operator != Pubkey::default(), VaultError::ZeroAddress);

    let op_acc = &mut ctx.accounts.operator_account;
    if op_acc.operator == Pubkey::default() {
        op_acc.operator = operator;
        op_acc.bump = ctx.bumps.operator_account;
    }
    op_acc.authorized = status;

    emit!(OperatorUpdated { operator, status });
    Ok(())
}
