import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SurPdas } from "../pdas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = any;

const SIZE_PRECISION = new BN(100_000_000);
const PRICE_PRECISION = new BN(1_000_000);
const BPS = new BN(10_000);

// Position layout: 8 (disc) + 1 (bump) + 32 (market_id) = 41 bytes before `trader`.
const POSITION_TRADER_OFFSET = 41;

export interface AccountDetails {
  totalEquity: BN;
  totalInitialRequired: BN;
  totalMaintenanceRequired: BN;
  totalNotional: BN;
  freeBalance: BN;
  positionCount: number;
  totalUnrealizedPnl: BN;
}

interface PositionAccount {
  bump: number;
  marketId: number[] | Uint8Array;
  trader: PublicKey;
  size: BN;
  entryPrice: BN;
  margin: BN;
  lastUpdated: BN;
}

interface MarketAccount {
  bump: number;
  marketId: number[] | Uint8Array;
  active: boolean;
  initialMarginBps: BN;
  maintenanceMarginBps: BN;
  maxPositionSize: BN;
  markPrice: BN;
  indexPrice: BN;
  lastPriceUpdate: BN;
  openInterestLong: BN;
  openInterestShort: BN;
}

function absBN(n: BN): BN {
  return n.isNeg() ? n.neg() : n.clone();
}

/**
 * Read-only views over PerpEngine state. Mirrors Solidity PerpEngineView.sol.
 *
 * Storage paradigm divergence: Solidity tracks `traderActiveMarkets[trader]` as a
 * dynamic array; Solana port has no such index, so this enumerates positions via
 * `connection.getProgramAccounts` with a memcmp filter on `Position.trader`.
 */
export class PerpEngineView {
  private readonly engine: AnyProgram;
  private readonly vaultProgram?: AnyProgram;

  constructor(engine: AnyProgram, vaultProgram?: AnyProgram) {
    this.engine = engine;
    this.vaultProgram = vaultProgram;
  }

  /**
   * Sum equity / margin requirements / notional / unrealized PnL across all
   * non-zero positions held by `trader`. `freeBalance` requires `vaultProgram`
   * to have been passed to the constructor; otherwise it returns BN(0).
   */
  async getAccountDetails(trader: PublicKey): Promise<AccountDetails> {
    const positions = await this.engine.account.position.all([
      {
        memcmp: {
          offset: POSITION_TRADER_OFFSET,
          bytes: trader.toBase58(),
        },
      },
    ]);

    let totalInitialRequired = new BN(0);
    let totalMaintenanceRequired = new BN(0);
    let totalNotional = new BN(0);
    let totalUnrealizedPnl = new BN(0);
    let positionEquity = new BN(0);
    let positionCount = 0;

    for (const entry of positions) {
      const pos = entry.account as PositionAccount;
      if (pos.size.isZero()) continue;

      positionCount += 1;

      const marketIdBytes = Buffer.from(pos.marketId as Uint8Array);
      const [marketPda] = SurPdas.market(marketIdBytes);
      const market = (await this.engine.account.market.fetch(
        marketPda,
      )) as MarketAccount;

      const absSize = absBN(pos.size);
      const notional = market.markPrice.mul(absSize).div(SIZE_PRECISION);
      const priceDiff = market.markPrice.sub(pos.entryPrice);
      const pnl = priceDiff.mul(pos.size).div(SIZE_PRECISION);

      positionEquity = positionEquity.add(pos.margin).add(pnl);
      totalUnrealizedPnl = totalUnrealizedPnl.add(pnl);
      totalNotional = totalNotional.add(notional);
      totalInitialRequired = totalInitialRequired.add(
        notional.mul(market.initialMarginBps).div(BPS),
      );
      totalMaintenanceRequired = totalMaintenanceRequired.add(
        notional.mul(market.maintenanceMarginBps).div(BPS),
      );
    }

    let freeBalance = new BN(0);
    if (this.vaultProgram) {
      const [balancePda] = SurPdas.accountBalance(trader);
      try {
        const bal = (await this.vaultProgram.account.accountBalance.fetch(
          balancePda,
        )) as { balance: BN };
        freeBalance = bal.balance;
      } catch {
        freeBalance = new BN(0);
      }
    }

    const totalEquity = freeBalance.add(positionEquity);

    return {
      totalEquity,
      totalInitialRequired,
      totalMaintenanceRequired,
      totalNotional,
      freeBalance,
      positionCount,
      totalUnrealizedPnl,
    };
  }

  /**
   * Liquidation price for a single position. Returns BN(0) if the position is
   * empty / invalid, or if a long is already so far underwater that liqPrice
   * would be negative.
   *
   * long:  liqPrice = entryPrice - (margin - maintMargin) * SIZE_PRECISION / absSize
   * short: liqPrice = entryPrice + (margin - maintMargin) * SIZE_PRECISION / absSize
   * margin <= maintMargin → return entryPrice (already liquidatable)
   */
  async getLiquidationPrice(
    marketId: PublicKey | Buffer | Uint8Array,
    trader: PublicKey,
  ): Promise<BN> {
    const idBytes =
      marketId instanceof PublicKey ? marketId.toBuffer() : Buffer.from(marketId);

    const [positionPda] = SurPdas.position(idBytes, trader);
    const [marketPda] = SurPdas.market(idBytes);

    const pos = (await this.engine.account.position.fetch(
      positionPda,
    )) as PositionAccount;

    if (pos.size.isZero() || pos.margin.isZero()) return new BN(0);

    const market = (await this.engine.account.market.fetch(
      marketPda,
    )) as MarketAccount;

    const absSize = absBN(pos.size);
    const notional = pos.entryPrice.mul(absSize).div(SIZE_PRECISION);
    const maintMargin = notional.mul(market.maintenanceMarginBps).div(BPS);

    if (pos.margin.lte(maintMargin)) return pos.entryPrice;

    const buffer = pos.margin.sub(maintMargin);

    if (pos.size.isNeg()) {
      const priceRise = buffer.mul(SIZE_PRECISION).div(absSize);
      return pos.entryPrice.add(priceRise);
    }

    const priceDrop = buffer.mul(SIZE_PRECISION).div(absSize);
    return pos.entryPrice.gt(priceDrop) ? pos.entryPrice.sub(priceDrop) : new BN(0);
  }
}

export { SIZE_PRECISION, PRICE_PRECISION, BPS };
