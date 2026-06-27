import { AccountMonitor } from "./account-monitor";
import type { MonitorConfig } from "./account-monitor";

class MonitorManager {
  private monitors = new Map<number, AccountMonitor>();

  async addMonitor(config: MonitorConfig): Promise<AccountMonitor> {
    // Stop existing if any
    const existing = this.monitors.get(config.accountId);
    if (existing) {
      await existing.stop();
      this.monitors.delete(config.accountId);
    }

    const monitor = new AccountMonitor(config);
    this.monitors.set(config.accountId, monitor);
    await monitor.start();
    return monitor;
  }

  async removeMonitor(accountId: number): Promise<void> {
    const monitor = this.monitors.get(accountId);
    if (monitor) {
      await monitor.stop();
      this.monitors.delete(accountId);
    }
  }

  async stopAll(): Promise<void> {
    for (const [, monitor] of this.monitors) {
      await monitor.stop();
    }
    this.monitors.clear();
  }

  getMonitor(accountId: number): AccountMonitor | undefined {
    return this.monitors.get(accountId);
  }

  getAllMonitors(): Map<number, AccountMonitor> {
    return this.monitors;
  }

  getStatus(): Array<{
    accountId: number;
    spot: string;
    futures: string;
    running: boolean;
  }> {
    return Array.from(this.monitors.entries()).map(([id, monitor]) => ({
      accountId: id,
      ...monitor.getStatus(),
    }));
  }
}

export const monitorManager = new MonitorManager();
