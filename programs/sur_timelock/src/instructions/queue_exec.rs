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
    accounts_hash: [u8; 32],
) -> Result<()> {
    use anchor_lang::solana_program::hash::hashv;

    // H-9 fix: bind the PDA identity (tx_hash, the seed) to the actual payload,
    // so a queued entry can NEVER be executed with a different target / data /
    // accounts than what was committed at queue time.
    let expected = hashv(&[target.as_ref(), &instruction_hash, &accounts_hash]).to_bytes();
    require!(tx_hash == expected, TimelockError::InvalidTxHash);

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
    q.accounts_hash = accounts_hash;
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

    /// CHECK: timelock_authority PDA — the signer for the dispatched CPI.
    #[account(
        seeds = [TimelockConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,
    // remaining_accounts: [0] = target program account, [1..] = the dispatched
    // instruction's accounts (with their signer/writable flags).
}

// C-3 fix: real dynamic dispatch. After the delay+grace window, reconstruct the
// queued instruction from the caller-supplied `instruction_data` + remaining
// accounts, verify both against the commitments stored at queue time, then
// `invoke_signed` it as the timelock_authority PDA. This is the Solana analog of
// Solidity's `target.call(data)` — the delay is now actually enforced on the
// underlying action, not just on a state-tracking PDA.
pub(crate) fn execute_transaction(
    ctx: Context<ExecuteTransaction>,
    instruction_data: Vec<u8>,
) -> Result<()> {
    use anchor_lang::solana_program::{
        hash::hash,
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    };

    let q = &ctx.accounts.queued;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(now >= q.eta, TimelockError::TxNotReady);
    require!(now <= q.eta + GRACE_PERIOD, TimelockError::TxExpired);

    // remaining_accounts[0] = target program; [1..] = the dispatched ix accounts.
    require!(!ctx.remaining_accounts.is_empty(), TimelockError::InvalidTarget);
    let target_program = &ctx.remaining_accounts[0];
    require!(
        target_program.key() == q.target,
        TimelockError::InvalidTarget
    );
    let ix_accounts = &ctx.remaining_accounts[1..];

    // Verify the dispatched payload matches the queued commitments (H-9 binding).
    require!(
        hash(&instruction_data).to_bytes() == q.instruction_hash,
        TimelockError::InstructionHashMismatch
    );
    // Only the timelock_authority PDA signs the dispatched ix; every other account
    // is a non-signer. is_signer is therefore derived deterministically here (NOT
    // trusted from how the executor passed the account), and the commitment uses
    // the same rule, so the executor cannot smuggle in an extra signer.
    let auth_key = ctx.accounts.authority.key();
    let mut acc_blob: Vec<u8> = Vec::with_capacity(ix_accounts.len() * 34);
    for a in ix_accounts.iter() {
        let is_signer = a.key() == auth_key;
        acc_blob.extend_from_slice(a.key.as_ref());
        acc_blob.push(is_signer as u8);
        acc_blob.push(a.is_writable as u8);
    }
    require!(
        hash(&acc_blob).to_bytes() == q.accounts_hash,
        TimelockError::AccountsHashMismatch
    );

    // Build + dispatch, signed by the timelock_authority PDA.
    let metas: Vec<AccountMeta> = ix_accounts
        .iter()
        .map(|a| AccountMeta {
            pubkey: *a.key,
            is_signer: a.key() == auth_key,
            is_writable: a.is_writable,
        })
        .collect();
    let ix = Instruction {
        program_id: q.target,
        accounts: metas,
        data: instruction_data,
    };

    let auth_bump = ctx.accounts.config.authority_bump;
    let auth_seeds: &[&[u8]] =
        &[TimelockConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    let mut infos: Vec<AccountInfo> = Vec::with_capacity(ix_accounts.len() + 1);
    infos.push(target_program.clone());
    infos.extend(ix_accounts.iter().cloned());

    invoke_signed(&ix, &infos, &[auth_seeds])?;

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
