use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;

use crate::errors::TradingVaultError;
use crate::state::MAX_VAULT_MARKETS;

// ============================================================
//  Equity calculation (on-chain, via remaining_accounts)
// ============================================================
// Solidity's TradingVault calls perpEngine.getAccountEquity(vaultAccount),
// which sums vault USDC balance + per-position (margin + unrealized PnL).
//
// On Solana, we recompute that on-chain by:
//   1) Reading the perp_vault AccountBalance PDA owned by the vault PDA.
//      equity_base = balance + collateral_balance (USDC, 6dp).
//   2) Walking remaining_accounts in (Position, Market) PAIRS. For each
//      pair: validate Position.trader == vault PDA, validate Market PDA
//      matches Position.market_id, then add (margin) + signed unrealized PnL
//      computed from Market.mark_price vs Position.entry_price.
//
// Mirror perp_engine pricing convention: SIZE_PRECISION = 1e8, PRICE_PRECISION
// = 1e6 (6dp USDC). PnL_per_unit = (mark - entry) for longs, (entry - mark)
// for shorts. PnL_USDC = pnl_per_unit * |size| / SIZE_PRECISION.
//
// Returns an i128 (can be negative on bad debt). Caller clamps to >=0
// (mirroring Solidity `equity > 0 ? uint256(equity) : 0`).

const ENGINE_SIZE_PRECISION: i128 = 100_000_000;

/// Field offsets inside perp_vault::AccountBalance after Anchor 8-byte discriminator:
///   bump:u8 (1) | trader:Pubkey (32) | balance:u64 (8) | collateral_balance:u64 (8)
const VAULT_BALANCE_TRADER_OFFSET: usize = 8 + 1;
const VAULT_BALANCE_BALANCE_OFFSET: usize = 8 + 1 + 32;
const VAULT_BALANCE_COLLATERAL_OFFSET: usize = 8 + 1 + 32 + 8;

/// Field offsets inside perp_engine::Position:
///   bump:u8 (1) | market_id:[u8;32] (32) | trader:Pubkey (32) | size:i64 (8)
///   | entry_price:u64 (8) | margin:u64 (8) | last_updated:i64 (8)
const POSITION_MARKET_ID_OFFSET: usize = 8 + 1;
const POSITION_TRADER_OFFSET: usize = 8 + 1 + 32;
const POSITION_SIZE_OFFSET: usize = 8 + 1 + 32 + 32;
const POSITION_ENTRY_PRICE_OFFSET: usize = 8 + 1 + 32 + 32 + 8;
const POSITION_MARGIN_OFFSET: usize = 8 + 1 + 32 + 32 + 8 + 8;

/// Field offsets inside perp_engine::Market:
///   bump:u8 (1) | market_id:[u8;32] (32) | active:bool (1)
///   | initial_margin_bps:u64 | maintenance_margin_bps:u64
///   | max_position_size:u64 | mark_price:u64 | ...
const MARKET_MARKET_ID_OFFSET: usize = 8 + 1;
const MARKET_MARK_PRICE_OFFSET: usize = 8 + 1 + 32 + 1 + 8 + 8 + 8;

pub fn read_vault_balance(
    vault_balance_acc: &AccountInfo,
    expected_program: Pubkey,
    expected_trader: Pubkey,
) -> Result<u64> {
    require!(
        vault_balance_acc.owner == &expected_program,
        TradingVaultError::InvalidEquity
    );
    let data = vault_balance_acc.try_borrow_data()?;
    if data.len() < VAULT_BALANCE_COLLATERAL_OFFSET + 8 {
        return Err(TradingVaultError::InvalidEquity.into());
    }
    let mut trader_bytes = [0u8; 32];
    trader_bytes.copy_from_slice(
        &data[VAULT_BALANCE_TRADER_OFFSET..VAULT_BALANCE_TRADER_OFFSET + 32],
    );
    let trader = Pubkey::new_from_array(trader_bytes);
    require!(trader == expected_trader, TradingVaultError::InvalidEquity);

    let mut bal_bytes = [0u8; 8];
    bal_bytes.copy_from_slice(
        &data[VAULT_BALANCE_BALANCE_OFFSET..VAULT_BALANCE_BALANCE_OFFSET + 8],
    );
    let balance = u64::from_le_bytes(bal_bytes);

    let mut col_bytes = [0u8; 8];
    col_bytes.copy_from_slice(
        &data[VAULT_BALANCE_COLLATERAL_OFFSET..VAULT_BALANCE_COLLATERAL_OFFSET + 8],
    );
    let collateral = u64::from_le_bytes(col_bytes);

    balance
        .checked_add(collateral)
        .ok_or_else(|| TradingVaultError::MathOverflow.into())
}

/// Compute total vault equity including unrealized PnL on open positions.
/// `remaining` must be passed as (Position, Market) pairs where Market
/// matches Position.market_id and Position.trader == vault PDA.
/// Pre-existing AccountBalance for an empty vault may not exist yet; if
/// the AccountBalance is uninitialized (data_is_empty), treat balance as 0.
pub fn compute_vault_equity<'info>(
    vault_balance_acc: &AccountInfo<'info>,
    remaining: &[AccountInfo<'info>],
    perp_vault_program: Pubkey,
    perp_engine_program: Pubkey,
    vault_pda: Pubkey,
    registered_markets: &[u8],
) -> Result<u64> {
    let base: i128 = if vault_balance_acc.data_is_empty()
        || vault_balance_acc.owner == &solana_program::system_program::ID
    {
        0
    } else {
        read_vault_balance(vault_balance_acc, perp_vault_program, vault_pda)? as i128
    };

    require!(remaining.len() % 2 == 0, TradingVaultError::InvalidEquity);
    let pair_count = remaining.len() / 2;
    let registered_count = registered_markets.len() / 32;

    // CRITICAL-1 fix (2026-07-21 audit): the passed (Position, Market) set must EXACTLY
    // equal the vault's registered open-market set — no omissions (hide losing positions)
    // and no duplicates (double-count winners). Either lets a depositor/withdrawer forge
    // equity. Count-match + per-market membership + de-dup together force a bijection.
    require!(
        registered_count <= MAX_VAULT_MARKETS,
        TradingVaultError::IncompletePositionSet
    );
    require!(
        pair_count == registered_count,
        TradingVaultError::IncompletePositionSet
    );

    let mut seen: [[u8; 32]; MAX_VAULT_MARKETS] = [[0u8; 32]; MAX_VAULT_MARKETS];
    let mut seen_count = 0usize;

    let mut equity = base;
    let mut i = 0usize;
    while i < remaining.len() {
        let position_acc = &remaining[i];
        let market_acc = &remaining[i + 1];

        require!(
            position_acc.owner == &perp_engine_program,
            TradingVaultError::InvalidEquity
        );
        require!(
            market_acc.owner == &perp_engine_program,
            TradingVaultError::InvalidEquity
        );

        let pdata = position_acc.try_borrow_data()?;
        let mdata = market_acc.try_borrow_data()?;
        if pdata.len() < POSITION_MARGIN_OFFSET + 8 {
            return Err(TradingVaultError::InvalidEquity.into());
        }
        if mdata.len() < MARKET_MARK_PRICE_OFFSET + 8 {
            return Err(TradingVaultError::InvalidEquity.into());
        }

        let mut pos_market_id = [0u8; 32];
        pos_market_id.copy_from_slice(
            &pdata[POSITION_MARKET_ID_OFFSET..POSITION_MARKET_ID_OFFSET + 32],
        );
        let mut market_id = [0u8; 32];
        market_id.copy_from_slice(
            &mdata[MARKET_MARKET_ID_OFFSET..MARKET_MARKET_ID_OFFSET + 32],
        );
        require!(pos_market_id == market_id, TradingVaultError::InvalidEquity);

        // CRITICAL-1 fix: this market must be in the vault registry, and not already
        // counted in this call (reject a duplicated winner).
        let mut registered = false;
        for k in 0..registered_count {
            if &registered_markets[k * 32..k * 32 + 32] == &market_id[..] {
                registered = true;
                break;
            }
        }
        require!(registered, TradingVaultError::UnregisteredPosition);
        for s in 0..seen_count {
            require!(seen[s] != market_id, TradingVaultError::DuplicatePosition);
        }
        seen[seen_count] = market_id;
        seen_count += 1;

        let mut trader_bytes = [0u8; 32];
        trader_bytes.copy_from_slice(
            &pdata[POSITION_TRADER_OFFSET..POSITION_TRADER_OFFSET + 32],
        );
        let pos_trader = Pubkey::new_from_array(trader_bytes);
        require!(pos_trader == vault_pda, TradingVaultError::InvalidEquity);

        let mut size_bytes = [0u8; 8];
        size_bytes.copy_from_slice(&pdata[POSITION_SIZE_OFFSET..POSITION_SIZE_OFFSET + 8]);
        let size = i64::from_le_bytes(size_bytes);

        let mut entry_bytes = [0u8; 8];
        entry_bytes.copy_from_slice(
            &pdata[POSITION_ENTRY_PRICE_OFFSET..POSITION_ENTRY_PRICE_OFFSET + 8],
        );
        let entry = u64::from_le_bytes(entry_bytes);

        let mut margin_bytes = [0u8; 8];
        margin_bytes.copy_from_slice(&pdata[POSITION_MARGIN_OFFSET..POSITION_MARGIN_OFFSET + 8]);
        let margin = u64::from_le_bytes(margin_bytes);

        let mut mark_bytes = [0u8; 8];
        mark_bytes.copy_from_slice(
            &mdata[MARKET_MARK_PRICE_OFFSET..MARKET_MARK_PRICE_OFFSET + 8],
        );
        let mark = u64::from_le_bytes(mark_bytes);

        let abs_size = (size as i128).unsigned_abs() as i128;
        let pnl_per_unit: i128 = if size > 0 {
            (mark as i128) - (entry as i128)
        } else if size < 0 {
            (entry as i128) - (mark as i128)
        } else {
            0
        };
        let pnl = pnl_per_unit
            .checked_mul(abs_size)
            .ok_or(TradingVaultError::MathOverflow)?
            / ENGINE_SIZE_PRECISION;

        equity = equity
            .checked_add(margin as i128)
            .ok_or(TradingVaultError::MathOverflow)?
            .checked_add(pnl)
            .ok_or(TradingVaultError::MathOverflow)?;

        i += 2;
    }

    if equity < 0 {
        Ok(0)
    } else {
        u64::try_from(equity).map_err(|_| TradingVaultError::MathOverflow.into())
    }
}

// Pack import is unused; kept for future Token-2022 reads.
#[allow(dead_code)]
fn _unused_pack() -> usize {
    <anchor_spl::token::spl_token::state::Account as Pack>::LEN
}

// solana_program is re-exported by anchor_lang.
use anchor_lang::solana_program;
