# sur-protocol-solana

SUR Protocol — Solana port. Agent-native perpetual futures DEX with dark pool, persistent reputation, MCP integration, and Proof-of-Context settlement gating. Anchor monorepo.

Source for the port: [github.com/asastuai/sur-protocol](https://github.com/asastuai/sur-protocol) (Solidity on Base L2).

## Status

Migration from Solidity (Base) → Anchor (Solana). 12 contracts. Mechanical port byte-by-byte preserves audited behaviour; final round of Solana-native optimization at the end.

| Phase | Programs | Status |
|---|---|---|
| 0.1 | `a2a_darkpool` | ✅ done — 4/4 tests passing |
| 0.2 | `perp_vault` | 🚧 in progress |
| 0.2 | `oracle_adapter`, `perp_engine` | pending |
| 0.3 | `market_registry`, `risk_engine`, `funding_engine`, `liquidator`, `auto_deleveraging`, `insurance_fund`, `sur_timelock`, `order_settlement` | pending |
| 0.4 | `trading_vault` (yield collateral), `trust_layer`, `intent_engine` | pending |

## Layout

```
programs/
  a2a_darkpool/       agent-to-agent OTC perp matching with reputation
  perp_vault/         custodial USDC vault + collateral splitting
  ... (more landing each phase)
clients/
  sdk/                typed Anchor client (TS)
  ... (api, indexer, keeper, mcp-server, agent-api, web)
tests/                cross-program integration tests
docs/                 MAPPING.md, ARCHITECTURE.md, PHASES.md
```

## Build

Requires:
- Rust + Cargo (stable)
- Solana CLI / Agave 3.1.x
- Anchor CLI 0.31.1
- Node + Yarn

**Windows native:** `cargo check` and `anchor build` work. `anchor test` is blocked by a Solana toolchain bug; run integration tests in **WSL2** (Ubuntu 22.04+) or Linux/macOS.

```bash
yarn install
anchor build
anchor test
```

## License

BUSL-1.1 — same as upstream `sur-protocol`.

## Convention

- Every Anchor program has `lib.rs` + `state.rs` + `errors.rs` + `events.rs` + `instructions/` subfolder.
- Glob re-exports in `instructions/mod.rs`; `handler` fns are `pub(crate)` to avoid collision.
- Singleton config PDA seed `[<program>_config]`.
- Per-entity PDAs seed `[entity_name, id_le_bytes]` or `[entity_name, agent_pk]`.
- Errors are unit-variant Anchor enums; values logged via `msg!` if SDK needs introspection.
- `nonReentrant` Solidity guards removed (Solana runtime forbids direct CPI reentry).
- CEI ordering preserved manually.
- Mapping 3 prospective-params: param-snapshot at post time + `ParameterBump` event with `keccak::hash(b"<Program>.<param>")` and `effective_slot`.

See `docs/PHASES.md` for the migration roadmap.
