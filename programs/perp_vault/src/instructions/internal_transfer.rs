use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::InternalTransferred;
use crate::state::*;

// ============================================================
//                    INTERNAL TRANSFER (operator-only)
// ============================================================
// Solidity: function internalTransfer(from, to, amount) onlyOperator whenNotPaused nonReentrant
//   - amount > 0, from/to != 0
//   - amount <= maxOperatorTransferPerTx
//   - C-5 fix: deduct from deposit balance first, overflow from collateral balance
//   - C-5 fix: credit deposit portion → deposit, collateral portion → collateral
//
// Anchor: explicit from_balance + to_balance accounts; operator must hold
// authorized Operator PDA.
//
// We do NOT port the unbounded batchInternalTransfer here — Solana account
// passing is fixed per ix, so a Solana-native batch needs remaining_accounts
// or address lookup tables. Saved for v0.2.X if a real settler needs it;
// v0.2 ships the per-tx variant which covers darkpool's atomic two-leg.

#[derive(Accounts)]
pub struct InternalTransfer<'info> {
    #[account(
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ VaultError::NotOperator,
    )]
    pub operator_account: Account<'info, Operator>,

    #[account(
        mut,
        seeds = [AccountBalance::SEED_PREFIX, from_balance.trader.as_ref()],
        bump = from_balance.bump,
    )]
    pub from_balance: Account<'info, AccountBalance>,

    #[account(
        mut,
        seeds = [AccountBalance::SEED_PREFIX, to_balance.trader.as_ref()],
        bump = to_balance.bump,
    )]
    pub to_balance: Account<'info, AccountBalance>,

    pub operator: Signer<'info>,
}

pub(crate) fn handler(ctx: Context<InternalTransfer>, amount: u64) -> Result<()> {
    let cfg = &ctx.accounts.vault_config;
    require!(!cfg.paused, VaultError::PausedError);
    require!(amount > 0, VaultError::ZeroAmount);

    // CRITICAL-1 fix (2026-07-21 audit): reject aliased from == to. Anchor does not
    // reject two `mut` account inputs that resolve to the same pubkey; a self-alias
    // would MINT funds via last-write-wins serialization of the two deserialized copies.
    require_keys_neq!(
        ctx.accounts.from_balance.key(),
        ctx.accounts.to_balance.key(),
        VaultError::SameAccount
    );

    let from = &mut ctx.accounts.from_balance;
    let to = &mut ctx.accounts.to_balance;
    require!(
        from.trader != Pubkey::default() && to.trader != Pubkey::default(),
        VaultError::ZeroAddress
    );

    if cfg.max_operator_transfer_per_tx > 0 {
        require!(
            amount <= cfg.max_operator_transfer_per_tx,
            VaultError::OperatorTransferTooLarge
        );
    }

    let total_bal = from
        .balance
        .checked_add(from.collateral_balance)
        .ok_or(VaultError::MathOverflow)?;
    require!(amount <= total_bal, VaultError::InsufficientBalance);

    // C-5: deduct from deposit balance first, then collateral.
    let (from_deposit, from_collateral) = if amount <= from.balance {
        let fd = amount;
        from.balance = from.balance - amount;
        (fd, 0u64)
    } else {
        let fd = from.balance;
        let fc = amount - from.balance;
        from.balance = 0;
        from.collateral_balance = from
            .collateral_balance
            .checked_sub(fc)
            .ok_or(VaultError::MathOverflow)?;
        (fd, fc)
    };

    // Credit: deposit portion → deposit, collateral portion → collateral.
    to.balance = to
        .balance
        .checked_add(from_deposit)
        .ok_or(VaultError::MathOverflow)?;
    if from_collateral > 0 {
        to.collateral_balance = to
            .collateral_balance
            .checked_add(from_collateral)
            .ok_or(VaultError::MathOverflow)?;
    }

    emit!(InternalTransferred {
        from: from.trader,
        to: to.trader,
        amount,
        operator: ctx.accounts.operator.key(),
    });

    Ok(())
}
