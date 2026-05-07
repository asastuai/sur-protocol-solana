use anchor_lang::prelude::*;

use crate::errors::TimelockError;
use crate::events::{EmergencyPause, TxCancelled, TxExecuted, TxQueued};
use crate::state::*;

// ============================================================
//                    QUEUE TRANSACTION
// ============================================================
// Owner queues a future operation by hash. Hash is keccak(target,
// instruction_data, eta) — caller computes off-chain and passes in.
// PDA seed includes tx_hash so re-queueing the same op fails.

#[derive(Accounts)]
#[instruction(tx_hash: [u8; 32])]
pub struct QueueTransaction<'info> {
    #[account(
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
        has_one = owner @ TimelockError::NotOwner,
    )]
    pub config: Account<'info, TimelockConfig>,

    #[account(
        init,
        payer = owner,
        space = QueuedTx::SIZE,
        seeds = [QueuedTx::SEED_PREFIX, &tx_hash],
        bump,
    )]
    pub queued: Account<'info, QueuedTx>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn queue_transaction(
    ctx: Context<QueueTransaction>,
    tx_hash: [u8; 32],
    target: Pubkey,
    instruction_hash: [u8; 32],
) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let clock = Clock::get()?;
    let eta = clock
        .unix_timestamp
        .checked_add(cfg.delay)
        .ok_or(TimelockError::MathOverflow)?;

    let q = &mut ctx.accounts.queued;
    q.bump = ctx.bumps.queued;
    q.tx_hash = tx_hash;
    q.target = target;
    q.instruction_hash = instruction_hash;
    q.eta = eta;
    q.queued_by = ctx.accounts.owner.key();

    emit!(TxQueued {
        tx_hash,
        target,
        eta,
        queued_by: q.queued_by,
    });

    Ok(())
}

// ============================================================
//                    EXECUTE TRANSACTION
// ============================================================
// Solidity: `(success, returnData) = target.call{value}(data)` — generic
// dynamic dispatch. Solana: invoke_signed needs accounts list at compile
// time, so v0.2 ships state-tracking only (closes the QueuedTx PDA after
// delay + grace check). Wiring the actual CPI dispatch goes in v0.3 once
// each managed program has a known instruction layout that timelock
// understands.
//
// The owner remains responsible for issuing the underlying ix in a
// separate tx — but only AFTER execute_transaction succeeds (which proves
// the delay was honored). Off-chain orchestration assembles the bundle.

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account(
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
        has_one = owner @ TimelockError::NotOwner,
    )]
    pub config: Account<'info, TimelockConfig>,

    #[account(
        mut,
        close = owner,
        seeds = [QueuedTx::SEED_PREFIX, &queued.tx_hash],
        bump = queued.bump,
    )]
    pub queued: Account<'info, QueuedTx>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub(crate) fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
    let q = &ctx.accounts.queued;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(now >= q.eta, TimelockError::TxNotReady);
    require!(now <= q.eta + GRACE_PERIOD, TimelockError::TxExpired);

    emit!(TxExecuted {
        tx_hash: q.tx_hash,
        target: q.target,
        executed_by: ctx.accounts.owner.key(),
    });
    // PDA closes via `close = owner` constraint.

    Ok(())
}

// ============================================================
//                    CANCEL TRANSACTION
// ============================================================

#[derive(Accounts)]
pub struct CancelTransaction<'info> {
    #[account(
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
        has_one = owner @ TimelockError::NotOwner,
    )]
    pub config: Account<'info, TimelockConfig>,

    #[account(
        mut,
        close = owner,
        seeds = [QueuedTx::SEED_PREFIX, &queued.tx_hash],
        bump = queued.bump,
    )]
    pub queued: Account<'info, QueuedTx>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub(crate) fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
    let q = &ctx.accounts.queued;
    emit!(TxCancelled {
        tx_hash: q.tx_hash,
    });
    Ok(())
}

// ============================================================
//                    EMERGENCY PAUSE (guardian-only)
// ============================================================
// v0.2: state-tracking + event emission. Actual CPI to target.pause()
// lands when the targets are known programs in this workspace (v0.3).

#[derive(Accounts)]
pub struct EmergencyPauseAction<'info> {
    #[account(
        seeds = [TimelockConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, TimelockConfig>,

    #[account(
        seeds = [PausableTarget::SEED_PREFIX, pausable_target.target.as_ref()],
        bump = pausable_target.bump,
        constraint = pausable_target.status @ TimelockError::InvalidPauseTarget,
    )]
    pub pausable_target: Account<'info, PausableTarget>,

    pub guardian: Signer<'info>,
}

pub(crate) fn emergency_pause(ctx: Context<EmergencyPauseAction>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(
        ctx.accounts.guardian.key() == cfg.guardian,
        TimelockError::NotGuardian
    );

    emit!(EmergencyPause {
        guardian: cfg.guardian,
        target: ctx.accounts.pausable_target.target,
    });

    Ok(())
}
