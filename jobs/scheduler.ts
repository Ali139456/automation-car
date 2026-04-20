import cron from "node-cron";
import { processListings } from "@/services/processListings";
import { scrapeGumtree } from "@/lib/scrapers/gumtree";
import { scrapeCarsales } from "@/lib/scrapers/carsales";

const DEFAULT_CRON = "*/4 * * * *"; /** every 4 minutes (within 3–5 min window) */

let started = false;

async function safeScrape<T>(
  label: string,
  fn: () => Promise<T>,
  empty: T,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[car-monitor] ${label} scrape failed:`, e);
    return empty;
  }
}

async function runOnce(): Promise<void> {
  const doGumtree = process.env.SCRAPE_GUMTREE !== "false";
  const doCarsales = process.env.SCRAPE_CARSALES !== "false";

  const gum = doGumtree
    ? await safeScrape("gumtree", () => scrapeGumtree(), [])
    : [];
  const cars = doCarsales
    ? await safeScrape("carsales", () => scrapeCarsales(), [])
    : [];

  const combined = [...gum, ...cars];
  const result = await processListings(combined);

  console.log(
    `[car-monitor] scan: examined=${result.examined} new=${result.newListings} errors=${result.errors}`,
  );
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
