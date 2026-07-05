# Devnet Golden Path

Manual walkthrough verifying the SUR web UI end-to-end on Solana devnet.

This is the v1 acceptance test: connect Phantom, deposit USDC, open a BTC long,
verify PnL, close, and withdraw. If every step below succeeds, Phase 9 is done.

---

## Devnet identifiers (current as of `scripts/devnet-state.json`)

| Item              | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Deployer wallet   | `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv`           |
| Test USDC mint    | `B2LJ35rfJbQmhBwdhpzovUfLM5WhFgUNSYVxtDQ8CPnQ` (6 dp)   |
| Markets           | `BTC-USD` @ $65k, `SOL-USD` @ $150, `ETH-USD` @ $3.5k    |
| Cluster           | Solana **devnet**                                        |
| RPC               | `https://api.devnet.solana.com`                          |

> Re-deployed 2026-06-30 (fresh program IDs + fresh test-USDC mint; see
> `scripts/devnet-state.json` for the live state and init step log).

> The "test USDC" is **not** circle/canonical USDC. The deployer is the
> mint authority and can print more for testing. Anyone who imports it
> into Phantom on devnet sees it as a generic SPL token.

---

## Prerequisites — checklist

Before walking the runbook below, ALL of these must be true:

- [ ] Phantom is installed in your browser (Chrome, Brave, or Edge).
- [ ] Phantom is switched to **Devnet** (Settings → Developer Settings →
      Change Network → Devnet).
- [ ] Your Phantom wallet has at least **0.2 devnet SOL** for tx fees.
      Get some at <https://faucet.solana.com>.
- [ ] The init script has been run successfully:
      `wsl.exe bash -lc 'cd ~/projects/sur-protocol-solana && npx ts-node scripts/devnet-init.ts 2>&1 | tail -50'`
- [ ] `scripts/devnet-state.json` exists and lists 3 markets + a USDC mint.
- [ ] `clients/web/lib/devnet-constants.ts::DEVNET_USDC_MINT` matches the
      USDC mint in `devnet-state.json`.
- [ ] You ran `npm install` in `clients/web/` at least once.
- [ ] You know your Phantom wallet pubkey (Phantom → "..." → Copy address).
- [ ] You have transferred at least 1,000 test USDC from the deployer to
      Phantom (see Step 2).
- [ ] You have registered your Phantom wallet as a direct engine operator
      (see Step 3) — **v1 only**, this won't be required after intent_engine
      lands.

If any checkbox is empty, stop and resolve it before continuing.

---

## Step 1 — Start the web app + connect wallet

1. From WSL:
   ```bash
   cd ~/projects/sur-protocol-solana/clients/web
   npm run dev
   ```
2. Open <http://localhost:3000> in your browser.
3. Top-right corner: click **Connect Wallet**.
4. Pick **Phantom**. Phantom opens a popup. Click **Connect**.

**Expected:**
- Top-right corner shows your truncated pubkey (e.g. `7xKX...A3bF`).
- A **Devnet** badge is visible somewhere in the header or banner.
- No console errors.

**Troubleshooting:**
- "WalletNotConnectedError" → Phantom is on Mainnet; switch to Devnet.
- Connect button does nothing → reload the tab once.

---

## Step 2 — Fund Phantom with test USDC

The deployer holds 1M test USDC. Transfer 1,000 to your Phantom:

```bash
wsl.exe bash -lc 'cd ~/projects/sur-protocol-solana && \
  npx ts-node scripts/transfer-test-usdc.ts <YOUR_PHANTOM_PUBKEY> 1000'
```

**Expected output:**
```
source:   4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv
target:   <your phantom pubkey>
usdc:     531Kuibtkhht9sZiqaoYRGm8c6agQz9iScZQEDctokEn
amount:   1000 USDC
✅ transferred: <tx sig>
explorer: https://explorer.solana.com/tx/<sig>?cluster=devnet
```

Open the explorer link to confirm.

In Phantom: open the wallet, click your account, scroll to "Tokens".
You should see the USDC mint listed with a balance of `1,000` (or
`1,000.00000` — Phantom shows 6 decimals).

**Troubleshooting:**
- Phantom doesn't show the token → click "Manage Token List" and toggle
  "Show Unverified Tokens". The deployer's mint is not on a registry.
- "Account does not exist" → make sure you ran the init script first; the
  USDC mint won't exist otherwise.

---

## Step 3 — Register Phantom as engine operator (v1 only)

v1 SUR has no `intent_engine` yet, so the only signers allowed to call
`perp_engine.open_position` are wallets registered as engine operators by
the deployer. Run:

```bash
wsl.exe bash -lc 'cd ~/projects/sur-protocol-solana && \
  npx ts-node scripts/register-operator.ts <YOUR_PHANTOM_PUBKEY>'
```

**Expected output:**
```
operator:    <your phantom pubkey>
operatorPda: <derived PDA>
✅ registered: <tx sig>
explorer: https://explorer.solana.com/tx/<sig>?cluster=devnet
```

Or, if you've run it already:

```
✅ already registered (operator PDA exists)
```

> Production removes this step. The web UI will call `intent_engine.post_intent`,
> which is permissionless, and the executor on the backend will be the only
> wallet allowed to settle.

---

## Step 4 — Deposit USDC into the perp vault

1. Navigate to **/trade**.
2. Find the "Deposit / Withdraw" panel (right-hand sidebar on desktop).
3. Click the **Deposit** tab.
4. Enter `100` in the amount field.
5. Click **Deposit**.
6. Phantom popup → click **Confirm**.

**Expected:**
- Toast in bottom-right: "Deposited 100 USDC" with a small "View tx" link.
- The "Vault Balance" indicator updates from `$0.00` to `$100.00`.
- Phantom's USDC balance drops from 1,000 → 900.

**Troubleshooting:**
- `AccountNotInitialized: vault_config` → init script wasn't run; run it.
- `0x1` token program error → your USDC mint doesn't match the on-chain
  one. Re-check `DEVNET_USDC_MINT` in `clients/web/lib/devnet-constants.ts`
  matches `scripts/devnet-state.json::usdcMint`. Rebuild the web app
  (`npm run build && npm run dev`) after fixing.
- Toast says "Insufficient lamports" → top up Phantom SOL at faucet.

---

## Step 5 — Open a BTC long

1. Still on **/trade**.
2. Select the **BTC-USD** market (top dropdown or market tabs).
3. Confirm the mark price reads roughly **$65,000** (the init script
   seeded it; price won't drift without a keeper).
4. In the "Open Position" panel, pick **Long**.
5. Enter size `0.01` BTC (notional ≈ $650, well within your $100 margin
   capacity at 5% initial margin = $32.50).
6. Click **Open Long**.
7. Phantom popup → **Confirm**.

**Expected:**
- Toast: "Opened LONG 0.01 BTC @ ~$65,000".
- A new row appears in the "Positions" panel:
  - **Side**: LONG
  - **Size**: 0.01 BTC
  - **Entry**: $65,000.000000
  - **Mark**: $65,000.000000
  - **uPnL**: $0.00
  - **Margin**: $32.50
- Vault balance drops from $100.00 → $67.50 (margin locked).

**Troubleshooting:**
- `NotOperator` → you didn't run Step 3 for your Phantom pubkey. Run it.
- `MarketNotFound` → the market wasn't created on devnet (init script
  failed at `engine.add_market.BTC-USD`). Re-run init.
- `BalanceTooLow` → you didn't deposit in Step 4, or the deposit failed
  silently. Re-check the deposit toast.

---

## Step 6 — Verify the position across all surfaces

The same position should be visible on three different routes:

1. **/trade** — Positions panel shows the row described above.
2. **/portfolio** — One row in the "Open Positions" table.
3. **/dashboard** — One position in the "Open Positions" widget; the
   "Total Notional" and "Total Margin" widgets reflect the new position.

If any of these show a stale empty state, click the refresh button (or
reload the tab — React Query polls every 6-10s by default).

**Bonus (optional):**
- Push the mark price up to $66,000 via:
  ```bash
  # No CLI for this yet — would require an operator-signed tx through
  # the oracle_router or directly via engine.update_mark_price.
  # Skip for the golden path; v1 doesn't have a mark-price keeper.
  ```
  This step is documented but **out of scope** for the golden path —
  PnL will read $0 unless a price moves.

---

## Step 7 — Close the position

1. On **/trade**, find your open BTC long in the Positions panel.
2. Click **Close** on that row.
3. Confirmation modal: review size + estimated PnL.
4. Click **Confirm Close**.
5. Phantom popup → **Confirm**.

**Expected:**
- Toast: "Closed 0.01 BTC @ ~$65,000, PnL $0.00".
- The position row disappears from /trade, /portfolio, /dashboard.
- Vault balance returns to $100.00 (margin released, no PnL).

**Troubleshooting:**
- `PositionNotFound` → already closed, or the trader/market combo doesn't
  match (rare race; reload).

---

## Step 8 — Withdraw remaining USDC

1. **Deposit / Withdraw** panel → **Withdraw** tab.
2. Enter `100`.
3. Click **Withdraw**.
4. Phantom popup → **Confirm**.

**Expected:**
- Toast: "Withdrew 100 USDC".
- Vault balance drops from $100.00 → $0.00.
- Phantom USDC returns to 1,000.

**Troubleshooting:**
- `InsufficientBalance` → some margin still locked. Make sure Step 7
  fully closed; check /portfolio for any residual position.
- Withdrawal goes through but Phantom doesn't update → Phantom caches
  token balances; click "Manage Token List" → refresh, or reopen Phantom.

---

## Step 9 (optional) — A2A darkpool intent

If you have time, exercise the dark-pool flow:

1. Navigate to **/darkpool**.
2. **Post Intent**: BUY 0.005 BTC, max $66,000, expires in 1 hour.
3. Sign the tx.
4. On a second Phantom (or via the deployer wallet), navigate back to
   **/darkpool** and accept the intent.

This requires a second registered operator. Skip unless you've set one up.

---

## Verification matrix — pass criteria

For Phase 9 to be considered DONE, every checkbox below must be ticked:

- [ ] Wallet connect on /trade works without errors.
- [ ] Devnet badge is visible in the UI.
- [ ] Deposit 100 USDC succeeds; vault balance reads $100.00.
- [ ] Open BTC long 0.01 succeeds; position visible on /trade.
- [ ] Position is also visible on /portfolio and /dashboard.
- [ ] Close position succeeds; vault balance returns to $100.00.
- [ ] Withdraw 100 USDC succeeds; Phantom USDC reads 1,000.
- [ ] No console errors thrown at any point.
- [ ] All toasts contain a clickable explorer link.

---

## Troubleshooting catalog

| Error              | Likely cause                              | Fix                                                              |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| WalletNotConnected | Phantom not on devnet, or not connected   | Switch network in Phantom; click "Connect Wallet" again          |
| AccountNotInit     | Init script not run, or wrong USDC mint   | `npx ts-node scripts/devnet-init.ts`; verify `DEVNET_USDC_MINT`  |
| NotOperator        | Phantom isn't registered as engine op     | `npx ts-node scripts/register-operator.ts <pubkey>`              |
| MarketNotFound     | `engine.add_market` failed on init        | Re-run init; check the failing step's error                      |
| Insufficient funds | Phantom out of SOL, or vault out of USDC  | <https://faucet.solana.com>; or run `transfer-test-usdc.ts`      |
| Simulation failed  | Generic — needs full logs                 | Click "View tx" in toast; expand "Program logs" in Solana Explorer |
| 0x1 (token)        | USDC mint mismatch                        | Sync `lib/devnet-constants.ts` with `scripts/devnet-state.json`  |
| MarketStale        | Mark price drift > cooldown               | Re-push price via engine.update_mark_price (deployer ops)        |

---

## Reset / re-init

If devnet state gets corrupted:

```bash
# 1. Delete the state file so the script re-creates the USDC mint
rm scripts/devnet-state.json

# 2. Re-run the init script (it will mint a fresh USDC and update
#    clients/web/lib/devnet-constants.ts automatically)
npx ts-node scripts/devnet-init.ts

# 3. Rebuild the web app
cd clients/web && npm run build && npm run dev

# 4. In your test wallet, "Hide" the old USDC mint and re-add the new one
```

> Note: this does **not** un-initialize on-chain programs. Their PDAs
> persist forever. A fresh USDC mint means the on-chain `vault_config.usdc_mint`
> will mismatch; you'd need a new program deployment to fully reset.

---

*Last updated: 2026-05-14 — Phase 9 (final). Maintained by Juan Cruz Maisú.*
