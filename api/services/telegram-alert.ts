import TelegramBot from "node-telegram-bot-api";

let botInstance: TelegramBot | null = null;

export function initTelegramBot(token: string): TelegramBot | null {
  if (!token) return null;
  if (botInstance) return botInstance;

  try {
    botInstance = new TelegramBot(token, { polling: false });
    return botInstance;
  } catch (err) {
    console.error("Failed to init Telegram bot:", err);
    return null;
  }
}

export async function sendTelegramAlert(
  bot: TelegramBot | null,
  chatId: string,
  title: string,
  message: string,
  severity: "info" | "warning" | "critical" = "info"
): Promise<boolean> {
  if (!bot || !chatId) return false;

  const emoji = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
  const text = `${emoji} <b>${title}</b>\n\n${message}`;

  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    } as any);
    return true;
  } catch (err) {
    console.error("Failed to send Telegram alert:", err);
    return false;
  }
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
