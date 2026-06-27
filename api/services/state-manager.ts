import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  balances,
  orders,
  positions,
  accountEvents,
  alerts,
} from "@db/schema";
import type { ProcessedEvent } from "./event-processor";
import { EventProcessor } from "./event-processor";
import type {
  BinanceBalance,
  BinanceFuturesBalance,
  BinanceFuturesPosition,
  BinanceOrder,
} from "@contracts/binance.types";

export class StateManager {
  private eventProcessor = new EventProcessor();
  private positionCache = new Map<string, { amt: number; side: string }>();

  // ========== Snapshot Loading ==========

  async loadSpotBalances(
    accountId: number,
    balancesData: BinanceBalance[]
  ): Promise<void> {
    const db = getDb();

    for (const b of balancesData) {
      const free = parseFloat(b.free);
      const locked = parseFloat(b.locked);

      await db
        .insert(balances)
        .values({
          accountId,
          marketType: "spot",
          asset: b.asset,
          free: String(free),
          locked: String(locked),
        })
        .onDuplicateKeyUpdate({
          set: {
            free: String(free),
            locked: String(locked),
            updatedAt: new Date(),
          },
        });
    }
  }

  async loadFuturesBalances(
    accountId: number,
    balancesData: BinanceFuturesBalance[]
  ): Promise<void> {
    const db = getDb();

    for (const b of balancesData) {
      const walletBalance = parseFloat(b.balance);
      const crossWalletBalance = parseFloat(b.crossWalletBalance);

      await db
        .insert(balances)
        .values({
          accountId,
          marketType: "futures",
          asset: b.asset,
          free: String(parseFloat(b.availableBalance)),
          locked: String(walletBalance - parseFloat(b.availableBalance)),
          walletBalance: String(walletBalance),
          crossWalletBalance: String(crossWalletBalance),
        })
        .onDuplicateKeyUpdate({
          set: {
            free: String(parseFloat(b.availableBalance)),
            locked: String(walletBalance - parseFloat(b.availableBalance)),
            walletBalance: String(walletBalance),
            crossWalletBalance: String(crossWalletBalance),
            updatedAt: new Date(),
          },
        });
    }
  }

  async loadFuturesPositions(
    accountId: number,
    positionsData: BinanceFuturesPosition[]
  ): Promise<void> {
    const db = getDb();

    // Clear old positions first (we'll re-insert current ones)
    await db
      .delete(positions)
      .where(eq(positions.accountId, accountId));

    for (const p of positionsData) {
      const positionAmt = parseFloat(p.positionAmt);

      // Cache for transition detection
      const cacheKey = `${accountId}-${p.symbol}-${p.positionSide}`;
      this.positionCache.set(cacheKey, {
        amt: positionAmt,
        side: p.positionSide,
      });

      await db.insert(positions).values({
        accountId,
        symbol: p.symbol,
        positionSide: p.positionSide as "BOTH" | "LONG" | "SHORT",
        positionAmt: String(positionAmt),
        entryPrice: String(parseFloat(p.entryPrice)),
        breakEvenPrice: String(parseFloat(p.breakEvenPrice)),
        unrealizedPnl: String(parseFloat(p.unRealizedProfit)),
        marginType: p.marginType as "isolated" | "cross",
        isolatedWallet: String(parseFloat(p.isolatedMargin)),
        notionalValue: String(parseFloat(p.notional)),
        liquidationPrice: String(parseFloat(p.liquidationPrice)),
        leverage: parseInt(p.leverage),
      });
    }
  }

  async loadOrders(
    accountId: number,
    marketType: "spot" | "futures",
    ordersData: BinanceOrder[]
  ): Promise<void> {
    const db = getDb();

    for (const o of ordersData) {
      await db
        .insert(orders)
        .values({
          accountId,
          marketType,
          symbol: o.symbol,
          orderId: String(o.orderId),
          clientOrderId: o.clientOrderId,
          side: o.side,
          type: o.type,
          status: o.status,
          price: o.price,
          quantity: o.origQty,
          executedQty: o.executedQty,
          avgPrice: o.avgPrice,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: o.status,
            executedQty: o.executedQty,
            avgPrice: o.avgPrice,
            updatedAt: new Date(),
          },
        });
    }
  }

  // ========== Event Processing ==========

  async processEvent(
    accountId: number,
    source: "spot" | "futures",
    event: any
  ): Promise<ProcessedEvent | null> {
    const processed = this.eventProcessor.process(accountId, source, event);
    if (!processed) return null;

    const db = getDb();

    // Save raw event
    await db.insert(accountEvents).values({
      accountId,
      source,
      eventType: processed.eventType,
      eventTime: processed.eventTime,
      rawJson: processed.rawJson,
      processed: 1,
    });

    // Update balances
    if (processed.balanceChanges) {
      for (const change of processed.balanceChanges) {
        if (source === "spot") {
          await this.updateSpotBalance(accountId, change.asset, change.free, change.locked);
        } else {
          await this.updateFuturesBalance(
            accountId,
            change.asset,
            change.walletBalance || 0,
            change.crossWalletBalance || 0
          );
        }
      }
    }

    // Update orders
    if (processed.orderUpdate) {
      await this.updateOrder(accountId, source, processed.orderUpdate);
    }

    // Update positions (futures)
    if (processed.positionTransitions && source === "futures") {
      for (const transition of processed.positionTransitions) {
        await this.updatePosition(accountId, transition);
      }
    }

    return processed;
  }

  private async updateSpotBalance(
    accountId: number,
    asset: string,
    free: number,
    locked: number
  ): Promise<void> {
    const db = getDb();

    await db
      .insert(balances)
      .values({
        accountId,
        marketType: "spot",
        asset,
        free: String(free),
        locked: String(locked),
      })
      .onDuplicateKeyUpdate({
        set: {
          free: String(free),
          locked: String(locked),
          updatedAt: new Date(),
        },
      });
  }

  private async updateFuturesBalance(
    accountId: number,
    asset: string,
    walletBalance: number,
    crossWalletBalance: number
  ): Promise<void> {
    const db = getDb();

    await db
      .insert(balances)
      .values({
        accountId,
        marketType: "futures",
        asset,
        walletBalance: String(walletBalance),
        crossWalletBalance: String(crossWalletBalance),
      })
      .onDuplicateKeyUpdate({
        set: {
          walletBalance: String(walletBalance),
          crossWalletBalance: String(crossWalletBalance),
          updatedAt: new Date(),
        },
      });
  }

  private async updateOrder(
    accountId: number,
    marketType: "spot" | "futures",
    orderUpdate: NonNullable<ProcessedEvent["orderUpdate"]>
  ): Promise<void> {
    const db = getDb();

    await db
      .insert(orders)
      .values({
        accountId,
        marketType,
        symbol: orderUpdate.symbol,
        orderId: orderUpdate.orderId,
        clientOrderId: orderUpdate.clientOrderId,
        side: orderUpdate.side,
        type: orderUpdate.type,
        status: orderUpdate.status,
        price: String(orderUpdate.price),
        quantity: String(orderUpdate.quantity),
        executedQty: String(orderUpdate.executedQty),
        avgPrice: String(orderUpdate.avgPrice),
        fee: String(orderUpdate.fee),
        feeAsset: orderUpdate.feeAsset,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: orderUpdate.status,
          executedQty: String(orderUpdate.executedQty),
          avgPrice: String(orderUpdate.avgPrice),
          fee: String(orderUpdate.fee),
          updatedAt: new Date(),
        },
      });
  }

  private async updatePosition(
    accountId: number,
    transition: NonNullable<ProcessedEvent["positionTransitions"]>[0]
  ): Promise<void> {
    const db = getDb();
    const cacheKey = `${accountId}-${transition.symbol}-${transition.positionSide}`;
    const prev = this.positionCache.get(cacheKey);
    const prevAmount = prev?.amt || 0;

    // Re-derive transition type with actual previous amount
    const actualTransition = EventProcessor.derivePositionTransition(
      transition.symbol,
      transition.positionSide,
      prevAmount,
      transition.newAmount,
      transition.entryPrice,
      transition.realizedPnl
    );

    // Update cache
    this.positionCache.set(cacheKey, {
      amt: transition.newAmount,
      side: transition.positionSide,
    });

    if (transition.newAmount === 0) {
      // Position closed - delete
      await db
        .delete(positions)
        .where(
          and(
            eq(positions.accountId, accountId),
            eq(positions.symbol, transition.symbol),
            eq(positions.positionSide, transition.positionSide as any)
          )
        );
    } else {
      // Upsert position
      await db
        .insert(positions)
        .values({
          accountId,
          symbol: transition.symbol,
          positionSide: transition.positionSide as "BOTH" | "LONG" | "SHORT",
          positionAmt: String(transition.newAmount),
          entryPrice: String(transition.entryPrice),
        })
        .onDuplicateKeyUpdate({
          set: {
            positionAmt: String(transition.newAmount),
            entryPrice: String(transition.entryPrice),
            updatedAt: new Date(),
          },
        });
    }

    // Update the transition in the processed event
    transition.type = actualTransition.type;
    transition.prevAmount = prevAmount;
    transition.changeAmount = actualTransition.changeAmount;
  }

  // ========== Reconciliation ==========

  async reconcileBalances(
    accountId: number,
    marketType: "spot" | "futures",
    remoteBalances: Array<{
      asset: string;
      free: number;
      locked?: number;
      walletBalance?: number;
      crossWalletBalance?: number;
    }>
  ): Promise<Array<{ asset: string; local: number; remote: number; diff: number }>> {
    const db = getDb();
    const diffs: Array<{ asset: string; local: number; remote: number; diff: number }> = [];

    for (const remote of remoteBalances) {
      const localRows = await db
        .select()
        .from(balances)
        .where(
          and(
            eq(balances.accountId, accountId),
            eq(balances.marketType, marketType),
            eq(balances.asset, remote.asset)
          )
        );

      const localTotal = localRows.length > 0
        ? parseFloat(String(localRows[0].free)) + parseFloat(String(localRows[0].locked || 0))
        : 0;
      const remoteTotal = remote.free + (remote.locked || 0);

      if (Math.abs(localTotal - remoteTotal) > 0.00000001) {
        diffs.push({
          asset: remote.asset,
          local: localTotal,
          remote: remoteTotal,
          diff: remoteTotal - localTotal,
        });

        // Fix local state
        if (marketType === "spot") {
          await this.updateSpotBalance(accountId, remote.asset, remote.free, remote.locked || 0);
        } else {
          await this.updateFuturesBalance(
            accountId,
            remote.asset,
            remote.walletBalance || 0,
            remote.crossWalletBalance || 0
          );
        }
      }
    }

    return diffs;
  }

  async createAlert(
    accountId: number,
    alertType: string,
    severity: "info" | "warning" | "critical",
    title: string,
    message: string,
    symbol?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const db = getDb();
    await db.insert(alerts).values({
      accountId,
      alertType: alertType as any,
      severity,
      title,
      message,
      symbol,
      details,
    });
  }

  // ========== Queries ==========

  async getBalances(accountId: number, marketType?: "spot" | "futures") {
    const db = getDb();
    const conditions = [eq(balances.accountId, accountId)];
    if (marketType) {
      conditions.push(eq(balances.marketType, marketType));
    }
    return db.select().from(balances).where(and(...conditions));
  }

  async getOrders(
    accountId: number,
    marketType?: "spot" | "futures",
    status?: string
  ) {
    const db = getDb();
    const conditions = [eq(orders.accountId, accountId)];
    if (marketType) {
      conditions.push(eq(orders.marketType, marketType));
    }
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    return db.select().from(orders).where(and(...conditions));
  }

  async getPositions(accountId: number) {
    const db = getDb();
    return db
      .select()
      .from(positions)
      .where(eq(positions.accountId, accountId));
  }

  async getRecentAlerts(accountId: number, limit = 50) {
    const db = getDb();
    return db
      .select()
      .from(alerts)
      .where(eq(alerts.accountId, accountId))
      .orderBy(sql`${alerts.createdAt} DESC`)
      .limit(limit);
  }

  async getRecentEvents(accountId: number, limit = 100) {
    const db = getDb();
    return db
      .select()
      .from(accountEvents)
      .where(eq(accountEvents.accountId, accountId))
      .orderBy(sql`${accountEvents.createdAt} DESC`)
      .limit(limit);
  }
}
