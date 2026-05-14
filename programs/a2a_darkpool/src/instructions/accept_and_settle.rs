use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

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
// Solana: darkpool signs CPIs as `darkpool_authority` PDA (seed
// `["darkpool_authority"]`). The PDA must be:
//  - pre-registered as operator on BOTH perp_vault and perp_engine
//  - pre-funded with lamports (engine.open_position uses init_if_needed
//    with `payer = operator`, so darkpool_authority pays position rent)
//
// IMPLEMENTATION NOTE: We build instructions manually with `invoke_signed`
// rather than using `perp_engine::cpi::*` typed wrappers — this avoids the
// anchor 0.31.1 cpi+idl-build feature-unification bug
// (see docs/KNOWN-ISSUES.md). Discriminator is the standard Anchor sighash:
// first 8 bytes of sha256("global:<method_name>").
//
// CPI ORDER (CEI: status flips first, then external calls):
//   1) status flips on intent + response
//   2) perp_engine.open_position(buyer,  +size, price)
//   3) perp_engine.open_position(seller, -size, price)
//   4) perp_vault.internal_transfer(buyer  -> fee_recipient, fee)
//   5) perp_vault.internal_transfer(seller -> fee_recipient, fee)
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
    /// Mut so it can pay rent for init_if_needed positions in engine.
    /// Must be pre-funded + pre-registered as operator on both programs.
    #[account(
        mut,
        seeds = [b"darkpool_authority"],
        bump,
    )]
    pub darkpool_authority: UncheckedAccount<'info>,

    // ========== perp_engine accounts (validated at engine CPI entry) ==========
    /// CHECK: perp_engine program id.
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: engine_config PDA.
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

    // ====== engine_authority + its vault wiring (forwarded into engine.open_position via remaining_accounts) ======
    /// CHECK: engine_authority PDA — engine signs its internal vault.internal_transfer as this PDA.
    pub engine_authority: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for engine_authority (registered during 02_perp_engine setup).
    pub engine_vault_operator: UncheckedAccount<'info>,
    /// CHECK: engine_authority's vault AccountBalance PDA (margin pool destination, mut).
    #[account(mut)]
    pub engine_pool_balance: UncheckedAccount<'info>,

    // ========== perp_vault accounts (validated at vault CPI entry) ==========
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
        DarkPoolError::SelfTrade
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

    let auth_bump = ctx.bumps.darkpool_authority;
    let auth_seeds: &[&[u8]] = &[b"darkpool_authority", &[auth_bump]];

    let buyer_size_delta: i64 = i64::try_from(size).map_err(|_| DarkPoolError::MathOverflow)?;

    // ---- CPI #1: engine.open_position(buyer, +size, price) ----
    // Forward vault accounts so engine's internal margin-lock CPI fires
    // (v0.3.1 wiring; engine open_position.rs file header for order).
    invoke_engine_open_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.buyer_position,
        &ctx.accounts.buyer_trader,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.darkpool_authority,
        &ctx.accounts.system_program.to_account_info(),
        // engine-vault remaining_accounts:
        &ctx.accounts.engine_authority,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.engine_vault_operator,
        &ctx.accounts.buyer_balance,        // src_balance for buyer's margin
        &ctx.accounts.engine_pool_balance,  // dst pool
        buyer_size_delta,
        price,
        auth_seeds,
    )?;

    // ---- CPI #2: engine.open_position(seller, -size, price) ----
    invoke_engine_open_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.seller_position,
        &ctx.accounts.seller_trader,
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.darkpool_authority,
        &ctx.accounts.system_program.to_account_info(),
        // engine-vault remaining_accounts (seller side):
        &ctx.accounts.engine_authority,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.engine_vault_operator,
        &ctx.accounts.seller_balance,       // src_balance for seller's margin
        &ctx.accounts.engine_pool_balance,  // dst pool
        -buyer_size_delta,
        price,
        auth_seeds,
    )?;

    // ---- CPI #3+#4: vault internal_transfer (buyer + seller fees) ----
    if fee_per_side > 0 {
        invoke_vault_internal_transfer(
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.vault_config,
            &ctx.accounts.vault_operator_account,
            &ctx.accounts.buyer_balance,
            &ctx.accounts.fee_recipient_balance,
            &ctx.accounts.darkpool_authority,
            fee_per_side,
            auth_seeds,
        )?;
        invoke_vault_internal_transfer(
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.vault_config,
            &ctx.accounts.vault_operator_account,
            &ctx.accounts.seller_balance,
            &ctx.accounts.fee_recipient_balance,
            &ctx.accounts.darkpool_authority,
            fee_per_side,
            auth_seeds,
        )?;
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

// ============================================================
//   Manual Anchor CPI helpers (bypassing cpi:: typed wrappers)
// ============================================================

/// Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
fn anchor_discriminator(method_name: &str) -> [u8; 8] {
    let mut full_name = String::with_capacity(7 + method_name.len());
    full_name.push_str("global:");
    full_name.push_str(method_name);
    let h = hashv(&[full_name.as_bytes()]);
    let bytes = h.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

#[allow(clippy::too_many_arguments)]
fn invoke_engine_open_position<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    position: &UncheckedAccount<'info>,
    trader: &UncheckedAccount<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    darkpool_authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    // ---- engine vault remaining_accounts (v0.3.1 wiring) ----
    engine_authority: &UncheckedAccount<'info>,
    vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    engine_vault_operator: &UncheckedAccount<'info>,
    src_balance: &UncheckedAccount<'info>,        // mut
    engine_pool_balance: &UncheckedAccount<'info>, // mut
    size_delta: i64,
    fill_price: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8 + 8);
    data.extend_from_slice(&anchor_discriminator("open_position"));
    data.extend_from_slice(&size_delta.to_le_bytes());
    data.extend_from_slice(&fill_price.to_le_bytes());

    let ix = Instruction {
        program_id: perp_engine_program.key(),
        accounts: vec![
            // ---- Anchor-typed accounts ----
            AccountMeta::new_readonly(engine_config.key(), false),
            AccountMeta::new(engine_market.key(), false),
            AccountMeta::new(position.key(), false),
            AccountMeta::new_readonly(trader.key(), false),
            AccountMeta::new_readonly(engine_operator_account.key(), false),
            AccountMeta::new(darkpool_authority.key(), true), // signer + mut (payer)
            AccountMeta::new_readonly(system_program.key(), false),
            // ---- engine remaining_accounts (order from perp_engine open_position.rs file header) ----
            AccountMeta::new_readonly(engine_authority.key(), false),
            AccountMeta::new_readonly(vault_program.key(), false),
            AccountMeta::new_readonly(vault_config.key(), false),
            AccountMeta::new_readonly(engine_vault_operator.key(), false),
            AccountMeta::new(src_balance.key(), false),
            AccountMeta::new(engine_pool_balance.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            engine_config.to_account_info(),
            engine_market.to_account_info(),
            position.to_account_info(),
            trader.to_account_info(),
            engine_operator_account.to_account_info(),
            darkpool_authority.to_account_info(),
            system_program.clone(),
            // remaining
            engine_authority.to_account_info(),
            vault_program.to_account_info(),
            vault_config.to_account_info(),
            engine_vault_operator.to_account_info(),
            src_balance.to_account_info(),
            engine_pool_balance.to_account_info(),
            // program last
            perp_engine_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}

#[allow(clippy::too_many_arguments)]
fn invoke_vault_internal_transfer<'info>(
    perp_vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    from_balance: &UncheckedAccount<'info>,
    to_balance: &UncheckedAccount<'info>,
    darkpool_authority: &UncheckedAccount<'info>,
    amount: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_discriminator("internal_transfer"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: perp_vault_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(vault_config.key(), false),
            AccountMeta::new_readonly(vault_operator_account.key(), false),
            AccountMeta::new(from_balance.key(), false),
            AccountMeta::new(to_balance.key(), false),
            AccountMeta::new_readonly(darkpool_authority.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            vault_config.to_account_info(),
            vault_operator_account.to_account_info(),
            from_balance.to_account_info(),
            to_balance.to_account_info(),
            darkpool_authority.to_account_info(),
            perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
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
