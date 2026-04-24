import { NextResponse } from "next/server";
import { runOnce } from "@/jobs/scheduler";

/**
 * Trigger a scan manually or from Railway Cron / external scheduler.
 * GET /api/cron?secret=YOUR_CRON_SECRET
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
    const report = await runOnce();
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("[api/cron]", e);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
