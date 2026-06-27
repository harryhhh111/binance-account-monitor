import TelegramBot from "node-telegram-bot-api";

let botInstance: TelegramBot | null = null;
let botToken: string | null = null;

export function initTelegramBot(token: string): TelegramBot | null {
  if (!token) return null;
  if (botInstance && botToken === token) return botInstance;

  try {
    botInstance = null;
    botInstance = new TelegramBot(token, { polling: false });
    botToken = token;
    return botInstance;
  } catch (err) {
    console.error("Failed to init Telegram bot:", err);
    botToken = null;
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
  const options: Parameters<TelegramBot["sendMessage"]>[2] = {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };

  try {
    await bot.sendMessage(chatId, text, options);
    return true;
  } catch (err) {
    console.error("Failed to send Telegram alert:", err);
    return false;
  }
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
