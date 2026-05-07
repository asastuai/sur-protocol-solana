use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::IntentCancelled;
use crate::state::*;

// ============================================================
//                    CANCEL INTENT
// ============================================================
// Solidity: function cancelIntent(uint256 intentId)
//   - only intent.agent can cancel
//   - only Open intents
//   - increments reputations[agent].expiredIntents (slight penalty)
//
// Anchor: Intent PDA is identified by seed; constraint enforces caller is creator.

#[derive(Accounts)]
pub struct CancelIntent<'info> {
    #[account(
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(
        mut,
        seeds = [Intent::SEED_PREFIX, &intent.id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.agent == agent.key() @ DarkPoolError::NotIntentCreator,
        constraint = intent.status == IntentStatus::Open @ DarkPoolError::IntentNotOpen,
    )]
    pub intent: Account<'info, Intent>,

    #[account(
        mut,
        seeds = [AgentReputation::SEED_PREFIX, agent.key().as_ref()],
        bump = reputation.bump,
    )]
    pub reputation: Account<'info, AgentReputation>,

    pub agent: Signer<'info>,
}

pub(crate) fn handler(ctx: Context<CancelIntent>) -> Result<()> {
    let intent = &mut ctx.accounts.intent;
    intent.status = IntentStatus::Cancelled;

    let reputation = &mut ctx.accounts.reputation;
    reputation.expired_intents = reputation.expired_intents.saturating_add(1);

    emit!(IntentCancelled {
        intent_id: intent.id
    });

    Ok(())
}
