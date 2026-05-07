use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::{A2ATradeSettled, ReputationUpdated, SettlementPreviewMode};
use crate::state::*;

// ============================================================
//                    ACCEPT + SETTLE
// ============================================================
// Solidity: function acceptAndSettle(intentId, responseId)
//   - intent creator accepts a pending response
//   - opens both positions atomically via PerpEngine
//   - collects fee per side via PerpVault.internalTransfer
//   - updates reputation for both agents
//   - emits A2ATradeSettled
//
// Solidity also uses nonReentrant (transient storage) and CEI ordering.
// Anchor: Solana forbids direct CPI reentrancy by default — no guard needed.
// CEI ordering is preserved manually below.
//
// CPI INTEGRATION POINTS (currently stubs — see ARCHITECTURE.md):
//   1) perp_engine::open_position(market_id, buyer, +size, price)
//   2) perp_engine::open_position(market_id, seller, -size, price)
//   3) perp_vault::internal_transfer(buyer, fee_recipient, fee)
//   4) perp_vault::internal_transfer(seller, fee_recipient, fee)
//
// Until those programs are ported, this instruction:
//   - flips Intent + Response statuses
//   - computes the same fee that would be charged
//   - updates reputation
//   - emits A2ATradeSettled with the agreed terms
// so SDKs and indexers see the trade as settled. Wire CPIs at v0.2.

#[derive(Accounts)]
pub struct AcceptAndSettle<'info> {
    #[account(
        seeds = [DarkPoolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, DarkPoolConfig>,

    #[account(
        mut,
        seeds = [Intent::SEED_PREFIX, &intent.id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.agent == intent_creator.key() @ DarkPoolError::NotIntentCreator,
        constraint = intent.status == IntentStatus::Open @ DarkPoolError::IntentNotOpen,
    )]
    pub intent: Account<'info, Intent>,

    #[account(
        mut,
        seeds = [Response::SEED_PREFIX, &response.id.to_le_bytes()],
        bump = response.bump,
        constraint = response.intent_id == intent.id @ DarkPoolError::ResponseIntentMismatch,
        constraint = response.status == ResponseStatus::Pending @ DarkPoolError::ResponseNotPending,
    )]
    pub response: Account<'info, Response>,

    #[account(
        mut,
        seeds = [AgentReputation::SEED_PREFIX, intent.agent.as_ref()],
        bump = intent_creator_reputation.bump,
    )]
    pub intent_creator_reputation: Account<'info, AgentReputation>,

    #[account(
        mut,
        seeds = [AgentReputation::SEED_PREFIX, response.agent.as_ref()],
        bump = responder_reputation.bump,
    )]
    pub responder_reputation: Account<'info, AgentReputation>,

    pub intent_creator: Signer<'info>,
    // CPI accounts for perp_engine + perp_vault programs are added when
    // those programs land. Keeping the surface minimal until then.
}

pub(crate) fn handler(ctx: Context<AcceptAndSettle>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, DarkPoolError::PausedError);

    let clock = Clock::get()?;

    let intent = &mut ctx.accounts.intent;
    require!(
        clock.unix_timestamp <= intent.expires_at,
        DarkPoolError::IntentExpired
    );

    let response = &mut ctx.accounts.response;
    require!(
        clock.unix_timestamp <= response.expires_at,
        DarkPoolError::ResponseExpired
    );

    // Snapshot pre-mutation values so we can use them in events + math
    // without borrow conflicts.
    let buyer = if intent.is_buy { intent.agent } else { response.agent };
    let seller = if intent.is_buy { response.agent } else { intent.agent };
    let price = response.price;
    let size = intent.size;
    let market_id = intent.market_id;
    let intent_id = intent.id;
    let response_id = response.id;
    let fee_bps_at_post = intent.fee_bps_at_post;
    let intent_agent = intent.agent;
    let responder_agent = response.agent;

    // ---- CEI: update statuses BEFORE external calls ----
    intent.status = IntentStatus::Filled;
    intent.filled_response_id = response_id;
    response.status = ResponseStatus::Accepted;

    // ========================================================================
    // CPI STUB #1 — atomic position opening via perp_engine
    // ========================================================================
    // Solidity:
    //   engine.openPosition(intent.marketId, buyer,  int256(size), price);
    //   engine.openPosition(intent.marketId, seller, -int256(size), price);
    //
    // When perp_engine is ported, replace this block with:
    //
    //   let cpi_ctx = CpiContext::new(
    //       ctx.accounts.perp_engine_program.to_account_info(),
    //       perp_engine::cpi::accounts::OpenPosition { /* ... */ },
    //   );
    //   perp_engine::cpi::open_position(cpi_ctx, market_id, buyer, size as i64, price)?;
    //   ... and the same for seller with -size ...
    //
    // CRITICAL: keep this atomic. If either CPI fails, the entire tx must
    // revert. Solana gives this guarantee for free — no nonReentrant guard
    // needed (the runtime forbids reentrancy by default on direct CPI loops).
    // ========================================================================

    // ========================================================================
    // CPI STUB #2 — fee collection via perp_vault
    // ========================================================================
    // Solidity (H-11 fix: AFTER positions opened, using fee_bps_at_post):
    //   uint256 notional = (price * size) / SIZE_PRECISION;
    //   uint256 feePerSide = (notional * intent.feeBpsAtPost) / BPS;
    //   vault.internalTransfer(buyer,  feeRecipient, feePerSide);
    //   vault.internalTransfer(seller, feeRecipient, feePerSide);
    // ========================================================================
    let notional_u128 = (price as u128)
        .checked_mul(size as u128)
        .ok_or(DarkPoolError::MathOverflow)?
        / SIZE_PRECISION as u128;

    let fee_per_side_u128 = notional_u128
        .checked_mul(fee_bps_at_post as u128)
        .ok_or(DarkPoolError::MathOverflow)?
        / BPS as u128;

    // TODO(perp_vault): CPI two internalTransfer calls here.
    // Until then, fee_per_side_u128 is published in SettlementPreviewMode
    // event so the indexer can compute the would-be fee for analytics.

    let notional: u64 = notional_u128
        .try_into()
        .map_err(|_| DarkPoolError::MathOverflow)?;

    // ---- Update reputation for both agents ----
    update_reputation(
        &mut ctx.accounts.intent_creator_reputation,
        intent_agent,
        notional,
        clock.unix_timestamp,
    );
    update_reputation(
        &mut ctx.accounts.responder_reputation,
        responder_agent,
        notional,
        clock.unix_timestamp,
    );

    emit!(A2ATradeSettled {
        intent_id,
        response_id,
        buyer,
        seller,
        market_id,
        size,
        price,
        timestamp: clock.unix_timestamp,
    });

    // ---- Preview-mode marker (v0.1 only — remove in v0.2 when CPIs land) ----
    // Indexers MUST treat this paired marker as a signal that the trade did
    // NOT actually open positions or move fees. Filter or flag accordingly.
    let fee_uncollected: u64 = fee_per_side_u128
        .try_into()
        .map_err(|_| DarkPoolError::MathOverflow)?;
    emit!(SettlementPreviewMode {
        intent_id,
        response_id,
        fee_per_side_uncollected: fee_uncollected,
        note: String::from("v0.1 preview: perp_engine + perp_vault CPIs not wired"),
    });

    Ok(())
}

fn update_reputation(rep: &mut AgentReputation, agent: Pubkey, volume: u64, ts: i64) {
    rep.completed_trades = rep.completed_trades.saturating_add(1);
    rep.total_volume = rep.total_volume.saturating_add(volume);
    if rep.first_trade_at == 0 {
        rep.first_trade_at = ts;
    }
    rep.last_trade_at = ts;

    emit!(ReputationUpdated {
        agent,
        new_score: rep.get_score(),
        completed_trades: rep.completed_trades,
    });
}
