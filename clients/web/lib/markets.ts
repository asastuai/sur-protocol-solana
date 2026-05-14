import { MARKET_IDS } from "./devnet-constants";

// UI-side market metadata. The on-chain Market PDAs are derived from the
// 32-byte market id (see MARKET_IDS). Everything else here (max leverage,
// quote asset, display name) is presentation-only and lives in the
// frontend until governance can publish it on-chain.

export interface MarketMeta {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketId: Uint8Array;
  maxLeverage: number;
  tickSize: number;
}

export const MARKETS: ReadonlyArray<MarketMeta> = [
  {
    symbol: "BTC-USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    marketId: MARKET_IDS.BTC_USD,
    maxLeverage: 50,
    tickSize: 0.1,
  },
  {
    symbol: "SOL-USD",
    baseAsset: "SOL",
    quoteAsset: "USD",
    marketId: MARKET_IDS.SOL_USD,
    maxLeverage: 25,
    tickSize: 0.001,
  },
  {
    symbol: "ETH-USD",
    baseAsset: "ETH",
    quoteAsset: "USD",
    marketId: MARKET_IDS.ETH_USD,
    maxLeverage: 50,
    tickSize: 0.01,
  },
] as const;

export function findMarket(symbol: string): MarketMeta | undefined {
  return MARKETS.find((m) => m.symbol === symbol);
}
