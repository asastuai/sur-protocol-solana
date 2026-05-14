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
//  perp_engine.liquidate_position CPI (from liquidator)
// ============================================================
//
// Mirrors Solidity Liquidator.sol:53 — engine.liquidatePosition(marketId, trader, msg.sender).
// On Solana, engine resolves market+trader from passed PDAs and the liquidator
// program signs as `liquidator_authority` PDA, which is pre-registered as an
// engine operator (one-time set_operator from engine owner).
//
// Engine's LiquidatePosition Accounts struct (in order):
//   0. engine_config        (read)
//   1. market               (mut)
//   2. position             (mut)
//   3. operator_account     (read)
//   4. operator             (signer)
//
// Engine ALSO reads vault accounts via remaining_accounts (see
// perp_engine::liquidate_position.rs file header). Liquidator forwards those
// 7 accounts unchanged so engine's internal vault CPI fires:
//   0. engine_authority     (read)  — engine's PDA
//   1. perp_vault_program   (read)
//   2. vault_config         (read)
//   3. vault_operator       (read)  — operator PDA derived from engine_authority
//   4. keeper_balance       (mut)
//   5. engine_pool_balance  (mut)
//   6. insurance_fund_balance (mut)

#[allow(clippy::too_many_arguments)]
pub fn invoke_engine_liquidate_position<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    engine_position: &UncheckedAccount<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    liquidator_authority: &UncheckedAccount<'info>,
    vault_remaining: &[AccountInfo<'info>],
    auth_seeds: &[&[u8]],
) -> Result<()> {
    // engine.liquidate_position takes no args
    let mut data = Vec::with_capacity(8);
    data.extend_from_slice(&anchor_discriminator("liquidate_position"));

    let mut accounts = vec![
        AccountMeta::new_readonly(engine_config.key(), false),
        AccountMeta::new(engine_market.key(), false),
        AccountMeta::new(engine_position.key(), false),
        AccountMeta::new_readonly(engine_operator_account.key(), false),
        AccountMeta::new_readonly(liquidator_authority.key(), true), // signer
    ];

    // Forward vault remaining_accounts so engine's internal vault CPI fires.
    // Order documented in engine::liquidate_position.rs file header (file:24-33).
    // [0]=engine_authority (read), [1]=vault_program (read), [2]=vault_config (read),
    // [3]=vault_operator (read), [4]=keeper_balance (mut), [5]=engine_pool_balance (mut),
    // [6]=insurance_fund_balance (mut).
    for (i, ai) in vault_remaining.iter().enumerate() {
        let is_writable = matches!(i, 4 | 5 | 6);
        if is_writable {
            accounts.push(AccountMeta::new(ai.key(), false));
        } else {
            accounts.push(AccountMeta::new_readonly(ai.key(), false));
        }
    }

    let ix = Instruction {
        program_id: perp_engine_program.key(),
        accounts,
        data,
    };

    let mut infos: Vec<AccountInfo<'info>> = vec![
        engine_config.to_account_info(),
        engine_market.to_account_info(),
        engine_position.to_account_info(),
        engine_operator_account.to_account_info(),
        liquidator_authority.to_account_info(),
    ];
    for ai in vault_remaining {
        infos.push(ai.clone());
    }
    infos.push(perp_engine_program.to_account_info());

    invoke_signed(&ix, &infos, &[auth_seeds]).map_err(Into::into)
}
