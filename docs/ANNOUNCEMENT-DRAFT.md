# Announcement drafts — v0.3.0

Three formats. Tweak as you see fit. All use Juan-voice + `asastu` signature for work-context posting.

---

## Tweet thread (post on X / Bluesky)

**1/**
shipping update.

we ported 11 Solidity contracts of SUR Protocol to Solana + wired every cross-program call end-to-end.
94/94 integration tests passing.
margin lock, PnL settlement, bad-debt routing, liquidations, ADL, insurance fund, dark-pool, off-chain-matched settlement, manager-traded vaults — all 5 engine callers exercise the real CPI chain. zero stubs in the money path.

repo: github.com/asastuai/sur-protocol-solana

**2/**
the stack:

→ a2a_darkpool: agent-to-agent OTC matching with persistent reputation
→ perp_vault: USDC custody + collateral splitting
→ oracle_router: Pyth-only feed with circuit breaker + staleness gates
→ perp_engine: position state, openPosition/closePosition, OI accounting, PnL on flips
→ sur_timelock: admin queue/execute + emergency-pause guardian
→ liquidator: permissionless liquidations
→ insurance_fund: bad-debt absorption with H-9 keeper-reward caps
→ auto_deleveraging: ADL when insurance fund insufficient
→ collateral_manager: yield-bearing tokens (cbETH/wstETH/LSTs) → USDC-credit with prospective haircut snapshots
→ trading_vault: HLP-style pooled vaults, share accounting, perf+mgmt fees, drawdown auto-pause
→ order_settlement: off-chain matcher → on-chain settle with ed25519 sigs + nonce bitmap + commit-reveal MEV protection

**3/**
known anchor 0.31.1 bug: cross-program CPI deps + IDL build collide when anchor-spl is in the chain.

solution: skip the typed `cpi::` macros entirely.

build instructions manually with discriminator = first 8 bytes of sha256("global:method").
sign as PDA via invoke_signed. no Cargo path-dep needed = no feature activation = no bug.

canonical pattern: programs/a2a_darkpool/src/instructions/accept_and_settle.rs
8 CPIs across the protocol use it now.

writeup: github.com/asastuai/sur-protocol-solana/blob/main/docs/KNOWN-ISSUES.md

**4/**
audit-finding callout.

porting TradingVault.sol byte-by-byte we caught the H-14 fix is functionally dead in Solidity:

```
v.paused = true;                      // line 408
drawdownPausedAt[vaultId] = block.timestamp;
revert MaxDrawdownBreached(...);     // line 411 — undoes 408 + 409
```

revert rolls back the writes. sticky pause never persists. solana port returns Ok early instead, so the cooldown actually works.

mechanical-port-byte-by-byte rule taught me to port the AUDIT INTENT, not the Solidity bug.

**5/**
v0.3 wiring — risk-mgmt chain live:

→ engine.open_position now CPIs vault to lock margin (trader→engine_pool)
→ engine.close_position settles PnL (winner: pool→trader; loser-partial: pool→trader at remainder; bad-debt: pool stays + emits BadDebt event)
→ engine.liquidate_position pays keeper from vault, routes overflow to insurance_fund, emits BadDebt on shortfall
→ liquidator + auto_deleveraging now make real engine CPIs (not stubs)
→ insurance_fund.reward fires real vault transfer (H-9 keeper-reward caps preserved BEFORE the CPI)

every existing test exercises the real CPI chain now. 94 passing, 0 stubs in the risk path.

**6/**
EIP-712 → Solana ed25519 + Sysvar walker.

OrderSettlement signs off-chain orders, settles batches on-chain. EVM uses secp256k1 + ecrecover. BPF doesn't have ecrecover, and Solana wallets sign ed25519.

solution: ed25519 precompile ix in same tx + Sysvar<Instructions> walk to assert message bytes match the order being settled. domain separator = sha256("SUR_OrderSettlement_v1" || program_id || cluster_id) so devnet sigs can't replay on mainnet.

canonical message layout: 137 bytes, documented in programs/order_settlement/src/signature.rs.

**7/**
status:

phase 1 (foundation) → done, tag v0.2.0
phase 2 (risk + markets + settlement) → 7/7 done, tag v0.2.4
phase 3 wiring (real risk-mgmt CPIs) → done, tag v0.3.0
phase 3 contracts (yield + intent + trust) → next
phase 4 (off-chain client stack — sdk, indexer, keeper, mcp-server, web)
phase 6 → audit + mainnet

@asastuai/sur-sdk on npm: program IDs + PDA helpers + view modules + ed25519 order signing ready for clients.

**8/**
why solana.

Base murió narrativamente para mí.
solana tiene la densidad agent-tooling correcta para el thesis "agent-native perp-dex".
liquidez superior, devs más cooperativos, doors abriendo.

mechanical port byte-by-byte, not greenfield rewrite.
fidelity al audited-Solidity > elegance.

— asastu

---

## GitHub release notes (v0.3.0)

### v0.3.0 — Risk-management CPI chain live end-to-end

**ships (since v0.2.4):**
- `perp_engine.open_position` — vault CPI for margin lock (trader → engine_pool)
- `perp_engine.close_position` — branched PnL settlement: winner pool→trader, loser-partial pool→trader (margin minus loss), bad-debt pool retained + BadDebt event
- `perp_engine.liquidate_position` — `_distributeLiquidationRewards` ported (PerpEngine.sol:1553-1564): keeper reward, insurance overflow, bad-debt routing
- `liquidator.liquidate` — real CPI to engine.liquidate_position (was stub)
- `auto_deleveraging.execute_adl` — real CPI to engine.open_position with forced reduce (was stub)
- `insurance_fund.reward` — real CPI to vault.internal_transfer; H-9 keeper-reward caps fire BEFORE the CPI
- New canonical pattern: `bootstrap_*_pool` ix for any program whose authority PDA needs to own a vault AccountBalance (perp_engine, insurance_fund, trading_vault all use it)
- **94/94 integration tests passing in WSL2** (was 85; +3 new bad-debt + bootstrap tests, all existing tests now exercise real CPI chains instead of stubs)

**still in workspace from v0.2.4 (Phase 2 second-half):**
- `programs/collateral_manager` — multi-asset margin with yield-bearing tokens, prospective haircut + liquidation-threshold snapshots (Mapping 3 preserved)
- `programs/trading_vault` — HLP-style pooled vaults, 1e18 share precision (u128), HWM perf-fee + per-second mgmt-fee accrual, H-14 drawdown auto-pause + 24h cooldown
- `programs/order_settlement` — ed25519-signed orders, per-trader 256-bit nonce bitmap pages, commit-reveal MEV protection
- 11 programs total in the workspace

**audit-flagged H-14 finding:**
- TradingVault.sol:408-411 has a `paused = true; revert` pattern where the revert undoes the assignment.
- Solana port preserves the audit INTENT (sticky pause + 24h cooldown enforced) by returning `Ok(true)` early instead of erroring.
- Documented in `programs/trading_vault/src/instructions/equity.rs::check_drawdown` + `docs/KNOWN-ISSUES.md`.

**signature scheme migration:**
- EIP-712 (secp256k1 + ecrecover) → Solana ed25519 precompile + Sysvar<Instructions> message-bytes walker.
- Domain separator binds signatures to (program_id, cluster_id) so devnet/mainnet sigs cannot cross-replay.
- Canonical 137-byte message layout in `programs/order_settlement/src/signature.rs`.

**known minor deferrals (tracked):**
- `collateral_manager.liquidate_collateral` — snapshots in place, ix to land follow-up
- `order_settlement.settle_batch` as single ix — per-trade settle preserves batch_counter; single-ix version awkward in Anchor 0.31 (variable account counts)
- ADL profitable-position check (`AutoDeleveraging.sol:159-160`) — operator-trusted on-chain, cooldown + thresholds + operator-auth gating preserved

**how to verify locally:**
```bash
git clone https://github.com/asastuai/sur-protocol-solana
cd sur-protocol-solana
npm install
anchor build
anchor test
# 94 passing
```

requires Anchor CLI 0.31.1 + Solana CLI/Agave 3.1.x. Tests run in WSL2/Linux/macOS (Solana test-validator has a known bug on Windows native).

---

## Discord / community-share text (Solana DeFi servers, Anchor builders)

shipping update — 11 Solidity contracts of SUR Protocol ported to Solana + full risk-management CPI chain wired end-to-end. monorepo here: github.com/asastuai/sur-protocol-solana

94/94 integration tests passing. v0.3.1 — engine.open_position locks margin via vault CPI, close_position settles realized PnL with branched winner/loser/bad-debt routing, liquidate_position pays keepers + routes overflow to insurance_fund. all 5 engine callers (darkpool, order_settlement, trading_vault, liquidator, ADL) exercise the full chain end-to-end — zero stubs in the money path.

four things that might be of interest if you're building on Anchor:

→ manual invoke_signed CPI pattern that sidesteps the anchor 0.31.1 cpi+idl-build bug. canonical at programs/a2a_darkpool/src/instructions/accept_and_settle.rs. 8 CPIs across the protocol use it.

→ EIP-712 → Solana ed25519 + Sysvar<Instructions> walker for off-chain-signed orders. 137-byte canonical message layout. domain separator binds to (program_id, cluster_id). docs at programs/order_settlement/src/signature.rs.

→ TradingVault H-14 audit-finding callout: Solidity revert undoes the pause assignment, so the audited fix is functionally dead. port preserves the AUDIT INTENT, not the Solidity bug. writeup in docs/KNOWN-ISSUES.md.

→ canonical bootstrap_pool ix: when a program's authority PDA needs to own a vault AccountBalance, the PDA itself signs a vault.deposit(0) to init the balance account. Three programs use this now (perp_engine, insurance_fund, trading_vault). Pattern in programs/perp_engine/src/instructions/bootstrap_pool.rs.

looking for:
- code review on any of the above patterns
- contributors for phase 3 (intent_engine, trust_layer)
- ideas for the agent-API surface (mcp-server tools)

DMs open.

— asastu (Juan)

---

## Notes for posting

- **Pin the thread** if engagement starts. The H-14 finding + ed25519 + Sysvar walker pattern are the highest signal-density pieces. Solana DeFi devs will recognize the anchor 0.31.1 bug from their own debugging.
- **Don't promise mainnet timeline** in any post. We're 11/12 contracts done (only intent_engine + trust_layer remaining for phase 3), no audit. Realistic mainnet is 4-6 months minimum.
- **DO emphasize "looking for contribs"** — that's the real ask given the 10 contribs prometidos in the Solana community.
- **Solana program IDs en devnet** (all 11 live, ~27.35 SOL spent, deployer `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv`):

| Program | Devnet program ID |
|---|---|
| `perp_vault` | [`FpbuRBF3RiAkpD3k8XccnoYH99W5g9R59aRd3jRZTBfU`](https://explorer.solana.com/address/FpbuRBF3RiAkpD3k8XccnoYH99W5g9R59aRd3jRZTBfU?cluster=devnet) |
| `oracle_router` | [`CC5Xc5DTyLSfcw3MiXbyJQyRA21mh3Shup6bgMH8WGSS`](https://explorer.solana.com/address/CC5Xc5DTyLSfcw3MiXbyJQyRA21mh3Shup6bgMH8WGSS?cluster=devnet) |
| `perp_engine` | [`Cwpbe4mwgFdnhwhoRBGBzUerQa52cJMqXWjG3wGvYFW8`](https://explorer.solana.com/address/Cwpbe4mwgFdnhwhoRBGBzUerQa52cJMqXWjG3wGvYFW8?cluster=devnet) |
| `sur_timelock` | [`9FeQoWChgaRqvKJGqjTmVvpF7jQ4Ph7zgSsrkA4NnwAF`](https://explorer.solana.com/address/9FeQoWChgaRqvKJGqjTmVvpF7jQ4Ph7zgSsrkA4NnwAF?cluster=devnet) |
| `a2a_darkpool` | [`BVrt7REAZoCZBEY987fUPEjn2EvnXyaFzpMPVXb81rnq`](https://explorer.solana.com/address/BVrt7REAZoCZBEY987fUPEjn2EvnXyaFzpMPVXb81rnq?cluster=devnet) |
| `liquidator` | [`9APXqgHS7aNtYsjDE1SJ6PiboJPSyv2QhG9SmLaCzg2R`](https://explorer.solana.com/address/9APXqgHS7aNtYsjDE1SJ6PiboJPSyv2QhG9SmLaCzg2R?cluster=devnet) |
| `insurance_fund` | [`A9TY4wcr6Buzrac5XLC5aQvz4wWyYjQSogsVBvS3eKPp`](https://explorer.solana.com/address/A9TY4wcr6Buzrac5XLC5aQvz4wWyYjQSogsVBvS3eKPp?cluster=devnet) |
| `auto_deleveraging` | [`F12KjhGRyiEbM629MHookPFar7xsbfbfafoZjuBmCTDz`](https://explorer.solana.com/address/F12KjhGRyiEbM629MHookPFar7xsbfbfafoZjuBmCTDz?cluster=devnet) |
| `collateral_manager` | [`2LavJpzUzHWs2cJTAp2BEvvS2Kxrr9gfaWgSVH4s3juh`](https://explorer.solana.com/address/2LavJpzUzHWs2cJTAp2BEvvS2Kxrr9gfaWgSVH4s3juh?cluster=devnet) |
| `trading_vault` | [`JE4JwZ3b7eYoBsTempCUbkBiFAgYrTsisn2uMssWGvCy`](https://explorer.solana.com/address/JE4JwZ3b7eYoBsTempCUbkBiFAgYrTsisn2uMssWGvCy?cluster=devnet) |
| `order_settlement` | [`2q4HtPAjUMFPDfipazQhb52sRun3x9TdpwRHysWBg6Vf`](https://explorer.solana.com/address/2q4HtPAjUMFPDfipazQhb52sRun3x9TdpwRHysWBg6Vf?cluster=devnet) |
- The H-14 callout is the highest-signal piece for credibility — port reveals an audit-fix bug auditors missed. Lead with it on Discord; tweet 4 already does.
