import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { systemSettings } from "@db/schema";
import { eq } from "drizzle-orm";
import { initTelegramBot } from "../services/telegram-alert";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/secrets";

export const settingsRouter = createRouter({
  get: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(systemSettings).limit(1);
    const settings = rows[0];
    if (!settings) return null;
    return {
      id: settings.id,
      telegramBotTokenConfigured: Boolean(settings.telegramBotToken),
      telegramBotTokenMasked: maskSecret(settings.telegramBotToken),
      telegramChatId: settings.telegramChatId,
      reconcileIntervalSeconds: settings.reconcileIntervalSeconds,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
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
            telegramBotToken: input.telegramBotToken
              ? encryptSecret(input.telegramBotToken)
              : undefined,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          telegramBotToken: encryptSecret(input.telegramBotToken),
          telegramChatId: input.telegramChatId || null,
          reconcileIntervalSeconds: input.reconcileIntervalSeconds || 300,
        });
      }

      // Re-init Telegram bot if token changed
      if (input.telegramBotToken) {
        initTelegramBot(decryptSecret(input.telegramBotToken));
      }

      return { success: true };
    }),
});
