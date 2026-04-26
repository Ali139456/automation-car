import { NextResponse } from "next/server";
import { probeGumtreeSearchPage } from "@/lib/gumtreeProbe";
import { runOnce } from "@/jobs/scheduler";

/**
 * Trigger a scan manually or from Railway Cron / external scheduler.
 * GET /api/cron?secret=YOUR_CRON_SECRET
 * GET /api/cron?secret=…&diagnose=1 — fetch Gumtree once and return HTML heuristics (when examined is 0).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ?? request.headers.get("x-cron-secret") ?? "";

  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (url.searchParams.get("diagnose") === "1") {
    const probe = await probeGumtreeSearchPage();
    return NextResponse.json({
      ok: true,
      diagnose: true,
      probe,
      env: {
        scrapeGumtree: process.env.SCRAPE_GUMTREE !== "false",
        usePlaywright: process.env.USE_PLAYWRIGHT !== "false",
        hasCustomGumtreeUrl: Boolean(process.env.GUMTREE_SEARCH_URL?.trim()),
      },
      help:
        "If hasListingLinks is false and htmlLength is small, Gumtree is likely not returning real search HTML (bot wall or wrong page). Use Docker on Railway, keep USE_PLAYWRIGHT=true, and check logs.",
    });
  }

  try {
    const report = await runOnce();
    const noListingsParsed = report.process.examined === 0;
    return NextResponse.json({
      ok: true,
      report,
      hint: noListingsParsed
        ? "examined:0 = scraper found no ad rows in the HTML. Use the same path with &diagnose=1 to inspect. Run 002_scrape_runs.sql in Supabase for 'Recent scans'. On Railway, deploy with the repo Dockerfile so Chromium exists for Playwright."
        : undefined,
    });
  } catch (e) {
    console.error("[api/cron]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Scan failed", message }, { status: 500 });
  }
}
