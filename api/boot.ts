import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { systemSettings, accounts } from "@db/schema";
import { eq } from "drizzle-orm";
import { initTelegramBot } from "./services/telegram-alert";
import { monitorManager } from "./services/monitor-manager";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./lib/secrets";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

async function migratePlaintextSecrets(): Promise<void> {
  const db = getDb();
  const accountRows = await db.select().from(accounts);

  for (const account of accountRows) {
    if (
      isEncryptedSecret(account.apiKey) &&
      isEncryptedSecret(account.apiSecret)
    ) {
      continue;
    }

    await db
      .update(accounts)
      .set({
        apiKey: encryptSecret(account.apiKey) ?? "",
        apiSecret: encryptSecret(account.apiSecret) ?? "",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
  }

  const settingsRows = await db.select().from(systemSettings).limit(1);
  const settings = settingsRows[0];
  if (settings?.telegramBotToken && !isEncryptedSecret(settings.telegramBotToken)) {
    await db
      .update(systemSettings)
      .set({
        telegramBotToken: encryptSecret(settings.telegramBotToken),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, settings.id));
  }
}

// Initialize on startup
async function initialize() {
  try {
    const db = getDb();
    await migratePlaintextSecrets();

    // Load Telegram settings
    const settings = await db.select().from(systemSettings).limit(1);
    if (settings.length > 0 && settings[0].telegramBotToken) {
      initTelegramBot(decryptSecret(settings[0].telegramBotToken));
      console.log("Telegram bot initialized");
    }

    // Auto-start monitors for active accounts
    const activeAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.isActive, 1));

    for (const account of activeAccounts) {
      try {
        await monitorManager.addMonitor({
          accountId: account.id,
          name: account.name,
          apiKey: decryptSecret(account.apiKey),
          apiSecret: decryptSecret(account.apiSecret),
        });
        console.log(`Auto-started monitor for account: ${account.name}`);
      } catch (err) {
        console.error(
          `Failed to start monitor for ${account.name}:`,
          err
        );
      }
    }

    console.log(`Started ${activeAccounts.length} account monitors`);
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");

  // Initialize before serving
  await initialize();

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
} else {
  // Initialize in dev mode too
  initialize();
}
