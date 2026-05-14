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
//  perp_vault.internal_transfer CPI (from insurance_fund)
// ============================================================
//
// Mirrors order_settlement::cpi_util::invoke_vault_internal_transfer.
// Insurance fund signs as `insurance_fund_authority` PDA. Authority must be
// pre-registered as operator on perp_vault (one-time set_operator from
// vault owner).
//
// perp_vault::InternalTransfer accounts (order locked):
//   0. vault_config        (read)
//   1. operator_account    (read) — vault Operator PDA for the authority
//   2. from_balance        (mut)  — insurance_fund_authority's vault balance
//   3. to_balance          (mut)  — keeper's vault balance
//   4. operator            (signer) — insurance_fund_authority PDA

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
