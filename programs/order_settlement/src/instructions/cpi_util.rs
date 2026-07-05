use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

/// Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
pub fn anchor_discriminator(method_name: &str) -> [u8; 8] {
    let mut full_name = String::with_capacity(7 + method_name.len());
    full_name.push_str("global:");
    full_name.push_str(method_name);
    let h = hashv(&[full_name.as_bytes()]);
    let bytes = h.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

// ============================================================
//  perp_engine.open_position CPI
// ============================================================

#[allow(clippy::too_many_arguments)]
pub fn invoke_engine_open_position<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    position: &UncheckedAccount<'info>,
    trader: &AccountInfo<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    // ---- engine vault remaining_accounts (v0.3.1 wiring) ----
    engine_authority: &UncheckedAccount<'info>,
    vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    engine_vault_operator: &UncheckedAccount<'info>,
    src_balance: &UncheckedAccount<'info>,
    engine_pool_balance: &UncheckedAccount<'info>,
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
            AccountMeta::new(authority.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
            // ---- engine remaining_accounts (order: open_position.rs file header) ----
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
            trader.clone(),
            engine_operator_account.to_account_info(),
            authority.to_account_info(),
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

// ============================================================
//  perp_engine.reduce_position / close_position CPI
// ============================================================
// Both instructions share one account shape (per perp_engine
// reduce_position.rs / close_position.rs):
//   engine_config, market (mut), position (mut), operator_account,
//   operator (signer) — plus the same 6 vault remaining_accounts.
// `size_delta: Some(d)` dispatches reduce_position(d, fill_price);
// `None` dispatches close_position(fill_price) (exact full close).
// Unlike open_position these SETTLE outbound value (freed margin +
// realized PnL) back to trader_balance — routing voluntary reduces
// here is the fix for the stranded-margin High.

#[allow(clippy::too_many_arguments)]
pub fn invoke_engine_reduce_or_close<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    position: &UncheckedAccount<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
    // ---- engine vault remaining_accounts (v0.3.1 wiring) ----
    engine_authority: &UncheckedAccount<'info>,
    vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    engine_vault_operator: &UncheckedAccount<'info>,
    trader_balance: &UncheckedAccount<'info>,
    engine_pool_balance: &UncheckedAccount<'info>,
    size_delta: Option<i64>,
    fill_price: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8 + 8);
    match size_delta {
        Some(delta) => {
            data.extend_from_slice(&anchor_discriminator("reduce_position"));
            data.extend_from_slice(&delta.to_le_bytes());
            data.extend_from_slice(&fill_price.to_le_bytes());
        }
        None => {
            data.extend_from_slice(&anchor_discriminator("close_position"));
            data.extend_from_slice(&fill_price.to_le_bytes());
        }
    }

    let ix = Instruction {
        program_id: perp_engine_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(engine_config.key(), false),
            AccountMeta::new(engine_market.key(), false),
            AccountMeta::new(position.key(), false),
            AccountMeta::new_readonly(engine_operator_account.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
            // ---- engine remaining_accounts (order: reduce/close_position.rs file header) ----
            AccountMeta::new_readonly(engine_authority.key(), false),
            AccountMeta::new_readonly(vault_program.key(), false),
            AccountMeta::new_readonly(vault_config.key(), false),
            AccountMeta::new_readonly(engine_vault_operator.key(), false),
            AccountMeta::new(trader_balance.key(), false),
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
            engine_operator_account.to_account_info(),
            authority.to_account_info(),
            // remaining
            engine_authority.to_account_info(),
            vault_program.to_account_info(),
            vault_config.to_account_info(),
            engine_vault_operator.to_account_info(),
            trader_balance.to_account_info(),
            engine_pool_balance.to_account_info(),
            // program last
            perp_engine_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}

/// Raw read of a perp_engine `Position.size`: i64 LE at byte offset 73
/// (8 disc + 1 bump + 32 market_id + 32 trader). Returns 0 when the account
/// is not yet initialized — no position, so the trade is a fresh open.
pub fn read_position_size(position: &UncheckedAccount) -> i64 {
    match position.try_borrow_data() {
        Ok(data) if data.len() >= 81 => i64::from_le_bytes(data[73..81].try_into().unwrap()),
        _ => 0,
    }
}

// ============================================================
//  perp_vault.internal_transfer CPI
// ============================================================

#[allow(clippy::too_many_arguments)]
pub fn invoke_vault_internal_transfer<'info>(
    perp_vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    from_balance: &UncheckedAccount<'info>,
    to_balance: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
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
            AccountMeta::new_readonly(authority.key(), true),
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
            authority.to_account_info(),
            perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}
