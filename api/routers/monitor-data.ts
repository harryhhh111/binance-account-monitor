import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  balances,
  orders,
  positions,
  accountEvents,
  alerts,
  connectionStatus,
} from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export const monitorDataRouter = createRouter({
  // Balances
  balances: publicQuery
    .input(
      z.object({
        accountId: z.number(),
        marketType: z.enum(["spot", "futures"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [eq(balances.accountId, input.accountId)];
      if (input.marketType) {
        conditions.push(eq(balances.marketType, input.marketType));
      }
      return db
        .select()
        .from(balances)
        .where(and(...conditions))
        .orderBy(desc(balances.updatedAt));
    }),

  // Orders
  orders: publicQuery
    .input(
      z.object({
        accountId: z.number(),
        marketType: z.enum(["spot", "futures"]).optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [eq(orders.accountId, input.accountId)];
      if (input.marketType) {
        conditions.push(eq(orders.marketType, input.marketType));
      }
      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }
      return db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.updatedAt));
    }),

  // Positions
  positions: publicQuery
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(positions)
        .where(eq(positions.accountId, input.accountId))
        .orderBy(desc(positions.updatedAt));
    }),

  // Events
  events: publicQuery
    .input(
      z.object({
        accountId: z.number(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(accountEvents)
        .where(eq(accountEvents.accountId, input.accountId))
        .orderBy(desc(accountEvents.createdAt))
        .limit(input.limit);
    }),

  // Alerts
  alerts: publicQuery
    .input(
      z.object({
        accountId: z.number(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(alerts)
        .where(eq(alerts.accountId, input.accountId))
        .orderBy(desc(alerts.createdAt))
        .limit(input.limit);
    }),

  // Connection Status
  connectionStatus: publicQuery
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(connectionStatus)
        .where(eq(connectionStatus.accountId, input.accountId));
    }),

  // Dashboard summary
  dashboard: publicQuery
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const accountId = input.accountId;

      const [spotBalancesList, futuresBalancesList, positionsList, openOrders, recentAlerts, recentEvents] =
        await Promise.all([
          db
            .select()
            .from(balances)
            .where(
              and(
                eq(balances.accountId, accountId),
                eq(balances.marketType, "spot")
              )
            ),
          db
            .select()
            .from(balances)
            .where(
              and(
                eq(balances.accountId, accountId),
                eq(balances.marketType, "futures")
              )
            ),
          db
            .select()
            .from(positions)
            .where(eq(positions.accountId, accountId)),
          db
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.accountId, accountId),
                eq(orders.status, "NEW")
              )
            ),
          db
            .select()
            .from(alerts)
            .where(eq(alerts.accountId, accountId))
            .orderBy(desc(alerts.createdAt))
            .limit(20),
          db
            .select()
            .from(accountEvents)
            .where(eq(accountEvents.accountId, accountId))
            .orderBy(desc(accountEvents.createdAt))
            .limit(50),
        ]);

      return {
        spotBalances: spotBalancesList,
        futuresBalances: futuresBalancesList,
        positions: positionsList,
        openOrders,
        recentAlerts,
        recentEvents,
      };
    }),
});
