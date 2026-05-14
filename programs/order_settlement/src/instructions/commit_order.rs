use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;

use crate::errors::OrderSettlementError;
use crate::events::OrderCommitted;
use crate::signature::{build_order_message, order_digest, verify_ed25519_for_order};
use crate::state::*;

// ============================================================
//                    COMMIT ORDER — operator-only
// ============================================================
//
// Operator commits an order's digest hash + verifies its ed25519 signature
// once (so settle can trust the snapshot binding). Captures current settle
// params for Mapping 3 prospective semantics. The caller passes the digest
// as the first instruction arg so it can be used as the snapshot PDA seed
// (Anchor seeds don't allow function calls); the handler recomputes the
// digest from the order data and asserts equality. Idempotent: re-commit
// of a digest is a no-op.

#[derive(Accounts)]
#[instruction(commit_hash: [u8; 32], order: SignedOrder)]
pub struct CommitOrder<'info> {
    #[account(
        seeds = [OrderSettlementConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, OrderSettlementConfig>>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ OrderSettlementError::NotOperator,
    )]
    pub operator_account: Box<Account<'info, Operator>>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = operator,
        space = OrderSnapshot::SIZE,
        seeds = [OrderSnapshot::SEED_PREFIX, commit_hash.as_ref()],
        bump,
    )]
    pub snapshot: Account<'info, OrderSnapshot>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn commit_order(
    ctx: Context<CommitOrder>,
    commit_hash: [u8; 32],
    order: SignedOrder,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, OrderSettlementError::PausedError);

    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    let domain_sep = cfg.domain_separator;

    // Caller-supplied commit_hash MUST equal the digest of the order under
    // this program's domain separator.
    let computed = order_digest(&order, &domain_sep);
    require!(computed == commit_hash, OrderSettlementError::CommitHashMismatch);

    let msg = build_order_message(&order, &domain_sep);
    verify_ed25519_for_order(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &order.trader,
        &msg,
    )?;

    let snap = &mut ctx.accounts.snapshot;
    if snap.commit_time != 0 {
        // Already committed — idempotent. Hash should already match (PDA seed
        // binding) but assert defensively.
        require!(
            snap.commit_hash == commit_hash,
            OrderSettlementError::CommitHashMismatch
        );
        return Ok(());
    }

    snap.bump = ctx.bumps.snapshot;
    snap.commit_hash = commit_hash;
    snap.commit_time = now;
    snap.maker_fee_bps = cfg.maker_fee_bps;
    snap.taker_fee_bps = cfg.taker_fee_bps;
    snap.min_settlement_delay = cfg.min_settlement_delay;
    snap.dynamic_spread_enabled = cfg.dynamic_spread_enabled;
    snap.spread_tier_1_bps = cfg.spread_tier_1_bps;
    snap.spread_tier_2_bps = cfg.spread_tier_2_bps;
    snap.spread_tier_3_bps = cfg.spread_tier_3_bps;

    emit!(OrderCommitted {
        commit_hash,
        commit_time: now,
    });
    Ok(())
}
