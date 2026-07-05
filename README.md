# SUR Protocol — Solana

Agent-native perpetual futures DEX: on-chain perp engine, agent-to-agent dark pool with persistent reputation, pooled trading vaults, signed-order settlement with commit-reveal MEV protection, and **Proof-of-Context settlement gating** (trades only clear against fresh canonical state).

Full port of [SUR Protocol](https://github.com/asastuai/sur-protocol) (Solidity on Base L2, 12 contracts, 531 Foundry tests) to Anchor/Solana — mechanical port preserving audited behaviour, followed by an internal security audit and remediation round on the Solana side.

## Status: live on devnet

**All 11 programs are deployed, initialized and operating on Solana devnet** (since 2026-06-30): 34-step bootstrap, 3 markets (BTC-USD, SOL-USD, ETH-USD), test USDC mint, cross-program operator wiring, funded settlement pools.

| Program | Devnet address |
|---|---|
| `perp_engine` | [`BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2`](https://explorer.solana.com/address/BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2?cluster=devnet) |
| `perp_vault` | [`HDS6P815i9ZTCriGVMxvvTAY5bkToTSf8XGfPKjSpCxQ`](https://explorer.solana.com/address/HDS6P815i9ZTCriGVMxvvTAY5bkToTSf8XGfPKjSpCxQ?cluster=devnet) |
| `a2a_darkpool` | [`3jPooLaiWoq5DA4SeXMfP4MT4hrp6X1zrASD9hcYqKke`](https://explorer.solana.com/address/3jPooLaiWoq5DA4SeXMfP4MT4hrp6X1zrASD9hcYqKke?cluster=devnet) |
| `oracle_router` | [`D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx`](https://explorer.solana.com/address/D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx?cluster=devnet) |
| `order_settlement` | [`8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ`](https://explorer.solana.com/address/8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ?cluster=devnet) |
| `collateral_manager` | `CzsxUSohWydLesZ2nfAa7WqpiZfWhZkWUHhBMkFS29VU` |
| `trading_vault` | `aMYTJ33dzuTXXHpRSAp9UsR5jogu7sdJUDtVrSx9bjT` |
| `insurance_fund` | `3p6HGqQmLB6fBQ3kQE1hQ3xPCLD2Bn4RPbHUwJD4HyV9` |
| `liquidator` | `8aerVEjWfL65UtdTTLSYJmrNp2uabou8ySjdLw8BXD5p` |
| `auto_deleveraging` | `6rg7CTKmrsxWLxRPApT9gkidE8i3aqJKf8AKCVgbENRf` |
| `sur_timelock` | `8VRBi4s3D12Y7sbUYLSmsCGLDnj6xAVSNL1KfhYiCnUw` |

Coverage: **100+ cross-program integration tests** (every CPI chain exercised end-to-end on a local validator, including security regressions and failure modes).

## What each program does

| Program | Role |
|---|---|
| `perp_engine` | Positions, margin, mark prices, OI accounting, realized PnL, liquidation math |
| `perp_vault` | USDC custody; internal transfers between balances signed by registered operator PDAs |
| `a2a_darkpool` | Agent-to-agent OTC matching (intent → response → settle) with on-chain reputation and Proof-of-Context freshness gating |
| `oracle_router` | Price push with circuit breaker, staleness + deviation checks → engine mark price |
| `order_settlement` | Ed25519 signed-order settlement, 256-bit nonce bitmap pages, commit-reveal MEV protection, dynamic spread |
| `collateral_manager` | Multi-asset margin (yield-bearing tokens) with prospective haircut snapshots |
| `trading_vault` | HLP-style pooled vaults: shares at 1e18 precision, HWM performance fee, per-second management fee, drawdown auto-pause |
| `insurance_fund` | Bad-debt absorption with keeper-reward caps |
| `liquidator` | Permissionless liquidations |
| `auto_deleveraging` | ADL last-resort forced reduction |
| `sur_timelock` | Real dispatch timelock (queue/execute/cancel + emergency-pause guardian, two-step ownership) |

## Proof-of-Context integration

The dark pool enforces **f_i (input freshness)** on-chain and trustlessly: `accept_and_settle` binds the engine market account to the intent's market, reads the canonical `last_price_update` recorded by the chain itself, and rejects the trade if the price is older than the freshness budget (`StalePrice`). Both agents attach signed context commitments to their quotes. This is the first on-chain instantiation of the [Proof-of-Context](https://github.com/asastuai/proof-of-context) verification framework (see paper §10.5; measured cost: ~120.8k CU per gated settlement, ≈8.6% of Solana's budget).

## Security

- Internal audit + **Gate 0 remediation**: canonical-PDA binding on every value-bearing account passed to operator-signed CPIs (closes the theft family — fee-drain / balance-substitution). See `docs/AUDIT-REPORT.md`.
- **Voluntary reduce/flip settlement**: reduces and flips route through `perp_engine.reduce_position`, which settles freed margin + realized PnL back to the trader (three-way winner / partial-loss / bad-debt split). ADL keeps its own path by design.
- Functional timelock (C-3/H-9): real instruction dispatch bound to a tx hash, not a no-op queue.
- Checked arithmetic on vault aggregate counters (N-5).
- CEI ordering preserved manually; `nonReentrant` guards dropped (Solana runtime forbids direct CPI re-entry).

## Layout

```
programs/            11 Anchor programs (see table above)
clients/
  web/               Next.js trading UI (trade desk, portfolio, dark pool)
  sdk/               typed Anchor client (TS): program IDs, PDAs, views
  api/               indexer + points/leaderboard REST service (build-ahead)
tests/               100+ cross-program integration tests (01..11)
scripts/             devnet bootstrap: devnet-init.ts, transfer-test-usdc.ts,
                     register-operator.ts
docs/                PHASES.md, AUDIT-REPORT.md, DEVNET-GOLDEN-PATH.md,
                     POINTS-SYSTEM.md, KNOWN-ISSUES.md
```

## Build & test

Requires: Rust stable, Solana CLI (Agave 3.1.x), Anchor CLI 0.31.1, Node + Yarn.

```bash
yarn install
anchor build          # targets SBPF v0 (the default) — deployable on devnet/mainnet today
anchor test           # spins a local validator; run in WSL2/Linux/macOS
```

**Windows native:** `cargo check` / `anchor build` work; `solana-test-validator` has a Windows genesis-unpack bug — run `anchor test` inside WSL2.

Devnet bootstrap (fresh deploy): `anchor build` → `solana program deploy` per program → `npx ts-node scripts/devnet-init.ts` (creates USDC mint, initializes all 11 configs, wires operators, bootstraps pools, adds markets, seeds prices). Manual end-to-end walkthrough: `docs/DEVNET-GOLDEN-PATH.md`.

## Engineering notes

- All cross-program calls where the callee uses `anchor-spl` are **manual `invoke_signed`** (discriminator + borsh + explicit `AccountMeta`s) — avoids the anchor 0.31.1 `cpi`+`idl-build` feature-unification bug (`docs/KNOWN-ISSUES.md`).
- Every program: `lib.rs` + `state.rs` + `errors.rs` + `events.rs` + `instructions/`; singleton config PDA `[<program>_config]`; per-entity PDAs `[name, id_le]` / `[name, pubkey]`.
- Mapping 3 prospective-params: parameter snapshots at post time + `ParameterBump` events — a param change never rewrites live quotes.
- Audit INTENT preserved over Solidity bugs (e.g. H-14 drawdown pause is functional here where the Solidity revert made it dead code — documented divergence).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0–2 | 11 programs ported + risk CPI wiring | ✅ |
| 3.1 | All engine callers wired through real margin/settlement CPIs | ✅ |
| — | Internal audit + Gate 0/1 remediation | ✅ |
| 5 | Devnet deploy + init (11 programs live) | ✅ 2026-06-30 |
| 4 | Client stack: web ✅ · sdk ✅ · api/points 🚧 · keeper/MCP ⏳ | 🚧 |
| 6 | External audit → mainnet (rotated keys) | ⏳ |

See `docs/PHASES.md` for the full migration log.

## License

BUSL-1.1 — same as upstream `sur-protocol`.
