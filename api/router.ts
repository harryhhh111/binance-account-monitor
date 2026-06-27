import { createRouter, publicQuery } from "./middleware";
import { accountRouter } from "./routers/account";
import { monitorDataRouter } from "./routers/monitor-data";
import { settingsRouter } from "./routers/settings";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  account: accountRouter,
  monitor: monitorDataRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
