import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { systemSettings } from "@db/schema";
import { eq } from "drizzle-orm";
import { initTelegramBot } from "../services/telegram-alert";

export const settingsRouter = createRouter({
  get: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(systemSettings).limit(1);
    return rows[0] || null;
  }),

  update: publicQuery
    .input(
      z.object({
        telegramBotToken: z.string().optional(),
        telegramChatId: z.string().optional(),
        reconcileIntervalSeconds: z.number().min(60).max(3600).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(systemSettings).limit(1);

      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          telegramBotToken: input.telegramBotToken || null,
          telegramChatId: input.telegramChatId || null,
          reconcileIntervalSeconds: input.reconcileIntervalSeconds || 300,
        });
      }

      // Re-init Telegram bot if token changed
      if (input.telegramBotToken) {
        initTelegramBot(input.telegramBotToken);
      }

      return { success: true };
    }),
});
