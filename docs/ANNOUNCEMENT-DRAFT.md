# Announcement drafts — v0.2.3

Three formats. Tweak as you see fit. All use Juan-voice + `asastu` signature for work-context posting.

---

## Tweet thread (post on X / Bluesky)

**1/**
shipping a thing today.

we ported 8 Solidity contracts of SUR Protocol to Solana.
51/51 integration tests passing.
3 cross-program calls wired end-to-end including atomic dark-pool settlement.

repo: github.com/asastuai/sur-protocol-solana

**2/**
the stack so far:

→ a2a_darkpool: agent-to-agent OTC matching with persistent reputation
→ perp_vault: USDC custody + collateral splitting (yield-bearing aware)
→ oracle_router: Pyth-only feed with circuit breaker + staleness gates
→ perp_engine: position state, openPosition/closePosition, OI accounting, realized PnL on flips
→ sur_timelock: admin queue/execute with delay + emergency-pause guardian
→ liquidator: permissionless liquidations
→ insurance_fund: bad-debt absorption with H-9 keeper-reward caps
→ auto_deleveraging: ADL when insurance fund insufficient

**3/**
the interesting part: anchor 0.31.1 has a known bug where cross-program CPI deps + IDL build collide when anchor-spl is in the chain.

solution: skip the typed cpi:: macros entirely.

build instructions manually with discriminator = first 8 bytes of sha256("global:method").
sign as PDA via invoke_signed. no Cargo path-dep needed = no feature activation = no bug.

**4/**
canonical pattern lives in
programs/a2a_darkpool/src/instructions/accept_and_settle.rs

5 CPIs across the protocol use it now.

writeup of the bug + workaround:
github.com/asastuai/sur-protocol-solana/blob/main/docs/KNOWN-ISSUES.md

**5/**
status:

phase 1 (foundation) → done, tag v0.2.0
phase 2 (risk + markets) → 3/7 done, tag v0.2.3
phase 3 (yield + intent + trust)
phase 4 (off-chain client stack — sdk, indexer, keeper, mcp-server, web)
phase 6 → audit + mainnet

@asastuai/sur-sdk v0.0.1 on npm: program IDs + PDA helpers ready for clients.

**6/**
why solana.

Base murió narrativamente para mí.
solana tiene la densidad agent-tooling correcta para el thesis "agent-native perp-dex".
liquidez superior, devs más cooperativos, doors abriendo.

mechanical port byte-by-byte, not greenfield rewrite.
fidelity al audited-Solidity > elegance.

— asastu

---

## GitHub release notes (v0.2.3)

### v0.2.3 — Phase 2 #3 (auto_deleveraging)

**ships:**
- `programs/auto_deleveraging` — ADL last-resort mechanism, state machine + cooldown enforcement
- 8 programs total in the workspace
- 51/51 integration tests passing in WSL2

**risk-management chain complete:**
- liquidator triggers permissionless liquidations
- insurance_fund tracks bad debt absorption + caps keeper rewards (H-9 fix preserved)
- auto_deleveraging kicks in when insurance fund insufficient

**v0.3 wiring (all 4 programs of phase 2 second-half):**
- engine → vault for margin lock + PnL settlement
- liquidator/auto_deleveraging → engine.open_position with real CPI
- insurance_fund → vault.internal_transfer for keeper rewards

**how to verify locally:**
```bash
git clone https://github.com/asastuai/sur-protocol-solana
cd sur-protocol-solana
yarn install
anchor build
anchor test
# 51 passing
```

requires Anchor CLI 0.31.1 + Solana CLI/Agave 3.1.x. Tests run in WSL2/Linux/macOS (Solana test-validator has a known bug on Windows native).

---

## Discord / community-share text (Solana DeFi servers, Anchor builders)

shipping update — we ported 8 Solidity contracts of SUR Protocol to Solana over the past sessions. monorepo here: github.com/asastuai/sur-protocol-solana

51/51 integration tests passing. core CPIs wired end-to-end including atomic dark-pool settlement (positions opened in engine + fees moved in vault, all in one tx via manual invoke_signed).

if you're a Solana DeFi dev / Anchor builder, looking for:
- code review on the manual invoke_signed CPI pattern (it solves the anchor 0.31.1 cpi+idl-build bug)
- contributors for phase 2 second-half (TradingVault, CollateralManager, OrderSettlement)
- ideas for the agent-API surface

DMs open.

— asastu (Juan)

---

## Notes for posting

- **Pin the tweet thread** if engagement starts. The CPI pattern is the most signal-dense piece — many Solana devs will recognize the bug.
- **Don't promise mainnet timeline** in any post. We're 8/12 contracts done, no audit. Realistic mainnet is 4-6 months minimum.
- **DO emphasize "looking for contribs"** — that's the real ask given the 10 contribs prometidos in the Solana community.
- **Solana program IDs en devnet** appended once deploy succeeds (pending faucet).
