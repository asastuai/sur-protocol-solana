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
//  perp_engine.open_position CPI (from auto_deleveraging)
// ============================================================
//
// Mirrors Solidity AutoDeleveraging.sol:174 — engine.openPosition(
//   marketId, trader, sizeDelta, markPrice
// ). On Solana the engine resolves market+position from passed PDAs and
// the ADL program signs as `adl_authority` PDA, which is pre-registered
// as an engine operator.
//
// Engine's OpenPosition Accounts struct (in order):
//   0. engine_config        (read)
//   1. market               (mut)
//   2. position             (mut, init_if_needed by engine for new traders;
//                              ADL only deleverages traders that already
//                              have positions, so this PDA must already exist)
//   3. trader               (read; identity only)
//   4. operator_account     (read)
//   5. operator             (signer, mut — payer for init_if_needed)
//   6. system_program       (read)
//
// Engine ALSO reads vault accounts via remaining_accounts (perp_engine::
// open_position.rs file header):
//   0. engine_authority     (read)
//   1. perp_vault_program   (read)
//   2. vault_config         (read)
//   3. vault_operator       (read)
//   4. trader_balance       (mut)
//   5. engine_pool_balance  (mut)
//
// ADL's "forced reduce" semantics: size_delta has OPPOSITE sign to the
// trader's current position, so engine recognizes it as a reduce and
// realizes PnL on that portion. No new margin is locked (the reduce path
// in engine::open_position computes additional_margin = required - old_margin,
// which on a partial close is negative; saturating_sub clamps to 0 and the
// vault CPI is skipped). On a FULL close it should also be 0.

#[allow(clippy::too_many_arguments)]
pub fn invoke_engine_open_position<'info>(
    perp_engine_program: &UncheckedAccount<'info>,
    engine_config: &UncheckedAccount<'info>,
    engine_market: &UncheckedAccount<'info>,
    position: &UncheckedAccount<'info>,
    trader: &UncheckedAccount<'info>,
    engine_operator_account: &UncheckedAccount<'info>,
    authority: &UncheckedAccount<'info>,
    system_program: &AccountInfo<'info>,
    vault_remaining: &[AccountInfo<'info>],
    size_delta: i64,
    fill_price: u64,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 8 + 8);
    data.extend_from_slice(&anchor_discriminator("open_position"));
    data.extend_from_slice(&size_delta.to_le_bytes());
    data.extend_from_slice(&fill_price.to_le_bytes());

    let mut accounts = vec![
        AccountMeta::new_readonly(engine_config.key(), false),
        AccountMeta::new(engine_market.key(), false),
        AccountMeta::new(position.key(), false),
        AccountMeta::new_readonly(trader.key(), false),
        AccountMeta::new_readonly(engine_operator_account.key(), false),
        AccountMeta::new(authority.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    // Forward vault remaining_accounts so engine's internal vault CPI fires
    // on margin paths. ADL-as-reduce path skips the vault CPI inside engine
    // (additional_margin == 0), but we still pass the accounts so the engine
    // does not crash on missing accounts and so tests verify they're wired.
    for (i, ai) in vault_remaining.iter().enumerate() {
        let is_writable = matches!(i, 4 | 5);
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
        position.to_account_info(),
        trader.to_account_info(),
        engine_operator_account.to_account_info(),
        authority.to_account_info(),
        system_program.clone(),
    ];
    for ai in vault_remaining {
        infos.push(ai.clone());
    }
    infos.push(perp_engine_program.to_account_info());

    invoke_signed(&ix, &infos, &[auth_seeds]).map_err(Into::into)
}
