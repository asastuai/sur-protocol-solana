# Known Issues

## ✅ RESOLVED — anchor 0.31.1 cpi+idl-build bug (workaround: manual invoke_signed)

### Symptom

When `a2a_darkpool/Cargo.toml` declares `perp_vault = { path = "...", features = ["cpi"] }`, `anchor build` fails during the IDL build phase with:

```
error[E0599]: no associated function or constant named `create_type` found for struct `TokenAccount` in the current scope
error[E0599]: no associated function or constant named `DISCRIMINATOR` found for struct `TokenAccount` in the current scope
error[E0599]: no associated function or constant named `insert_types` found for struct `TokenAccount` in the current scope
```

These are part of the `IdlBuild` trait that anchor-spl exposes when `idl-build` feature is active.

### Root cause

`perp_vault` has feature flags:
- `cpi = ["no-entrypoint"]` (activated when darkpool depends with cpi feature)
- `idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]` (activated when anchor builds the IDL)

When BOTH are active simultaneously (which happens during workspace `anchor build` once a caller depends on perp_vault as a CPI dep), anchor-spl's `idl-build` feature does not propagate properly through the resolver-2 boundary. The IDL macro generates calls to functions that aren't compiled in.

Forcing `anchor-spl = { version = "0.31.1", features = ["idl-build"] }` always-on did NOT fix it — same error.

### Resolution: manual invoke_signed CPI

We do NOT use Anchor's typed `cpi::` macros for any cross-program call where the callee uses `anchor-spl`. Instead, every CPI is built manually:

1. Discriminator = first 8 bytes of `sha256("global:<method_name>")`
2. Args borsh-serialized after the discriminator
3. `AccountMeta` vec built explicitly (signer/writable flags per Solidity intent)
4. `solana_program::program::invoke_signed` with the caller's authority PDA seeds

No Cargo path-dep with `cpi` feature on the callee → no feature activation → no IDL bug.

**Canonical pattern:** `programs/a2a_darkpool/src/instructions/accept_and_settle.rs` (4 CPIs in one instruction: 2× engine.open_position + 2× vault.internal_transfer signed as darkpool authority PDA).

**Used by:** a2a_darkpool, collateral_manager, trading_vault, order_settlement, oracle_router (note: oracle_router uses typed cpi::* because it does not depend on anchor-spl). Total: 8+ CPIs across the protocol.

**Trade-offs:**
- Lose typed account validation at the call site (we re-validate in the callee handler).
- Gain freedom from anchor 0.31.1 IDL bug + smaller IDL size (no nested account types).
- Tests cover all CPI shapes end-to-end so the trade-off is bounded.

---

## 🔍 DISCOVERY — TradingVault H-14 audit-fix is functionally dead in Solidity

### Symptom

The H-14 audit fix in `TradingVault.sol::_checkDrawdown` (lines 399–411 of the Solidity reference) is meant to make drawdown auto-pause sticky and trigger a 24-hour cooldown before unpause:

```solidity
function _checkDrawdown(bytes32 vaultId) internal {
    Vault storage v = vaults[vaultId];
    uint256 maxDrop = (v.highWaterMark * v.maxDrawdownBps) / BPS;
    if (currentEquity < v.highWaterMark - maxDrop) {
        v.paused = true;                                   // line 408
        drawdownPausedAt[vaultId] = block.timestamp;       // line 409 — H-14 fix
        revert MaxDrawdownBreached(currentEquity, v.highWaterMark);  // line 411
    }
}
```

The `revert` at line 411 rolls back ALL state changes in the current call frame, including the `v.paused = true` and `drawdownPausedAt` assignments at lines 408–409. The pause never persists across calls. The cooldown logic at line 514 reads `drawdownPausedAt[vaultId]` which is always 0.

### Audit intent vs Solidity behavior

- **Intent (per H-14 audit comment):** "Track when vault was paused by drawdown + 24h cooldown".
- **Behavior (per the code as-shipped):** assertion fires every time equity is below the threshold; pause never sticks; cooldown never engages.

### Solana port: preserve the intent, not the bug

`programs/trading_vault/src/instructions/equity.rs::check_drawdown` returns `Ok(true)` on breach instead of `Err`. Caller (`manager_open_position`) checks the bool and returns `Ok` early without executing the engine CPI. State writes to `vault.paused` and `vault.drawdown_paused_at` PERSIST.

Cooldown enforcement is verified by tests: `tests/10_trading_vault.ts` covers the 24h-lock + zero-cooldown unpause paths.

### Why this is correct under the mechanical-port rule

The "byte-for-byte mechanical port" rule preserves AUDITED BEHAVIOR. When the audited behavior is itself buggy (per code-vs-spec divergence), preserving the bug ports the bug, not the spec. We port the spec.

### Action item for Juan

Diff review checkpoint: confirm the divergence is acceptable. If the original SUR auditor explicitly intended the "always-revert" behavior (e.g. for forensic logging via the revert reason), revert this divergence. Otherwise, the Solana port is the correct artifact.

---

## 🔬 DEFERRED — minor follow-ups not in v0.3.1

### `collateral_manager.liquidate_collateral`
- v0.2.4+ ships deposit + withdraw + admin paths only.
- Liquidation flow (seize collateral + debit USDC at snapshotted haircut) deferred to v0.3.X.
- Mapping 3 prospective-param snapshots (`haircut_at_deposit`, `liquidation_threshold_at_deposit`) ARE in place on `TraderCollateral` PDA — future ix reads directly, no state migration.

### Insurance-shortfall pull on winner overflow (PerpEngine.sol:984)
- `_settlePnl` in Solidity pulls from insurance_fund when a winner's totalReturn exceeds engine_pool's balance.
- Solana port emits a comment marker but does not implement the conditional pull. Implementing requires deserializing engine_pool.balance in-handler.
- v0.2 markets are sized so this path isn't hit. Defer until first market hits it.

### `order_settlement.settle_batch` as a single ix
- v0.2.4+ implements `settle_one` only. Repeated calls increment `batch_counter` correctly per trade, preserving Solidity semantics.
- A true `settle_batch(Vec<MatchedTrade>)` ix is awkward in Anchor 0.31 because variable per-trade account counts collide with the static `Accounts` derive macro. Solvable via `remaining_accounts` chunking + manual borsh decode, but not in scope yet.

### ADL profitable-position check on-chain
- `AutoDeleveraging.sol:159-160` checks `engine.getUnrealizedPnl(target) > 0` before forced-reduce.
- Solana port does NOT enforce this on-chain — would require a view CPI or manual borrow+deserialize of engine_position by ADL.
- Operator is trusted (already gated by cooldown + thresholds + operator-authorization). Same trust model as the v0.2.3 `fund_balance` / `position_size` operator-passed args.
- Document this divergence inline in `programs/auto_deleveraging/src/instructions/execute_adl.rs` file header.

---

## Test command (sanity check)

```bash
# In WSL2 with toolchain installed:
cd ~/projects/sur-protocol-solana
anchor build
anchor test
# 94 passing
```

Windows native: solana-test-validator has a genesis-archive unpack bug on Windows (os error 5: Acceso denegado). All anchor build/test runs inside WSL2 Ubuntu.
