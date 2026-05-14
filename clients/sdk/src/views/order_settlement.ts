import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import nacl from "tweetnacl";

/**
 * SUR Protocol — order_settlement signing helpers.
 *
 * Implements the canonical ed25519 message format used by `order_settlement`
 * to verify trader-signed orders on Solana. This deviates from the EVM
 * EIP-712 scheme (Solana lacks ecrecover in BPF and wallets sign ed25519);
 * the message layout commits the same fields plus signed_at and is bound
 * to a specific (program_id, cluster_id) via the domain separator.
 *
 * Message layout (137 bytes total):
 *   domain_separator (32) ||
 *   trader (32)            ||
 *   market_id (32)         ||
 *   is_long (1)            ||
 *   size (8 LE)            ||
 *   price (8 LE)           ||
 *   nonce (8 LE)           ||
 *   expiry (8 LE i64)      ||
 *   signed_at (8 LE i64)
 *
 * Domain separator:
 *   sha256(b"SUR_OrderSettlement_v1" || program_id (32) || cluster_id (8 LE))
 */

export interface SignedOrderInput {
  trader: PublicKey;
  marketId: Uint8Array;        // 32 bytes
  isLong: boolean;
  size: bigint;                // u64
  price: bigint;               // u64
  nonce: bigint;               // u64
  expiry: bigint;              // i64 (positive)
  signedAt: bigint;            // i64 (positive)
}

export interface SignedOrderFull extends SignedOrderInput {
  signature: Uint8Array;       // 64 bytes
}

export const ORDER_MESSAGE_LEN = 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8;

export function domainSeparator(
  programId: PublicKey,
  clusterId: bigint,
): Buffer {
  const h = createHash("sha256");
  h.update(Buffer.from("SUR_OrderSettlement_v1", "utf8"));
  h.update(programId.toBuffer());
  const cid = Buffer.alloc(8);
  cid.writeBigUInt64LE(clusterId, 0);
  h.update(cid);
  return h.digest();
}

export function buildOrderMessage(
  order: SignedOrderInput,
  domainSep: Buffer,
): Buffer {
  if (domainSep.length !== 32) throw new Error("domainSep must be 32 bytes");
  if (order.marketId.length !== 32)
    throw new Error("marketId must be 32 bytes");

  const out = Buffer.alloc(ORDER_MESSAGE_LEN);
  let o = 0;
  domainSep.copy(out, o);
  o += 32;
  out.set(order.trader.toBytes(), o);
  o += 32;
  out.set(order.marketId, o);
  o += 32;
  out.writeUInt8(order.isLong ? 1 : 0, o);
  o += 1;
  out.writeBigUInt64LE(order.size, o);
  o += 8;
  out.writeBigUInt64LE(order.price, o);
  o += 8;
  out.writeBigUInt64LE(order.nonce, o);
  o += 8;
  out.writeBigInt64LE(order.expiry, o);
  o += 8;
  out.writeBigInt64LE(order.signedAt, o);
  o += 8;
  return out;
}

export function orderDigest(
  order: SignedOrderInput,
  domainSep: Buffer,
): Buffer {
  const msg = buildOrderMessage(order, domainSep);
  return createHash("sha256").update(msg).digest();
}

export function signOrder(
  order: SignedOrderInput,
  signerKey: Uint8Array,           // 64-byte secret key (nacl format)
  domainSep: Buffer,
): { message: Buffer; signature: Buffer; digest: Buffer; full: SignedOrderFull } {
  const message = buildOrderMessage(order, domainSep);
  const signature = Buffer.from(nacl.sign.detached(message, signerKey));
  const digest = createHash("sha256").update(message).digest();
  return {
    message,
    signature,
    digest,
    full: { ...order, signature },
  };
}
