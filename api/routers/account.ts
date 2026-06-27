import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { accounts } from "@db/schema";
import { eq } from "drizzle-orm";
import { monitorManager } from "../services/monitor-manager";

export const accountRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(accounts);
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
          apiKey: input.apiKey,
          apiSecret: input.apiSecret,
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
      await db.update(accounts).set(data).where(eq(accounts.id, id));
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
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
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
});
