use anchor_lang::prelude::*;

use crate::errors::DarkPoolError;
use crate::events::{A2ATradeSettled, ReputationUpdated};
use crate::state::*;

// ============================================================
//                    ACCEPT + SETTLE (v0.2 — CPIs WIRED)
// ============================================================
// Solidity: function acceptAndSettle(intentId, responseId)
//   - intent creator accepts a pending response
//   - opens both positions atomically via PerpEngine
//   - collects fee per side via PerpVault.internalTransfer
//   - updates reputation for both agents
//   - emits A2ATradeSettled
//
// Anchor: darkpool signs CPIs as `darkpool_authority` PDA (seed
// `["darkpool_authority"]`). The PDA must be pre-registered as an operator
// in BOTH perp_vault and perp_engine.
//
// CPI ORDER (CEI: status flips first, then external calls):
//   1) status flips on intent + response
//   2) perp_engine::open_position(buyer, +size, price)
//   3) perp_engine::open_position(seller, -size, price)
//   4) perp_vault::internal_transfer(buyer  -> fee_recipient, fee)
//   5) perp_vault::internal_transfer(seller -> fee_recipient, fee)
//   6) reputation update + event emission

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

    #[account(mut)]
    pub intent_creator: Signer<'info>,

    /// CHECK: darkpool_authority PDA — signs CPIs to engine + vault.
    /// Must be pre-registered as operator on both.
    #[account(
        seeds = [b"darkpool_authority"],
        bump,
    )]
    pub darkpool_authority: UncheckedAccount<'info>,

    // ========== perp_engine CPI accounts ==========
    /// CHECK: perp_engine program id.
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: engine_config PDA (validated by perp_engine).
    pub engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA matching intent.market_id.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: buyer's position PDA (init_if_needed at engine).
    #[account(mut)]
    pub buyer_position: UncheckedAccount<'info>,
    /// CHECK: seller's position PDA (init_if_needed at engine).
    #[account(mut)]
    pub seller_position: UncheckedAccount<'info>,
    /// CHECK: buyer pubkey identity reference.
    pub buyer_trader: UncheckedAccount<'info>,
    /// CHECK: seller pubkey identity reference.
    pub seller_trader: UncheckedAccount<'info>,
    /// CHECK: engine operator PDA for darkpool_authority.
    pub engine_operator_account: UncheckedAccount<'info>,

    // ========== perp_vault CPI accounts ==========
    /// CHECK: perp_vault program id.
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: vault_config PDA.
    pub vault_config: UncheckedAccount<'info>,
    /// CHECK: vault operator PDA for darkpool_authority.
    pub vault_operator_account: UncheckedAccount<'info>,
    /// CHECK: buyer's vault balance PDA.
    #[account(mut)]
    pub buyer_balance: UncheckedAccount<'info>,
    /// CHECK: seller's vault balance PDA.
    #[account(mut)]
    pub seller_balance: UncheckedAccount<'info>,
    /// CHECK: fee_recipient's vault balance PDA.
    #[account(mut)]
    pub fee_recipient_balance: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
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

    // Snapshot pre-mutation values.
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

    // Validate buyer/seller account params match the resolved sides.
    require!(
        ctx.accounts.buyer_trader.key() == buyer,
        DarkPoolError::SelfTrade // reuse error variant; account mismatch
    );
    require!(
        ctx.accounts.seller_trader.key() == seller,
        DarkPoolError::SelfTrade
    );

    // ---- CEI: status flips BEFORE external calls ----
    intent.status = IntentStatus::Filled;
    intent.filled_response_id = response_id;
    response.status = ResponseStatus::Accepted;

    // ---- Compute notional + fee ----
    let notional_u128 = (price as u128)
        .checked_mul(size as u128)
        .ok_or(DarkPoolError::MathOverflow)?
        / SIZE_PRECISION as u128;
    let fee_per_side_u128 = notional_u128
        .checked_mul(fee_bps_at_post as u128)
        .ok_or(DarkPoolError::MathOverflow)?
        / BPS as u128;
    let fee_per_side: u64 = fee_per_side_u128
        .try_into()
        .map_err(|_| DarkPoolError::MathOverflow)?;
    let notional: u64 = notional_u128
        .try_into()
        .map_err(|_| DarkPoolError::MathOverflow)?;

    // ---- darkpool_authority signer seeds ----
    let auth_bump = ctx.bumps.darkpool_authority;
    let auth_seeds: &[&[u8]] = &[b"darkpool_authority", &[auth_bump]];
    let signer_seeds = &[auth_seeds];

    // ---- CPI #1: engine.open_position(buyer, +size, price) ----
    let buyer_size_delta: i64 = i64::try_from(size).map_err(|_| DarkPoolError::MathOverflow)?;
    {
        let cpi_accounts = perp_engine::cpi::accounts::OpenPosition {
            engine_config: ctx.accounts.engine_config.to_account_info(),
            market: ctx.accounts.engine_market.to_account_info(),
            position: ctx.accounts.buyer_position.to_account_info(),
            trader: ctx.accounts.buyer_trader.to_account_info(),
            operator_account: ctx.accounts.engine_operator_account.to_account_info(),
            operator: ctx.accounts.darkpool_authority.to_account_info(),
            payer: ctx.accounts.intent_creator.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.perp_engine_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        perp_engine::cpi::open_position(cpi_ctx, buyer_size_delta, price)?;
    }

    // ---- CPI #2: engine.open_position(seller, -size, price) ----
    {
        let cpi_accounts = perp_engine::cpi::accounts::OpenPosition {
            engine_config: ctx.accounts.engine_config.to_account_info(),
            market: ctx.accounts.engine_market.to_account_info(),
            position: ctx.accounts.seller_position.to_account_info(),
            trader: ctx.accounts.seller_trader.to_account_info(),
            operator_account: ctx.accounts.engine_operator_account.to_account_info(),
            operator: ctx.accounts.darkpool_authority.to_account_info(),
            payer: ctx.accounts.intent_creator.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.perp_engine_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        perp_engine::cpi::open_position(cpi_ctx, -buyer_size_delta, price)?;
    }

    // ---- CPI #3: vault.internal_transfer(buyer -> fee_recipient, fee) ----
    if fee_per_side > 0 {
        {
            let cpi_accounts = perp_vault::cpi::accounts::InternalTransfer {
                vault_config: ctx.accounts.vault_config.to_account_info(),
                operator_account: ctx.accounts.vault_operator_account.to_account_info(),
                from_balance: ctx.accounts.buyer_balance.to_account_info(),
                to_balance: ctx.accounts.fee_recipient_balance.to_account_info(),
                operator: ctx.accounts.darkpool_authority.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.perp_vault_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            perp_vault::cpi::internal_transfer(cpi_ctx, fee_per_side)?;
        }

        // ---- CPI #4: vault.internal_transfer(seller -> fee_recipient, fee) ----
        {
            let cpi_accounts = perp_vault::cpi::accounts::InternalTransfer {
                vault_config: ctx.accounts.vault_config.to_account_info(),
                operator_account: ctx.accounts.vault_operator_account.to_account_info(),
                from_balance: ctx.accounts.seller_balance.to_account_info(),
                to_balance: ctx.accounts.fee_recipient_balance.to_account_info(),
                operator: ctx.accounts.darkpool_authority.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.perp_vault_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            perp_vault::cpi::internal_transfer(cpi_ctx, fee_per_side)?;
        }
    }

    // ---- Reputation update ----
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
