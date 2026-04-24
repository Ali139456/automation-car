import axios from "axios";
import type { ScrapedListing } from "@/lib/listing";

const TELEGRAM_API_TIMEOUT_MS = Number(
  process.env.TELEGRAM_API_TIMEOUT_MS ?? "60000",
);

function parseChatId(raw: string): string | number {
  const t = raw.trim();
  if (/^-?\d+$/.test(t)) {
    // Telegram supports int64; JS number is OK for normal user/group ids.
    return Number(t);
  }
  return raw;
}

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
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const chatIdValue = parseChatId(chatId);

  try {
    const res = await axios.post<{ ok?: boolean; description?: string }>(
      url,
      {
        chat_id: chatIdValue,
        text: message,
        disable_web_page_preview: false,
      },
      {
        timeout: TELEGRAM_API_TIMEOUT_MS,
        validateStatus: (s) => s < 600,
        // Avoid hanging forever on some networks; also surface clearer errors.
        transitional: { clarifyTimeoutError: true },
        headers: { "User-Agent": "car-monitor/1.0" },
      },
    );

    if (res.status !== 200 || res.data?.ok === false) {
      console.error("[telegram] send failed:", res.status, res.data);
      throw new Error(res.data?.description ?? `Telegram HTTP ${res.status}`);
    }
  } catch (e) {
    const err = e as { code?: string; message?: string; isAxiosError?: boolean };
    if (err?.code === "ECONNABORTED") {
      throw new Error(
        `Telegram request timed out after ${TELEGRAM_API_TIMEOUT_MS}ms (network/firewall? Can you open https://api.telegram.org in a browser on this network?)`,
      );
    }
    if (err?.isAxiosError) {
      throw new Error(
        `Telegram request failed (${err.code ?? "axios"}): ${err.message ?? "unknown"}`,
      );
    }
    throw e;
  }
}

/** Formats and sends the standard new-listing notification for @car-monitor style alerts. */
export async function notifyNewListing(listing: ScrapedListing): Promise<void> {
  await sendTelegramMessage(formatNewListingMessage(listing));
}
