// SIGNATURE-SCHEME DEVIATION FROM SOLIDITY (intentional, the only one)
//
// Solidity OrderSettlement.sol uses EIP-712 (secp256k1 + ecrecover). The BPF
// runtime has no equivalent of `ecrecover` in-program AND Solana wallets sign
// with ed25519, not secp256k1 — so a byte-for-byte port of the EIP-712 domain
// would force every trader to maintain a separate ECDSA secp256k1 keypair.
// We map EIP-712 → Solana's native ed25519 precompile + Sysvar<Instructions>:
//
//   1. Trader signs a CANONICAL message off-chain with their wallet's
//      ed25519 keypair. Layout (little-endian, fixed 137 bytes):
//
//        domain_separator (32) ||
//        trader (32) ||
//        market_id (32) ||
//        is_long (1) ||
//        size (8 LE) ||
//        price (8 LE) ||
//        nonce (8 LE) ||
//        expiry (8 LE) ||
//        signed_at (8 LE)
//
//   2. domain_separator = sha256(
//          b"SUR_OrderSettlement_v1" ||
//          program_id (32) ||
//          cluster_id (8 LE)
//      )
//
//      cluster_id locks the signature scope to a specific deployment;
//      program_id locks it to this program. Together they prevent
//      cross-program AND cross-cluster replay.
//
//   3. Verification splits across two ixs in the SAME tx: an
//      ed25519_program precompile ix natively verifies the signature, AND
//      our settle/commit ix walks Sysvar<Instructions> looking for that
//      precompile ix and asserts (signer pk, message bytes) match the
//      order being processed. The signature itself is implicitly verified
//      by the precompile and not echoed in our ix data, saving 64 bytes
//      per signature.
//
//   4. There is NO Solana equivalent of `ecrecover` callable from BPF.
//      The precompile + sysvar pattern is the canonical way Anchor docs
//      recommend for this exact problem.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    hash::{hash, hashv},
    sysvar::instructions::{self as sysvar_instructions, load_instruction_at_checked},
};

use crate::errors::OrderSettlementError;
use crate::state::SignedOrder;

pub const ORDER_MESSAGE_LEN: usize = 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8;

pub fn compute_domain_separator(program_id: &Pubkey, cluster_id: u64) -> [u8; 32] {
    let h = hashv(&[
        b"SUR_OrderSettlement_v1",
        program_id.as_ref(),
        &cluster_id.to_le_bytes(),
    ]);
    h.to_bytes()
}

pub fn build_order_message(
    order: &SignedOrder,
    domain_separator: &[u8; 32],
) -> [u8; ORDER_MESSAGE_LEN] {
    let mut msg = [0u8; ORDER_MESSAGE_LEN];
    let mut o = 0usize;
    msg[o..o + 32].copy_from_slice(domain_separator);
    o += 32;
    msg[o..o + 32].copy_from_slice(order.trader.as_ref());
    o += 32;
    msg[o..o + 32].copy_from_slice(&order.market_id);
    o += 32;
    msg[o] = if order.is_long { 1 } else { 0 };
    o += 1;
    msg[o..o + 8].copy_from_slice(&order.size.to_le_bytes());
    o += 8;
    msg[o..o + 8].copy_from_slice(&order.price.to_le_bytes());
    o += 8;
    msg[o..o + 8].copy_from_slice(&order.nonce.to_le_bytes());
    o += 8;
    msg[o..o + 8].copy_from_slice(&order.expiry.to_le_bytes());
    o += 8;
    msg[o..o + 8].copy_from_slice(&order.signed_at.to_le_bytes());
    o += 8;
    debug_assert_eq!(o, ORDER_MESSAGE_LEN);
    msg
}

pub fn order_digest(order: &SignedOrder, domain_separator: &[u8; 32]) -> [u8; 32] {
    let msg = build_order_message(order, domain_separator);
    hash(&msg).to_bytes()
}

pub fn verify_ed25519_for_order<'a>(
    instructions_sysvar: &AccountInfo<'a>,
    expected_signer: &Pubkey,
    expected_message: &[u8],
) -> Result<()> {
    require!(
        *instructions_sysvar.key == sysvar_instructions::ID,
        OrderSettlementError::AccountMismatch
    );

    let current_idx = sysvar_instructions::load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(OrderSettlementError::MissingEd25519Ix))?;

    let mut idx: i32 = current_idx as i32 - 1;
    while idx >= 0 {
        let ix = load_instruction_at_checked(idx as usize, instructions_sysvar)
            .map_err(|_| error!(OrderSettlementError::MissingEd25519Ix))?;

        if ix.program_id == ed25519_program::ID
            && ix_matches(&ix.data, expected_signer, expected_message)?
        {
            return Ok(());
        }
        idx -= 1;
    }

    Err(error!(OrderSettlementError::MissingEd25519Ix))
}

fn ix_matches(
    data: &[u8],
    expected_signer: &Pubkey,
    expected_message: &[u8],
) -> Result<bool> {
    if data.len() < 2 {
        return Ok(false);
    }
    let num_sigs = data[0] as usize;
    if num_sigs == 0 {
        return Ok(false);
    }
    // Each signature has a 14-byte SignatureOffsets entry starting at offset 2.
    for i in 0..num_sigs {
        let off = 2 + i * 14;
        if off + 14 > data.len() {
            return Ok(false);
        }
        let sig_offset = u16::from_le_bytes([data[off], data[off + 1]]) as usize;
        let sig_ix = u16::from_le_bytes([data[off + 2], data[off + 3]]);
        let pk_offset = u16::from_le_bytes([data[off + 4], data[off + 5]]) as usize;
        let pk_ix = u16::from_le_bytes([data[off + 6], data[off + 7]]);
        let msg_offset = u16::from_le_bytes([data[off + 8], data[off + 9]]) as usize;
        let msg_size = u16::from_le_bytes([data[off + 10], data[off + 11]]) as usize;
        let msg_ix = u16::from_le_bytes([data[off + 12], data[off + 13]]);

        if sig_ix != 0xFFFF || pk_ix != 0xFFFF || msg_ix != 0xFFFF {
            continue;
        }
        if sig_offset + 64 > data.len()
            || pk_offset + 32 > data.len()
            || msg_offset + msg_size > data.len()
        {
            continue;
        }
        let pk = &data[pk_offset..pk_offset + 32];
        let msg = &data[msg_offset..msg_offset + msg_size];
        if msg.len() != expected_message.len() {
            continue;
        }
        if pk == expected_signer.as_ref() && msg == expected_message {
            return Ok(true);
        }
    }
    Ok(false)
}
