# @asastuai/sur-sdk

TypeScript SDK for SUR Protocol on Solana.

## Status — v0.0.1 (skeleton)

Ships:
- ✅ Canonical program IDs for all 5 programs
- ✅ PDA derivation helpers for every account in the protocol
- ⏳ Typed program clients (Anchor IDL bundled)
- ⏳ High-level helpers (depositUSDC, openPositionAtomic, settleA2A)
- ⏳ Agent-API wrappers + MCP tool definitions

## Install

```bash
yarn add @asastuai/sur-sdk
# or
npm install @asastuai/sur-sdk
```

## Usage

```ts
import { SUR_PROGRAM_IDS, SurPdas } from "@asastuai/sur-sdk";
import { PublicKey } from "@solana/web3.js";

const trader = new PublicKey("...");

// Find a trader's vault deposit balance PDA
const [balancePda] = SurPdas.accountBalance(trader);

// Find the BTC-USD market in perp_engine
const marketIdBtc = Buffer.alloc(32);
Buffer.from("BTC-USD").copy(marketIdBtc);
const [marketPda] = SurPdas.market(new Uint8Array(marketIdBtc));

// Find the trader's position in BTC-USD
const [positionPda] = SurPdas.position(new Uint8Array(marketIdBtc), trader);
```

## Build

```bash
yarn install
yarn build
```

## License

BUSL-1.1 — same as upstream `sur-protocol-solana` monorepo.
