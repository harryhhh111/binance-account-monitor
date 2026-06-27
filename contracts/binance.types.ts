// ============ Spot User Data Stream Events ============

export interface SpotOutboundAccountPosition {
  e: "outboundAccountPosition";
  E: number; // event time
  u: number; // last account update time
  B: {
    a: string; // asset
    f: string; // free
    l: string; // locked
  }[];
}

export interface SpotBalanceUpdate {
  e: "balanceUpdate";
  E: number; // event time
  a: string; // asset
  d: string; // balance delta
  T: number; // clear time
}

export interface SpotExecutionReport {
  e: "executionReport";
  E: number; // event time
  s: string; // symbol
  c: string; // client order id
  S: string; // side (BUY/SELL)
  o: string; // order type
  f: string; // time in force
  q: string; // order quantity
  p: string; // order price
  P: string; // stop price
  F: string; // iceberg quantity
  g: number; // order list id
  C: string; // original client order id
  x: string; // execution type (NEW/CANCELED/REPLACED/REJECTED/TRADE/EXPIRED)
  X: string; // order status (NEW/PARTIALLY_FILLED/FILLED/CANCELED/REJECTED/EXPIRED)
  r: string; // order reject reason
  i: number; // order id
  l: string; // last executed quantity
  z: string; // cumulative filled quantity
  L: string; // last executed price
  n: string; // commission amount
  N: string; // commission asset
  T: number; // transaction time
  t: number; // trade id
  I: number; // ignore
  w: boolean; // is order in the book?
  m: boolean; // is trade the maker side?
  M: boolean; // ignore
  O: number; // order creation time
  Z: string; // cumulative quote asset transacted quantity
  Y: string; // last quote asset transacted quantity
  Q: string; // quote order quantity
  W: number; // working time
  V: string; // self trade prevention mode
}

// ============ Futures User Data Stream Events ============

export interface FuturesAccountUpdate {
  e: "ACCOUNT_UPDATE";
  E: number; // event time
  T: number; // transaction time
  a: {
    B: {
      a: string; // asset
      wb: string; // wallet balance
      cw: string; // cross wallet balance
      bc: string; // balance change
    }[];
    P: {
      s: string; // symbol
      pa: string; // position amount
      ep: string; // entry price
      cr: string; // accumulated realized
      up: string; // unrealized pnl
      mt: string; // margin type (isolated/cross)
      iw: string; // isolated wallet
      ps: string; // position side (BOTH/LONG/SHORT)
      ma: string; // margin asset
      bep: string; // break even price
    }[];
    m: string; // event reason type (DEPOSIT/WITHDRAW/ORDER/...)
  };
}

export interface FuturesOrderTradeUpdate {
  e: "ORDER_TRADE_UPDATE";
  E: number; // event time
  T: number; // transaction time
  o: {
    s: string; // symbol
    c: string; // client order id
    S: string; // side
    o: string; // order type
    f: string; // time in force
    q: string; // original quantity
    p: string; // original price
    ap: string; // average price
    sp: string; // stop price
    x: string; // execution type
    X: string; // order status
    i: number; // order id
    l: string; // last filled quantity
    z: string; // filled accumulated quantity
    L: string; // last filled price
    n: string; // commission amount
    N: string; // commission asset
    T: number; // trade time
    t: number; // trade id
    b: number; // bids notional
    a: number; // asks notional
    m: boolean; // is maker
    R: boolean; // is reduce only
    wt: string; // stop price working type
    ot: string; // original order type
    ps: string; // position side
    cp: boolean; // close all?
    AP: string; // activation price
    cr: string; // callback rate
    rp: string; // realized profit
    pP: boolean; // price protection
    si: number; // ignore
    ss: number; // ignore
    V: string; // self trade prevention
    pm: string; // price match mode
    gtd: number; // good till date
  };
}

export interface FuturesMarginCall {
  e: "MARGIN_CALL";
  E: number;
  cw: string; // cross wallet balance
  p: {
    s: string;
    ps: string;
    pa: string;
    mt: string;
    iw: string;
    mp: string; // mark price
    up: string;
    mm: string; // maintenance margin required
  }[];
}

export interface FuturesAccountConfigUpdate {
  e: "ACCOUNT_CONFIG_UPDATE";
  E: number;
  T: number;
  ac?: {
    s: string;
    l: number; // leverage
  };
  ai?: {
    j: boolean; // multi-assets mode
  };
}

// Union type for all events
export type BinanceEvent =
  | SpotOutboundAccountPosition
  | SpotBalanceUpdate
  | SpotExecutionReport
  | FuturesAccountUpdate
  | FuturesOrderTradeUpdate
  | FuturesMarginCall
  | FuturesAccountConfigUpdate;

// ============ REST API Response Types ============

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceFuturesBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
}

export interface BinanceFuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  breakEvenPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  crossMargin: string;
  crossWalletBalance: string;
}

export interface BinanceOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cumQuote: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  avgPrice: string;
  origType: string;
  positionSide: string;
  time: number;
  updateTime: number;
}

export interface PositionTransition {
  type: "OPEN" | "ADD" | "REDUCE" | "CLOSE" | "FLIP";
  symbol: string;
  positionSide: string;
  prevAmount: number;
  newAmount: number;
  changeAmount: number;
  entryPrice: number;
  realizedPnl?: number;
}
