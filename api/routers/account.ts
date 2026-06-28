import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { accounts } from "@db/schema";
import { eq } from "drizzle-orm";
import { monitorManager } from "../services/monitor-manager";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/secrets";

export const accountRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(accounts);
    return rows.map((account) => ({
      id: account.id,
      name: account.name,
      apiKey: maskSecret(account.apiKey),
      apiSecretConfigured: Boolean(account.apiSecret),
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
  }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(100),
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db
        .insert(accounts)
        .values({
          name: input.name,
          apiKey: encryptSecret(input.apiKey) ?? "",
          apiSecret: encryptSecret(input.apiSecret) ?? "",
          isActive: 1,
        })
        .returning({ id: accounts.id });
      return { id: result[0].id };
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        apiKey: z.string().min(1).optional(),
        apiSecret: z.string().min(1).optional(),
        isActive: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(accounts)
        .set({
          ...data,
          apiKey: data.apiKey ? encryptSecret(data.apiKey) ?? "" : undefined,
          apiSecret: data.apiSecret
            ? encryptSecret(data.apiSecret) ?? ""
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, id));
      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Stop monitor first
      await monitorManager.removeMonitor(input.id);
      const db = getDb();
      await db.delete(accounts).where(eq(accounts.id, input.id));
      return { success: true };
    }),

  startMonitor: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, input.id));

      if (rows.length === 0) {
        throw new Error("Account not found");
      }

      const account = rows[0];
      await monitorManager.addMonitor({
        accountId: account.id,
        name: account.name,
        apiKey: decryptSecret(account.apiKey),
        apiSecret: decryptSecret(account.apiSecret),
      });

      return { success: true };
    }),

  stopMonitor: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await monitorManager.removeMonitor(input.id);
      return { success: true };
    }),

  monitorStatus: publicQuery.query(() => {
    return monitorManager.getStatus();
  }),

  syncTrades: publicQuery
    .input(
      z.object({
        id: z.number(),
        days: z.number().min(1).max(365).default(3),
      })
    )
    .mutation(async ({ input }) => {
      const monitor = monitorManager.getMonitor(input.id);
      if (!monitor) {
        throw new Error("Monitor not running for this account");
      }
      return monitor.syncTrades(input.days);
    }),

  syncTransfers: publicQuery
    .input(
      z.object({
        id: z.number(),
        days: z.number().min(1).max(365).default(3),
      })
    )
    .mutation(async ({ input }) => {
      const monitor = monitorManager.getMonitor(input.id);
      if (!monitor) {
        throw new Error("Monitor not running for this account");
      }
      return monitor.syncTransfers(input.days);
    }),
});
