import axios from "axios";
import type { ScrapedListing } from "@/lib/listing";

function formatNewListingMessage(listing: ScrapedListing): string {
  return [
    "🚗 New Car Found!",
    "",
    `Title: ${listing.title}`,
    `Price: ${listing.price}`,
    `Link: ${listing.link}`,
  ].join("\n");
}

/**
 * Sends a plain-text message via Telegram Bot API (requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
 */
export async function sendTelegramMessage(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID; skip send.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await axios.post<{ ok?: boolean; description?: string }>(
    url,
    {
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
    },
    { timeout: 25_000, validateStatus: (s) => s < 500 },
  );

  if (res.status !== 200 || res.data?.ok === false) {
    console.error("[telegram] send failed:", res.status, res.data);
    throw new Error(res.data?.description ?? `Telegram HTTP ${res.status}`);
  }
}

/** Formats and sends the standard new-listing notification for @car-monitor style alerts. */
export async function notifyNewListing(listing: ScrapedListing): Promise<void> {
  await sendTelegramMessage(formatNewListingMessage(listing));
}
