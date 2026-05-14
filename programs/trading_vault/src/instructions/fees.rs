use anchor_lang::prelude::*;

use crate::errors::TradingVaultError;
use crate::events::{ManagementFeeCollected, PerformanceFeeCollected};
use crate::instructions::cpi_util::invoke_vault_internal_transfer;
use crate::state::*;

/// Accrue management fee against `equity` for elapsed seconds.
/// Mirrors Solidity _accrueManagementFee, including:
///   - early-return + lastFeeAccrual stamp when feeBps==0 or totalShares==0
///   - early-return when elapsed==0
///   - fee = equity * feeBps * elapsed / (BPS * SECONDS_PER_YEAR)
///   - skip transfer when fee==0 or fee>=equity (prevents draining vault)
///   - manager receives fee directly via internal_transfer (NOT minted as
///     shares — Solidity uses internalTransfer too).
#[allow(clippy::too_many_arguments)]
pub fn accrue_management_fee<'info>(
    vault: &mut Account<'info, Vault>,
    equity: u64,
    now: i64,
    perp_vault_program: &UncheckedAccount<'info>,
    perp_vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    vault_balance: &UncheckedAccount<'info>,
    manager_balance: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
    auth_seeds: &[&[u8]],
) -> Result<u64> {
    if vault.management_fee_bps == 0 || vault.total_shares == 0 {
        vault.last_fee_accrual = now;
        return Ok(0);
    }
    let elapsed = now.saturating_sub(vault.last_fee_accrual);
    if elapsed <= 0 {
        return Ok(0);
    }

    let elapsed_u: u128 = elapsed as u128;
    let fee_u128 = (equity as u128)
        .checked_mul(vault.management_fee_bps as u128)
        .ok_or(TradingVaultError::MathOverflow)?
        .checked_mul(elapsed_u)
        .ok_or(TradingVaultError::MathOverflow)?
        / ((BPS as u128).checked_mul(SECONDS_PER_YEAR as u128).unwrap());
    let fee: u64 = fee_u128
        .try_into()
        .map_err(|_| TradingVaultError::MathOverflow)?;

    let mut paid = 0u64;
    if fee > 0 && fee < equity {
        invoke_vault_internal_transfer(
            perp_vault_program,
            perp_vault_config,
            vault_operator_account,
            vault_balance,
            manager_balance,
            authority,
            fee,
            auth_seeds,
        )?;
        emit!(ManagementFeeCollected {
            vault_id: vault.id,
            amount: fee,
        });
        paid = fee;
    }

    vault.last_fee_accrual = now;
    Ok(paid)
}

/// Collect performance fee if equity-per-share exceeds HWM. Mirrors
/// Solidity _collectPerformanceFee:
///   profit_per_share = eps - hwm
///   total_profit = profit_per_share * totalShares / SHARE_PRECISION
///   fee = total_profit * perfFeeBps / BPS
///   skip if fee==0 or fee>=equity. HWM updated to current eps in any case
///   we surfaced a positive profit_per_share.
#[allow(clippy::too_many_arguments)]
pub fn collect_performance_fee<'info>(
    vault: &mut Account<'info, Vault>,
    equity: u64,
    perp_vault_program: &UncheckedAccount<'info>,
    perp_vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    vault_balance: &UncheckedAccount<'info>,
    manager_balance: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
    auth_seeds: &[&[u8]],
) -> Result<u64> {
    if vault.performance_fee_bps == 0 || vault.total_shares == 0 {
        return Ok(0);
    }

    let eps_u128 = (equity as u128)
        .checked_mul(SHARE_PRECISION)
        .ok_or(TradingVaultError::MathOverflow)?
        / vault.total_shares;
    if eps_u128 <= vault.high_water_mark {
        return Ok(0);
    }

    let profit_per_share = eps_u128 - vault.high_water_mark;
    let total_profit_u128 = profit_per_share
        .checked_mul(vault.total_shares)
        .ok_or(TradingVaultError::MathOverflow)?
        / SHARE_PRECISION;
    let fee_u128 = total_profit_u128
        .checked_mul(vault.performance_fee_bps as u128)
        .ok_or(TradingVaultError::MathOverflow)?
        / (BPS as u128);
    let fee: u64 = fee_u128
        .try_into()
        .map_err(|_| TradingVaultError::MathOverflow)?;

    let mut paid = 0u64;
    if fee > 0 && (fee as u128) < equity as u128 {
        invoke_vault_internal_transfer(
            perp_vault_program,
            perp_vault_config,
            vault_operator_account,
            vault_balance,
            manager_balance,
            authority,
            fee,
            auth_seeds,
        )?;
        emit!(PerformanceFeeCollected {
            vault_id: vault.id,
            amount: fee,
        });
        paid = fee;
    }

    // Solidity always updates HWM after a positive profit_per_share (even
    // when fee zeroes out due to truncation). Preserve.
    vault.high_water_mark = eps_u128;
    Ok(paid)
}

/// Equity-per-share given current equity and total_shares.
/// Returns PRICE_PRECISION (1.0$) if total_shares == 0, mirroring Solidity.
pub fn equity_per_share(equity: u64, total_shares: u128) -> Result<u128> {
    if total_shares == 0 {
        return Ok(PRICE_PRECISION);
    }
    Ok((equity as u128)
        .checked_mul(SHARE_PRECISION)
        .ok_or(TradingVaultError::MathOverflow)?
        / total_shares)
}

/// Solidity _checkDrawdown — DEVIATION FROM SOURCE.
///
/// Solidity assigns paused=true and reverts. Solidity revert undoes state,
/// so the pause never actually persists across calls — the H-14 fix as
/// written in TradingVault.sol is dead code. On Solana, Anchor also rolls
/// back state on Err return.
///
/// To preserve the AUDIT INTENT (auto-pause + cooldown that persists),
/// we mutate paused + drawdown_paused_at and return Ok(true) instead of
/// Err. The caller in manager_open_position interprets `true` as "no
/// trade executed; vault is now paused". Manager sees a successful tx
/// with a VaultPauseChanged event, no position change.
pub fn check_drawdown(vault: &mut Account<Vault>, equity: u64, now: i64) -> Result<bool> {
    if vault.total_shares == 0 {
        return Ok(false);
    }
    let eps = equity_per_share(equity, vault.total_shares)?;
    let max_drop = vault
        .high_water_mark
        .checked_mul(vault.max_drawdown_bps as u128)
        .ok_or(TradingVaultError::MathOverflow)?
        / (BPS as u128);
    let threshold = vault.high_water_mark.saturating_sub(max_drop);

    if eps < threshold {
        vault.paused = true;
        vault.drawdown_paused_at = now;
        emit!(crate::events::VaultPauseChanged {
            vault_id: vault.id,
            is_paused: true,
        });
        return Ok(true);
    }
    Ok(false)
}
