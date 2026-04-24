import cron from "node-cron";
import { processListings } from "@/services/processListings";
import { scrapeGumtree } from "@/lib/scrapers/gumtree";
import { scrapeCarsales } from "@/lib/scrapers/carsales";
import type { ProcessResult } from "@/services/processListings";
import type { ScrapedListing } from "@/lib/listing";

const DEFAULT_CRON = "*/4 * * * *"; /** every 4 minutes (within 3–5 min window) */

let started = false;

export type RunReport = {
  gumtree: { count: number; error?: string };
  carsales: { count: number; error?: string };
  process: ProcessResult;
};

function summarizeScrapeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function safeScrapeListings(
  label: "gumtree" | "carsales",
  fn: () => Promise<ScrapedListing[]>,
): Promise<{ items: ScrapedListing[]; error?: string }> {
  try {
    const items = await fn();
    return { items };
  } catch (e) {
    const msg = summarizeScrapeError(e);
    console.error(`[car-monitor] ${label} scrape failed:`, e);
    return { items: [], error: msg };
  }
}

async function runOnce(): Promise<RunReport> {
  const doGumtree = process.env.SCRAPE_GUMTREE !== "false";
  const doCarsales = process.env.SCRAPE_CARSALES !== "false";

  const gum = doGumtree
    ? await safeScrapeListings("gumtree", () => scrapeGumtree())
    : { items: [] as ScrapedListing[] };
  const cars = doCarsales
    ? await safeScrapeListings("carsales", () => scrapeCarsales())
    : { items: [] as ScrapedListing[] };

  const combined = [...gum.items, ...cars.items];
  const result = await processListings(combined);

  const report: RunReport = {
    gumtree: { count: gum.items.length, error: gum.error },
    carsales: { count: cars.items.length, error: cars.error },
    process: result,
  };

  console.log(
    `[car-monitor] scan: examined=${result.examined} new=${result.newListings} errors=${result.errors} gumtree=${report.gumtree.count} carsales=${report.carsales.count}`,
  );
  if (report.gumtree.error) {
    console.warn(`[car-monitor] gumtree error: ${report.gumtree.error}`);
  }
  if (report.carsales.error) {
    console.warn(`[car-monitor] carsales error: ${report.carsales.error}`);
  }

  return report;
}

/**
 * Schedules recurring scrapes when the Node server is running (e.g. Railway `next start`).
 * Set ENABLE_CRON=false to disable (e.g. when using HTTP cron only).
 */
export function startScheduler(): void {
  if (started) return;
  started = true;

  if (process.env.ENABLE_CRON === "false") {
    console.log("[car-monitor] ENABLE_CRON=false — in-process scheduler disabled.");
    return;
  }

  const expr = process.env.CRON_EXPRESSION?.trim() || DEFAULT_CRON;
  cron.schedule(expr, () => {
    runOnce().catch((e) => console.error("[car-monitor] cron run failed:", e));
  });

  console.log(`[car-monitor] Scheduler started (${expr}).`);
}

export { runOnce };
