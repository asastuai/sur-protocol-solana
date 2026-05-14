// UI-level types. Network-agnostic — used by presentation components.
// On-chain types live in hooks/data/* and use BN.

export interface MarketUi {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: number;
  indexPrice: number;
  openInterestLong: number;
  openInterestShort: number;
  initialMarginBps: number;
  maxLeverage: number;
  active: boolean;
}

export interface PositionUi {
  pdaBase58: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  margin: number;
  leverage: number;
  markPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  liquidationPrice: number;
}

export interface AccountUi {
  connected: boolean;
  addressBase58: string | null;
  freeBalance: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
  marginUsed: number;
  positionCount: number;
}
