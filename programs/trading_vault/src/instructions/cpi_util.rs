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
//  perp_vault.internal_transfer CPI
// ============================================================
// account order (per perp_vault::instructions::internal_transfer::InternalTransfer):
//   vault_config, operator_account, from_balance (mut), to_balance (mut), operator (signer)

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

// ============================================================
//  perp_vault.credit_collateral / debit_collateral CPI
// ============================================================
// account order (per perp_vault::instructions::collateral::CollateralOp):
//   vault_config (mut), operator_account, trader_balance (mut, init_if_needed),
//   trader (UncheckedAccount), operator (signer + mut, payer), system_program

#[allow(clippy::too_many_arguments)]
pub fn invoke_vault_credit_collateral<'info>(
    perp_vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    trader_balance: &UncheckedAccount<'info>,
    trader: &AccountInfo<'info>,
    authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_discriminator("credit_collateral"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: perp_vault_program.key(),
        accounts: vec![
            AccountMeta::new(vault_config.key(), false),
            AccountMeta::new_readonly(vault_operator_account.key(), false),
            AccountMeta::new(trader_balance.key(), false),
            AccountMeta::new_readonly(trader.key(), false),
            AccountMeta::new(authority.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            vault_config.to_account_info(),
            vault_operator_account.to_account_info(),
            trader_balance.to_account_info(),
            trader.clone(),
            authority.to_account_info(),
            system_program.clone(),
            perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}

#[allow(clippy::too_many_arguments)]
pub fn invoke_vault_debit_collateral<'info>(
    perp_vault_program: &UncheckedAccount<'info>,
    vault_config: &UncheckedAccount<'info>,
    vault_operator_account: &UncheckedAccount<'info>,
    trader_balance: &UncheckedAccount<'info>,
    trader: &AccountInfo<'info>,
    authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_discriminator("debit_collateral"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: perp_vault_program.key(),
        accounts: vec![
            AccountMeta::new(vault_config.key(), false),
            AccountMeta::new_readonly(vault_operator_account.key(), false),
            AccountMeta::new(trader_balance.key(), false),
            AccountMeta::new_readonly(trader.key(), false),
            AccountMeta::new(authority.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            vault_config.to_account_info(),
            vault_operator_account.to_account_info(),
            trader_balance.to_account_info(),
            trader.clone(),
            authority.to_account_info(),
            system_program.clone(),
            perp_vault_program.to_account_info(),
        ],
        &[auth_seeds],
    )
    .map_err(Into::into)
}

// ============================================================
//  perp_engine.open_position CPI
// ============================================================
// account order (per perp_engine::instructions::open_position::OpenPosition):
//   engine_config, market (mut), position (mut, init_if_needed),
//   trader, operator_account, operator (signer + mut, payer), system_program

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
//  perp_engine.close_position CPI
// ============================================================
// account order (per perp_engine::instructions::close_position::ClosePosition):
//   engine_config, market (mut), position (mut), operator_account, operator (signer)

#[allow(clippy::too_many_arguments)]
pub fn invoke_engine_close_position<'info>(
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
    src_balance: &UncheckedAccount<'info>, // trader_balance (PnL settles here)
    engine_pool_balance: &UncheckedAccount<'info>,
    fill_price: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8);
    data.extend_from_slice(&anchor_discriminator("close_position"));
    data.extend_from_slice(&fill_price.to_le_bytes());

    let ix = Instruction {
        program_id: perp_engine_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(engine_config.key(), false),
            AccountMeta::new(engine_market.key(), false),
            AccountMeta::new(position.key(), false),
            AccountMeta::new_readonly(engine_operator_account.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
            // ---- engine remaining_accounts (order: close_position.rs file header) ----
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
            engine_operator_account.to_account_info(),
            authority.to_account_info(),
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
