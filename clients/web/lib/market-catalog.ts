// ============================================================
//                    MARKET CATALOG (display)
// ============================================================
// The on-chain perp markets are only BTC/SOL/ETH (lib/markets.ts, real
// Market PDAs). This catalog is the *display* universe — 30+ tokens shown
// in the market selector / markets page / ticker with LIVE Binance prices.
// Tokens flagged `onChain` are settle-on-chain tradeable today; the rest are
// live-price display (paper-trade / "coming soon").
//
// Live prices come from hooks/data/use-binance-prices.ts (public market data;
// display only — never used for on-chain settlement, which reads the oracle).

export interface CatalogMarket {
  /** e.g. "BTC-USD" */
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** lowercase Binance spot symbol, e.g. "btcusdt" */
  binanceSymbol: string;
  maxLeverage: number;
  /** price tick for display rounding */
  tickSize: number;
  /** true = a real on-chain market exists (tradeable today) */
  onChain: boolean;
}

const m = (
  symbol: string,
  baseAsset: string,
  binanceSymbol: string,
  maxLeverage: number,
  tickSize: number,
  onChain = false,
): CatalogMarket => ({
  symbol,
  baseAsset,
  quoteAsset: "USD",
  binanceSymbol,
  maxLeverage,
  tickSize,
  onChain,
});

// 32 markets. BTC/SOL/ETH are on-chain (tradeable); the rest are live-price
// display. Order roughly by liquidity / relevance.
export const CATALOG: ReadonlyArray<CatalogMarket> = [
  m("BTC-USD", "BTC", "btcusdt", 50, 0.1, true),
  m("ETH-USD", "ETH", "ethusdt", 50, 0.01, true),
  m("SOL-USD", "SOL", "solusdt", 25, 0.001, true),
  m("BNB-USD", "BNB", "bnbusdt", 25, 0.01),
  m("XRP-USD", "XRP", "xrpusdt", 20, 0.0001),
  m("DOGE-USD", "DOGE", "dogeusdt", 20, 0.00001),
  m("ADA-USD", "ADA", "adausdt", 20, 0.0001),
  m("AVAX-USD", "AVAX", "avaxusdt", 20, 0.01),
  m("LINK-USD", "LINK", "linkusdt", 20, 0.001),
  m("SUI-USD", "SUI", "suiusdt", 20, 0.0001),
  m("TON-USD", "TON", "tonusdt", 20, 0.001),
  m("DOT-USD", "DOT", "dotusdt", 20, 0.001),
  m("TRX-USD", "TRX", "trxusdt", 20, 0.00001),
  m("LTC-USD", "LTC", "ltcusdt", 20, 0.01),
  m("BCH-USD", "BCH", "bchusdt", 20, 0.1),
  m("ATOM-USD", "ATOM", "atomusdt", 20, 0.001),
  m("APT-USD", "APT", "aptusdt", 20, 0.001),
  m("ARB-USD", "ARB", "arbusdt", 20, 0.0001),
  m("OP-USD", "OP", "opusdt", 20, 0.001),
  m("NEAR-USD", "NEAR", "nearusdt", 20, 0.001),
  m("INJ-USD", "INJ", "injusdt", 20, 0.01),
  m("TIA-USD", "TIA", "tiausdt", 20, 0.001),
  m("SEI-USD", "SEI", "seiusdt", 20, 0.0001),
  m("UNI-USD", "UNI", "uniusdt", 20, 0.001),
  m("AAVE-USD", "AAVE", "aaveusdt", 20, 0.01),
  m("FIL-USD", "FIL", "filusdt", 20, 0.001),
  m("RENDER-USD", "RENDER", "renderusdt", 20, 0.001),
  m("FET-USD", "FET", "fetusdt", 20, 0.0001),
  m("JUP-USD", "JUP", "jupusdt", 15, 0.0001),
  m("PYTH-USD", "PYTH", "pythusdt", 15, 0.0001),
  m("WIF-USD", "WIF", "wifusdt", 10, 0.0001),
  m("PEPE-USD", "PEPE", "pepeusdt", 10, 0.00000001),
  m("BONK-USD", "BONK", "bonkusdt", 10, 0.00000001),
];

/** uppercase Binance symbol -> catalog symbol, for mapping feed messages back. */
export const BINANCE_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  CATALOG.map((c) => [c.binanceSymbol.toUpperCase(), c.symbol]),
);

export const CATALOG_BINANCE_SYMBOLS: string[] = CATALOG.map(
  (c) => c.binanceSymbol,
);

export function findCatalogMarket(symbol: string): CatalogMarket | undefined {
  return CATALOG.find((c) => c.symbol === symbol);
}
