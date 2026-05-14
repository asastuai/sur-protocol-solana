import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { PerpEngineView } from "./perp_engine_view";

const SIZE_PRECISION = new BN(100_000_000);
const BPS = new BN(10_000);

function mockProgram(position: any, market: any) {
  return {
    account: {
      position: { fetch: async (_pda: PublicKey) => position },
      market: { fetch: async (_pda: PublicKey) => market },
    },
  } as any;
}

const dummyMarketId = Buffer.alloc(32, 1);
const dummyTrader = new PublicKey("11111111111111111111111111111112");

describe("PerpEngineView.getLiquidationPrice", () => {
  it("computes liquidation price for a healthy long position", async () => {
    // Long 1.0 BTC (size = 1 * SIZE_PRECISION = 1e8)
    // entryPrice = 50_000 * 1e6 (USDC has 6 decimals in this protocol)
    // margin = 5_000 * 1e6 USDC
    // maintenance bps = 250 (2.5%)
    const entryPrice = new BN(50_000).mul(new BN(1_000_000));
    const size = new BN(1).mul(SIZE_PRECISION);
    const margin = new BN(5_000).mul(new BN(1_000_000));
    const maintenanceMarginBps = new BN(250);

    const position = {
      bump: 0,
      marketId: Array.from(dummyMarketId),
      trader: dummyTrader,
      size,
      entryPrice,
      margin,
      lastUpdated: new BN(0),
    };
    const market = {
      bump: 0,
      marketId: Array.from(dummyMarketId),
      active: true,
      initialMarginBps: new BN(500),
      maintenanceMarginBps,
      maxPositionSize: new BN(0),
      markPrice: entryPrice,
      indexPrice: entryPrice,
      lastPriceUpdate: new BN(0),
      openInterestLong: new BN(0),
      openInterestShort: new BN(0),
    };

    const view = new PerpEngineView(mockProgram(position, market));
    const liqPrice = await view.getLiquidationPrice(dummyMarketId, dummyTrader);

    // Hand-computed expectation, mirroring Solidity formula exactly:
    //   notional       = entryPrice * absSize / SIZE_PRECISION
    //                  = 50_000e6 * 1e8 / 1e8 = 50_000e6
    //   maintMargin    = notional * 250 / 10_000 = 1_250e6
    //   buffer         = margin - maintMargin = 5_000e6 - 1_250e6 = 3_750e6
    //   priceDrop      = buffer * SIZE_PRECISION / absSize
    //                  = 3_750e6 * 1e8 / 1e8 = 3_750e6
    //   liqPrice       = entryPrice - priceDrop = 50_000e6 - 3_750e6 = 46_250e6
    const absSize = size;
    const notional = entryPrice.mul(absSize).div(SIZE_PRECISION);
    const maintMargin = notional.mul(maintenanceMarginBps).div(BPS);
    const buffer = margin.sub(maintMargin);
    const priceDrop = buffer.mul(SIZE_PRECISION).div(absSize);
    const expected = entryPrice.sub(priceDrop);

    assert.equal(liqPrice.toString(), expected.toString());
    assert.equal(liqPrice.toString(), new BN(46_250).mul(new BN(1_000_000)).toString());
  });

  it("returns entryPrice when long margin <= maintMargin (already liquidatable)", async () => {
    const entryPrice = new BN(50_000).mul(new BN(1_000_000));
    const size = new BN(1).mul(SIZE_PRECISION);
    // margin barely above zero, well below maintenance requirement
    const margin = new BN(100).mul(new BN(1_000_000));
    const maintenanceMarginBps = new BN(250);

    const position = {
      bump: 0,
      marketId: Array.from(dummyMarketId),
      trader: dummyTrader,
      size,
      entryPrice,
      margin,
      lastUpdated: new BN(0),
    };
    const market = {
      bump: 0,
      marketId: Array.from(dummyMarketId),
      active: true,
      initialMarginBps: new BN(500),
      maintenanceMarginBps,
      maxPositionSize: new BN(0),
      markPrice: entryPrice,
      indexPrice: entryPrice,
      lastPriceUpdate: new BN(0),
      openInterestLong: new BN(0),
      openInterestShort: new BN(0),
    };

    const view = new PerpEngineView(mockProgram(position, market));
    const liqPrice = await view.getLiquidationPrice(dummyMarketId, dummyTrader);

    assert.equal(liqPrice.toString(), entryPrice.toString());
  });
});
