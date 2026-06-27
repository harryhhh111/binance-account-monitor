import type {
  BinanceEvent,
  SpotOutboundAccountPosition,
  SpotBalanceUpdate,
  SpotExecutionReport,
  FuturesAccountUpdate,
  FuturesOrderTradeUpdate,
  FuturesMarginCall,
  PositionTransition,
} from "@contracts/binance.types";

export interface ProcessedEvent {
  accountId: number;
  source: "spot" | "futures";
  eventType: string;
  eventTime: Date;
  rawJson: Record<string, unknown>;
  // Parsed data
  balanceChanges?: Array<{
    asset: string;
    free: number;
    locked: number;
    walletBalance?: number;
    crossWalletBalance?: number;
  }>;
  orderUpdate?: {
    symbol: string;
    orderId: string;
    clientOrderId: string;
    side: string;
    type: string;
    status: string;
    executionType: string;
    price: number;
    quantity: number;
    executedQty: number;
    avgPrice: number;
    fee: number;
    feeAsset: string;
    isMaker: boolean;
    realizedPnl?: number;
  };
  positionTransitions?: PositionTransition[];
  marginCall?: {
    crossWalletBalance: number;
    positions: Array<{
      symbol: string;
      positionSide: string;
      positionAmt: number;
      markPrice: number;
      unrealizedPnl: number;
      maintenanceMargin: number;
    }>;
  };
}

export class EventProcessor {
  process(
    accountId: number,
    source: "spot" | "futures",
    event: BinanceEvent
  ): ProcessedEvent | null {
    const base: ProcessedEvent = {
      accountId,
      source,
      eventType: event.e,
      eventTime: new Date(event.E || Date.now()),
      rawJson: event as unknown as Record<string, unknown>,
    };

    switch (event.e) {
      case "outboundAccountPosition":
        return this.processOutboundAccountPosition(base, event);
      case "balanceUpdate":
        return this.processBalanceUpdate(base, event);
      case "executionReport":
        return this.processExecutionReport(base, event);
      case "ACCOUNT_UPDATE":
        return this.processAccountUpdate(base, event);
      case "ORDER_TRADE_UPDATE":
        return this.processOrderTradeUpdate(base, event);
      case "MARGIN_CALL":
        return this.processMarginCall(base, event);
      default:
        return base;
    }
  }

  private processOutboundAccountPosition(
    base: ProcessedEvent,
    event: SpotOutboundAccountPosition
  ): ProcessedEvent {
    return {
      ...base,
      balanceChanges: event.B.map((b) => ({
        asset: b.a,
        free: parseFloat(b.f),
        locked: parseFloat(b.l),
      })),
    };
  }

  private processBalanceUpdate(
    base: ProcessedEvent,
    event: SpotBalanceUpdate
  ): ProcessedEvent {
    return {
      ...base,
      balanceChanges: [
        {
          asset: event.a,
          free: parseFloat(event.d), // delta
          locked: 0,
        },
      ],
    };
  }

  private processExecutionReport(
    base: ProcessedEvent,
    event: SpotExecutionReport
  ): ProcessedEvent {
    return {
      ...base,
      orderUpdate: {
        symbol: event.s,
        orderId: String(event.i),
        clientOrderId: event.c,
        side: event.S,
        type: event.o,
        status: event.X,
        executionType: event.x,
        price: parseFloat(event.p) || 0,
        quantity: parseFloat(event.q) || 0,
        executedQty: parseFloat(event.z) || 0,
        avgPrice: parseFloat(event.L) || 0,
        fee: parseFloat(event.n) || 0,
        feeAsset: event.N || "",
        isMaker: event.m,
      },
    };
  }

  private processAccountUpdate(
    base: ProcessedEvent,
    event: FuturesAccountUpdate
  ): ProcessedEvent {
    const balanceChanges = event.a.B.map((b) => ({
      asset: b.a,
      free: 0,
      locked: 0,
      walletBalance: parseFloat(b.wb),
      crossWalletBalance: parseFloat(b.cw),
    }));

    // Derive position transitions
    const positionTransitions: PositionTransition[] = event.a.P.map((p) => {
      const amt = parseFloat(p.pa);
      const entryPrice = parseFloat(p.ep);
      return {
        type: this.derivePositionTransitionType(amt),
        symbol: p.s,
        positionSide: p.ps,
        prevAmount: 0, // Will be filled by state manager
        newAmount: amt,
        changeAmount: amt,
        entryPrice,
      };
    });

    return {
      ...base,
      balanceChanges,
      positionTransitions,
    };
  }

  private processOrderTradeUpdate(
    base: ProcessedEvent,
    event: FuturesOrderTradeUpdate
  ): ProcessedEvent {
    const o = event.o;
    return {
      ...base,
      orderUpdate: {
        symbol: o.s,
        orderId: String(o.i),
        clientOrderId: o.c,
        side: o.S,
        type: o.o,
        status: o.X,
        executionType: o.x,
        price: parseFloat(o.p) || 0,
        quantity: parseFloat(o.q) || 0,
        executedQty: parseFloat(o.l) || 0,
        avgPrice: parseFloat(o.ap) || 0,
        fee: parseFloat(o.n) || 0,
        feeAsset: o.N || "",
        isMaker: o.m,
        realizedPnl: parseFloat(o.rp) || 0,
      },
    };
  }

  private processMarginCall(
    base: ProcessedEvent,
    event: FuturesMarginCall
  ): ProcessedEvent {
    return {
      ...base,
      marginCall: {
        crossWalletBalance: parseFloat(event.cw),
        positions: event.p.map((pos) => ({
          symbol: pos.s,
          positionSide: pos.ps,
          positionAmt: parseFloat(pos.pa),
          markPrice: parseFloat(pos.mp),
          unrealizedPnl: parseFloat(pos.up),
          maintenanceMargin: parseFloat(pos.mm),
        })),
      },
    };
  }

  private derivePositionTransitionType(newAmount: number): PositionTransition["type"] {
    if (newAmount === 0) return "CLOSE";
    // This is simplified - actual transition type requires comparing with previous state
    return "OPEN";
  }

  /**
   * Derive position transition by comparing old and new position amounts
   */
  static derivePositionTransition(
    symbol: string,
    positionSide: string,
    prevAmount: number,
    newAmount: number,
    entryPrice: number,
    realizedPnl?: number
  ): PositionTransition {
    const changeAmount = newAmount - prevAmount;
    let type: PositionTransition["type"];

    if (prevAmount === 0) {
      type = "OPEN";
    } else if (newAmount === 0) {
      type = "CLOSE";
    } else if (Math.sign(prevAmount) !== Math.sign(newAmount)) {
      type = "FLIP";
    } else if (Math.abs(newAmount) > Math.abs(prevAmount)) {
      type = "ADD";
    } else {
      type = "REDUCE";
    }

    return {
      type,
      symbol,
      positionSide,
      prevAmount,
      newAmount,
      changeAmount,
      entryPrice,
      realizedPnl,
    };
  }
}
