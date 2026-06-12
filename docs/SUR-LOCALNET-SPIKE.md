# SUR-LOCALNET-SPIKE.md
**SUR × SAW: SurAdapter Localnet Spike — open/close/read verified**  
_Author: adapter-probe agent (2026-06-12). Throwaway spike — no production code modified._

---

## STATUS: DONE

All probes passed on localnet. Long open/close and short open/close executed with real on-chain tx sigs. The VenueAdapter cycle is provably buildable.

---

## 1. LOCALNET BRING-UP RUNBOOK

### Key discovery: Anchor.toml [programs.localnet] is stale

The `[programs.localnet]` stanza in `Anchor.toml` has IDs that do NOT match the compiled programs. The `.so` files are compiled with devnet `declare_id!` values. Deploying them at the localnet stanza IDs causes `DeclaredProgramIdMismatch` (error 4100).

**Correct approach**: use `solana-test-validator --bpf-program <keypair.json> <.so>` — the keypair files in `target/deploy/` correspond to the devnet IDs embedded in the binaries.

### Runbook (verified working)

```bash
# 1. Kill any stale validator
pkill -f solana-test-validator 2>/dev/null || true; sleep 1

# 2. Launch validator in background within the SAME shell session
#    (background processes don't survive across separate wsl.exe invocations)
DEPLOY=/home/asastu/projects/sur-protocol-solana/target/deploy
solana-test-validator \
  --bpf-program "$DEPLOY/perp_vault-keypair.json"         "$DEPLOY/perp_vault.so" \
  --bpf-program "$DEPLOY/perp_engine-keypair.json"        "$DEPLOY/perp_engine.so" \
  --bpf-program "$DEPLOY/oracle_router-keypair.json"      "$DEPLOY/oracle_router.so" \
  --bpf-program "$DEPLOY/a2a_darkpool-keypair.json"       "$DEPLOY/a2a_darkpool.so" \
  --bpf-program "$DEPLOY/auto_deleveraging-keypair.json"  "$DEPLOY/auto_deleveraging.so" \
  --bpf-program "$DEPLOY/collateral_manager-keypair.json" "$DEPLOY/collateral_manager.so" \
  --bpf-program "$DEPLOY/insurance_fund-keypair.json"     "$DEPLOY/insurance_fund.so" \
  --bpf-program "$DEPLOY/liquidator-keypair.json"         "$DEPLOY/liquidator.so" \
  --bpf-program "$DEPLOY/order_settlement-keypair.json"   "$DEPLOY/order_settlement.so" \
  --bpf-program "$DEPLOY/sur_timelock-keypair.json"       "$DEPLOY/sur_timelock.so" \
  --bpf-program "$DEPLOY/trading_vault-keypair.json"      "$DEPLOY/trading_vault.so" \
  --reset --quiet &
VALIDATOR_PID=$!

# 3. Health check
until curl -sf http://127.0.0.1:8899/health >/dev/null 2>&1; do sleep 1; done
solana cluster-version --url http://127.0.0.1:8899

# 4. Run probe
cd ~/projects/sur-protocol-solana
npx ts-node scripts/sur-adapter-probe.ts

# 5. Kill validator
kill $VALIDATOR_PID
```

### Additional gotchas found during bring-up

| # | Gotcha | Fix |
|---|--------|-----|
| G-1 | `Anchor.toml [programs.localnet]` IDs are stale — don't match compiled binaries | Use `target/deploy/*-keypair.json` with `--bpf-program` |
| G-2 | `oracle_router.initialize` requires `cooldown_secs ∈ [60, 86400]` | Pass `60` not `0` |
| G-3 | `engine_authority` PDA needs SOL for rent when `bootstrapEnginePool` CPIs into vault | Airdrop 2 SOL to `engineAuthorityPda` before bootstrap |
| G-4 | WSL: background processes launched via separate `wsl.exe -d Ubuntu` invocations are reaped when the invocation ends | Run validator and probe in the SAME shell session (one bash call) |
| G-5 | IDL `address` field has devnet ID; for localnet validator (same IDs) no override needed once programs deploy at correct addresses | No override needed — `--bpf-program keypair.json .so` matches |

---

## 2. PROGRAM IDs (correct for localnet)

These match `declare_id!` in each program's `lib.rs` and the keypair files in `target/deploy/`:

| Program | ID |
|---|---|
| `perp_engine` | `28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX` |
| `perp_vault` | `2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1` |
| `oracle_router` | `8yLenSHEkdkbsCiQLmiQrZg7Kdb3ZBb1MKTFmJsA37zk` |

> Note: `Anchor.toml [programs.localnet]` has different (stale) IDs. Ignore it. The devnet IDs ARE the correct IDs for both localnet and devnet since the programs are compiled once.

---

## 3. PDA DERIVATIONS

All PDAs are confirmed on-chain from the probe run. Addresses below are specific to deployer `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv` on a fresh localnet.

### perp_vault PDAs

| Name | Seeds | Program |
|---|---|---|
| `vault_config` (singleton) | `["vault_config"]` | `perp_vault` |
| `vault_authority` (CPI signer) | `["vault_authority"]` | `perp_vault` |
| `usdc_vault` (token account) | `["usdc_vault"]` | `perp_vault` |
| `AccountBalance` (per trader) | `["balance", trader_pubkey]` | `perp_vault` |
| `Operator` (per operator) | `["operator", operator_pubkey]` | `perp_vault` |

### perp_engine PDAs

| Name | Seeds | Program |
|---|---|---|
| `engine_config` (singleton) | `["engine_config"]` | `perp_engine` |
| `engine_authority` (CPI signer) | `["engine_authority"]` | `perp_engine` |
| `Market` (per market) | `["market", market_id_bytes32]` | `perp_engine` |
| `Position` (per market+trader) | `["position", market_id_bytes32, trader_pubkey]` | `perp_engine` |
| `Operator` (per operator) | `["operator", operator_pubkey]` | `perp_engine` |

**IMPORTANT — Position PDA**: SUR uses ONE position PDA per `(market, trader)`. Side is encoded by the sign of `Position.size` (positive = long, negative = short). There is no separate "long position PDA" and "short position PDA". The `hasOpenOrderWithUserOrderId` mapping should check PDA existence; the side check reads `position.size`.

### market_id encoding

Symbol strings like `"BTC-USD"` are encoded as zero-padded 32-byte Buffers:
```typescript
const marketIdBuf = (symbol: string): Buffer => {
  const buf = Buffer.alloc(32);
  Buffer.from(symbol).copy(buf);
  return buf;
};
// BTC-USD hex: 4254432d55534400000000000000000000000000000000000000000000000000
```

---

## 4. PRECISIONS

| Field | Unit | Precision | Note |
|---|---|---|---|
| `mark_price` | u64 | 1e6 (6 decimals) | `$65,000.00` stored as `65_000_000_000` |
| `index_price` | u64 | 1e6 | Same as mark_price |
| `entry_price` | u64 | 1e6 | Written by `open_position` |
| `fill_price` arg | u64 | 1e6 | Input to `open_position` and `close_position` |
| `size_delta` arg | i64 | 1e8 (8 decimals) | `0.1 BTC` = `10_000_000`; negative = short |
| `Position.size` | i64 | 1e8 | Cumulative; positive = long, negative = short |
| `Position.margin` | u64 | 1e6 | `$325.00` stored as `325_000_000` |
| `AccountBalance.balance` | u64 | 1e6 | USDC, 6 decimals |
| `initial_margin_bps` | u64 | bps | 500 = 5% |
| `maintenance_margin_bps` | u64 | bps | 250 = 2.5% |

---

## 5. VenueAdapter METHOD → SUR INSTRUCTION MAPPING (concrete, verified)

### `ensureUserInitialized()`
**SUR call**: `vault.methods.deposit(new BN(0)).accounts({ accountBalance: balancePda(trader), ... })` — but actually calling `deposit` with amount=0 is sufficient to create the AccountBalance PDA if it doesn't exist (it uses `init_if_needed`). Alternatively: just call `ensureDeposited` which deposits and creates the PDA.

**Implementation**: no-op if `AccountBalance` PDA exists; otherwise call `vault.deposit(0)` to create it.

### `ensureDeposited(marginUsdc)`
**SUR call**: `vault.methods.deposit(new BN(marginUsdc * 1e6)).accounts({ ... })`

Requires:
- `vaultConfig`: `pda(["vault_config"], PERP_VAULT_ID)`
- `usdcVault`: `pda(["usdc_vault"], PERP_VAULT_ID)`
- `userUsdc`: trader's USDC ATA
- `accountBalance`: `pda(["balance", trader], PERP_VAULT_ID)` — created by `init_if_needed`
- `depositor`: trader (signer)
- `tokenProgram`, `systemProgram`

### `getOraclePrice(market)`
**SUR call**: read `Market` PDA — `engine.account.market.fetch(marketPda(marketIdBuf(market)))`

Returns `market.markPrice.toNumber() / PRICE_PRECISION`. This is operator-pushed; the adapter is its own oracle (paper-trade: push via `update_mark_price` before reading).

**For adapter**: Read `market.markPrice`, divide by 1e6.

### `hasOpenOrderWithUserOrderId(n)`
**SUR call**: `engine.account.position.fetchNullable(positionPda(marketIdBuf(market), trader))`

Returns `position !== null && position.size !== 0`. No concept of userOrderId — existence check only. One PDA covers both sides (check `size.toNumber() > 0` for long, `< 0` for short).

### `openPerp(intent, userOrderId)`
**SUR call**: `engine.methods.openPosition(size_delta, fill_price).accounts({ ... }).remainingAccounts(openCloseRA(...)).rpc()`

Args:
- `size_delta: BN` — signed i64; `+` for long, `-` for short; units = 1e8 (`0.1 BTC` = `new BN(10_000_000)`)
- `fill_price: BN` — u64; units = 1e6 (`$65,000` = `new BN(65_000_000_000)`)

Accounts required:
```typescript
.accounts({
  engineConfig: pda(["engine_config"], PERP_ENGINE_ID),
  market: pda(["market", marketIdBuf("BTC-USD")], PERP_ENGINE_ID),
  position: pda(["position", marketIdBuf("BTC-USD"), trader], PERP_ENGINE_ID),
  trader: trader,           // NOT a signer — operator signs
  operatorAccount: pda(["operator", operator], PERP_ENGINE_ID),
  operator: operator,       // SIGNER — must be a registered engine operator
  systemProgram: SystemProgram.programId,
})
.remainingAccounts([
  // ORDER IS CRITICAL — see open_position.rs header
  { pubkey: pda(["engine_authority"], PERP_ENGINE_ID),  isSigner: false, isWritable: false },
  { pubkey: PERP_VAULT_ID,                              isSigner: false, isWritable: false },
  { pubkey: pda(["vault_config"], PERP_VAULT_ID),       isSigner: false, isWritable: false },
  { pubkey: pda(["operator", engineAuthority], PERP_VAULT_ID), isSigner: false, isWritable: false },
  { pubkey: pda(["balance", trader], PERP_VAULT_ID),    isSigner: false, isWritable: true  },
  { pubkey: pda(["balance", engineAuthority], PERP_VAULT_ID), isSigner: false, isWritable: true  },
])
```

**GAP**: Operator must be a registered engine operator. Use deployer keypair for paper-trade.
**GAP**: No SL/TP. `stopLoss` and `takeProfit` in `intent` are silently ignored; return `null` in `getPositions()`.

Returns: tx sig. Echo back `userOrderId` from caller (SUR has no native clientOrderId).

### `closePerp(market)`
**SUR call**: `engine.methods.closePosition(fill_price).accounts({ ... }).remainingAccounts(openCloseRA(...)).rpc()`

Args:
- `fill_price: BN` — u64, 1e6 precision. Adapter should read `market.markPrice` first and pass it.

Accounts (same `remainingAccounts` pattern as `openPerp`, with trader derived from `position.trader`):
```typescript
.accounts({
  engineConfig: pda(["engine_config"], PERP_ENGINE_ID),
  market: pda(["market", marketIdBuf(market)], PERP_ENGINE_ID),
  position: pda(["position", marketIdBuf(market), trader], PERP_ENGINE_ID),
  operatorAccount: pda(["operator", operator], PERP_ENGINE_ID),
  operator: operator,  // SIGNER
})
.remainingAccounts([...same pattern as openPerp...])
```

Note: `closePosition` reads `position.trader` internally to derive the trader — you need to know the trader's pubkey to pass the correct `remainingAccounts[4]` (trader's balance PDA). The adapter knows this since it holds the trader keypair.

### `getPositions()`
**SUR call**: fetch Position PDA, fetch Market PDA for mark_price, compute client-side fields.

```typescript
const pos = await engine.account.position.fetch(positionPda(marketIdBuf(market), trader));
const mkt = await engine.account.market.fetch(marketPda(marketIdBuf(market)));

// PerpPosition fields:
const result: PerpPosition = {
  market: "BTC-USD",
  side: pos.size.toNumber() > 0 ? "long" : "short",
  baseSize: Math.abs(pos.size.toNumber()) / SIZE_PRECISION,           // human units
  entryPrice: pos.entryPrice.toNumber() / PRICE_PRECISION,           // USD
  markPrice: mkt.markPrice.toNumber() / PRICE_PRECISION,             // USD
  unrealizedPnlUsdc: calcUPnL(pos.size, pos.entryPrice, mkt.markPrice),  // see below
  liqPrice: calcLiqPrice(pos.size, pos.entryPrice, pos.margin),          // see below
  stopLoss: null,   // GAP-1: not stored on-chain
  takeProfit: null, // GAP-1: not stored on-chain
};
```

**uPnL formula** (verified in probe):
```typescript
// All inputs in raw on-chain units
function calcUPnL(size: number, entryPrice: number, markPrice: number): number {
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (size > 0) {  // long
    return ((markPrice - entryPrice) / PRICE_PRECISION) * absSizeHuman;
  } else {         // short
    return ((entryPrice - markPrice) / PRICE_PRECISION) * absSizeHuman;
  }
}
```

**liqPrice formula** (approximation, maintenance_margin_bps = 250):
```typescript
function calcLiqPrice(size: number, entryPrice: number, margin: number): number | null {
  const epHuman = entryPrice / PRICE_PRECISION;
  const marginHuman = margin / PRICE_PRECISION;
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (absSizeHuman === 0) return null;
  const notionalHuman = absSizeHuman * epHuman;
  const maintMarginHuman = notionalHuman * 0.025;
  if (size > 0) {
    const liq = epHuman - (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  } else {
    const liq = epHuman + (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  }
}
```

Probe verified: long 0.1 BTC @ $65,000 → liqPrice ≈ $63,375. Short 0.1 BTC @ $66,000 → liqPrice ≈ $67,650.

### `getFloatBalanceUsdc()`
**SUR call**: `vault.account.accountBalance.fetch(balancePda(trader))`

Returns `balance.toNumber() / PRICE_PRECISION`.

### `disconnect()`
No-op. SUR has no persistent connection or subscription state.

---

## 6. OPERATOR REQUIREMENT (GAP-4)

`open_position` and `close_position` are **operator-gated**. The signing keypair must have a registered `Operator` PDA on `perp_engine`.

**Setup** (one-time, idempotent):
```typescript
await engine.methods.setOperator(operatorPubkey, true)
  .accounts({
    engineConfig: pda(["engine_config"], PERP_ENGINE_ID),
    operatorAccount: pda(["operator", operatorPubkey], PERP_ENGINE_ID),
    owner: ownerPubkey,  // must be engine owner
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

For paper-trade: reuse the deployer keypair (already registered). For production: register the SAW worker keypair.

Additionally, `engine_authority` must be registered as a vault operator:
```typescript
await vault.methods.setOperator(engineAuthorityPda, true)
  .accounts({
    vaultConfig: pda(["vault_config"], PERP_VAULT_ID),
    operatorAccount: pda(["operator", engineAuthorityPda], PERP_VAULT_ID),
    owner: ownerPubkey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

---

## 7. PRICE PUSHING (GAP-2 MITIGATION)

For paper-trade the adapter is its own oracle. Push price directly via `perp_engine.update_mark_price` (simpler than oracle_router CPI):

```typescript
await engine.methods.updateMarkPrice(new BN(price * PRICE_PRECISION), new BN(price * PRICE_PRECISION))
  .accounts({
    engineConfig: pda(["engine_config"], PERP_ENGINE_ID),
    market: pda(["market", marketIdBuf(market)], PERP_ENGINE_ID),
    operatorAccount: pda(["operator", operator], PERP_ENGINE_ID),
    operator: operator,  // signer
  })
  .rpc();
```

The adapter can call this before `openPerp` and `closePerp` to set a synthetic fill price.

---

## 8. PROVEN TX SIGS (localnet, 2026-06-12)

These are real localnet transaction signatures from the probe run. Localnet is ephemeral so these can't be looked up on an explorer, but they represent proof of the cycle completing successfully.

| Action | Tx Sig |
|---|---|
| deposit 1000 USDC | `5UuYZD7nVd2Fbx6xdrYPjZBRCoAqXUQvSuxdy9n7ZTz5XbwNkjHErCusXiTMSCad2Q2WKiMYzdz3DwtRzNjXbFSs` |
| LONG open (0.1 BTC @ $65,000) | `5NKfdYzrTaPShpEufHjbWsmSihdyrq72kTt1eFfgYsMqqRA8q3jEjM79SSJBDBoqpjuL874Ay8Waw9kkSAU586iQ` |
| LONG close (@ $66,000, +$100 profit) | `PBNBcfMiJfQGFCNJ57a8PivTYphJ6Jcpy3mArLiJgAkzptFxmkJ338HzAH26TxrfRgBNTWNp2CHmBvwcEqow6UX` |
| SHORT open (0.1 BTC @ $66,000) | `5RvRzS3hX6VSBK1Bta2BUQ3oMRhmR6VFYN4JrGr9mHRyCKEM2DcB6zndtHNFCipBDvUiZL3UFfXPwg1LkogLRdtK` |
| SHORT close (@ $65,000, +$100 profit) | `5SP6iDfzBXJF5Yfw6857Yji7spYurWPpqas9Xs3T6uWnQMgDPNuLfrBgqN3AxZbqA3fgHdw9D9RdM9viSXUdh4UW` |

**Verified results**:
- Long 0.1 BTC: margin locked $325, return $425 ($325 + $100 profit) ✓
- Short 0.1 BTC: margin locked $330, return $430 ($330 + $100 profit) ✓
- Final balance: $1,200 (started with $1,000 deposit + $200 total profit) ✓
- All position.size values = 0 after close ✓

---

## 9. FULL INIT SEQUENCE (for adapter setup script)

The `ensureUserInitialized + ensureDeposited` path requires these one-time steps (adapter setup, not per-trade):

1. `vault.initialize(0, 0, 0)` — creates VaultConfig + usdc_vault
2. `oracle_router.initialize(60, 10000, 3)` — creates OracleConfig (cooldown ≥ 60s)
3. `engine.initialize()` — creates EngineConfig + engine_authority PDA
4. `engine.setOperator(operatorPubkey, true)` — register adapter keypair as engine operator
5. `vault.setOperator(engineAuthorityPda, true)` — allow engine_authority to CPI into vault
6. Airdrop SOL to `engine_authority` PDA (needs rent for AccountBalance creation)
7. `engine.bootstrapEnginePool(amount)` — seeds engine margin pool
8. `engine.addMarket(...)` — create Market PDA for each trading pair
9. `engine.updateMarkPrice(...)` — set initial prices

For paper-trade, steps 1–9 run once at startup. Steps 1–3 use `init_if_needed` / existence checks so they are idempotent.

---

## 10. GAPS ASSESSMENT

| Gap | Blocking | Resolution |
|---|---|---|
| GAP-1: No SL/TP | NOT blocking for paper-trade | Return `null` for both fields. Document in adapter. |
| GAP-2: Operator-pushed oracle | NOT blocking for paper-trade | Adapter pushes prices itself via `update_mark_price`. |
| GAP-3: AccountBalance must pre-exist | Solved | `vault.deposit` uses `init_if_needed` — first deposit creates PDA. |
| GAP-4: Operator registration | Solved (one-time setup) | Deployer keypair already works; register SAW worker key for production. |
| GAP-5: uPnL + liqPrice computed client-side | Not a gap | Standard pattern (same as Adrena adapter). Formulas verified in probe. |

---

## 11. VERDICT: READY TO BUILD ADAPTER

**READY TO BUILD.** No remaining blockers for paper-trade SurAdapter.

What to build next:
1. `worker/src/lib/sur-venue.ts` — implement `VenueAdapter` using patterns from this doc
2. Setup script: init vault + engine + register operators + bootstrap pool + add markets
3. Wire into SAW `isVenueEnabled()` gate with `VENUE=sur` env var

Estimated effort: 3–5 days (per SUR-ADAPTER-DIAGNOSIS.md §4). Increase by 5–8 days if on-chain SL/TP is required.

**Probe script**: `~/projects/sur-protocol-solana/scripts/sur-adapter-probe.ts`  
**Spike doc**: `~/projects/sur-protocol-solana/docs/SUR-LOCALNET-SPIKE.md`
