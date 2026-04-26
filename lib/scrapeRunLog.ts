import { getSupabase } from "@/lib/supabase";

export type ScrapeRunRow = {
  id: string;
  run_at: string;
  examined: number;
  new_listings: number;
  errors: number;
  gumtree_count: number;
  carsales_count: number;
  gumtree_error: string | null;
  carsales_error: string | null;
};

type LogInput = {
  examined: number;
  newListings: number;
  errors: number;
  gumtreeCount: number;
  carsalesCount: number;
  gumtreeError?: string;
  carsalesError?: string;
};

/**
 * Persists a scan result (non-throwing) so the dashboard can show the last run.
 * If `scrape_runs` is missing, logs once and no-ops.
 */
export async function logScrapeRun(v: LogInput): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("scrape_runs").insert({
      examined: v.examined,
      new_listings: v.newListings,
      errors: v.errors,
      gumtree_count: v.gumtreeCount,
      carsales_count: v.carsalesCount,
      gumtree_error: v.gumtreeError ?? null,
      carsales_error: v.carsalesError ?? null,
    });
    if (error) {
      if (String(error.message ?? error).toLowerCase().includes("scrape_runs")) {
        console.warn(
          "[scrape_runs] table missing — run supabase/migrations/002_scrape_runs.sql in Supabase SQL Editor.",
        );
      } else {
        console.error("[scrape_runs] insert failed:", error);
      }
    }
  } catch (e) {
    console.error("[scrape_runs] logScrapeRun:", e);
  }
}

/**
 * Most recent completed scans (newest first). Returns [] if the table is missing or on error.
 */
export async function getRecentScrapeRuns(limit = 5): Promise<ScrapeRunRow[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("scrape_runs")
      .select(
        "id, run_at, examined, new_listings, errors, gumtree_count, carsales_count, gumtree_error, carsales_error",
      )
      .order("run_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (String(error.message ?? "").toLowerCase().includes("scrape_runs")) {
        return [];
      }
      throw error;
    }
    return (data as ScrapeRunRow[]) ?? [];
  } catch (e) {
    console.error("[scrape_runs] getRecentScrapeRuns:", e);
    return [];
  }
}
