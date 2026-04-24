import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/services/notifications/telegram";

/**
 * Sends a test Telegram message to validate TELEGRAM_* env vars.
 * GET /api/test-telegram?secret=YOUR_CRON_SECRET
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? "";

  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendTelegramMessage(
      ["✅ Telegram test", "", `Time: ${new Date().toISOString()}`].join("\n"),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/test-telegram]", e);
    const msg = e instanceof Error ? e.message : "Telegram send failed";
    return NextResponse.json({ error: "Telegram send failed", message: msg }, { status: 500 });
  }
}

