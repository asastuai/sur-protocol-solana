use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::ResponseCancelled;
use crate::state::*;

// ============================================================
//                    CANCEL RESPONSE
// ============================================================
// Solidity: function cancelResponse(uint256 responseId)
//   - only response.agent can cancel
//   - only Pending responses
//   - increments reputations[agent].cancelledResponses

#[derive(Accounts)]
pub struct CancelResponse<'info> {
    #[account(
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(
        mut,
        seeds = [Response::SEED_PREFIX, &response.id.to_le_bytes()],
        bump = response.bump,
        constraint = response.agent == responder.key() @ DarkPoolError::NotResponseCreator,
        constraint = response.status == ResponseStatus::Pending @ DarkPoolError::ResponseNotPending,
    )]
    pub response: Account<'info, Response>,

    #[account(
        mut,
        seeds = [AgentReputation::SEED_PREFIX, responder.key().as_ref()],
        bump = reputation.bump,
    )]
    pub reputation: Account<'info, AgentReputation>,

    pub responder: Signer<'info>,
}

pub(crate) fn handler(ctx: Context<CancelResponse>) -> Result<()> {
    let response = &mut ctx.accounts.response;
    response.status = ResponseStatus::Cancelled;

    let reputation = &mut ctx.accounts.reputation;
    reputation.cancelled_responses = reputation.cancelled_responses.saturating_add(1);

    emit!(ResponseCancelled {
        response_id: response.id
    });

    Ok(())
}
