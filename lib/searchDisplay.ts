import { defaultSearchFilters } from "@/lib/listing";

export type MonitorSearchContext = {
  sectionTitle: string;
  filterChips: string[];
  /** Short line under the title (which sources are monitored). */
  tagline: string;
  /** When set, same URL the scraper uses — for “open in browser”. */
  gumtreeSearchUrl: string | null;
  /** When set, same URL the scraper uses — for “open in browser”. */
  carsalesSearchUrl: string | null;
  /** Extra hint under empty state. */
  emptyHint: string | null;
};

function truncateMiddle(s: string, max = 52): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`;
}

/**
 * Build filter chips for the dashboard from the Gumtree URL the backend uses
 * (`GUMTREE_SEARCH_URL` or implied default in `lib/scrapers/gumtree.ts`).
 */
export function parseGumtreeUrlToChips(urlStr: string): string[] {
  const chips: string[] = [];
  try {
    const u = new URL(urlStr);
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs[0] === "s-cars-vans-utes" && segs.length >= 3 && /^k0/i.test(segs[2] ?? "")) {
      chips.push(`Keyword: ${segs[1]}`);
    }

    const price = u.searchParams.get("price") ?? u.searchParams.get("price-max__i");
    if (price) {
      const cleaned = price.replace(/^__/, "").replace(/\.00$/i, "").replace(/[^\d.]/g, "");
      const num = parseFloat(cleaned);
      if (!Number.isNaN(num) && num > 0) {
        chips.push(`Max ${num.toLocaleString()} AUD`);
      }
    }

    const km =
      u.searchParams.get("carmileageinkms") ??
      u.searchParams.get("carmileageinkms-max__i") ??
      u.searchParams.get("carmileageinkms-max");
    if (km) {
      const cleaned = km.replace(/^__/, "").replace(/[^\d]/g, "");
      const num = parseInt(cleaned, 10);
      if (!Number.isNaN(num) && num > 0) {
        chips.push(`Up to ${num.toLocaleString()} km`);
      }
    }

    const trans = u.searchParams.get("cartransmission");
    if (trans) {
      chips.push(trans.charAt(0).toUpperCase() + trans.slice(1).toLowerCase());
    }

    const cond = u.searchParams.get("carcondition");
    if (cond) {
      chips.push(cond.charAt(0).toUpperCase() + cond.slice(1).toLowerCase());
    }

    const view = u.searchParams.get("view");
    if (view) {
      chips.push(`View: ${view}`);
    }

    const sort = u.searchParams.get("sort");
    if (sort) {
      chips.push(`Sort: ${sort}`);
    }
  } catch {
    /* invalid URL */
  }
  return chips;
}

export function getMonitorSearchContext(): MonitorSearchContext {
  const gumtreeUrl = process.env.GUMTREE_SEARCH_URL?.trim() || null;
  const carsalesUrl = process.env.CARSALES_SEARCH_URL?.trim() || null;

  let filterChips: string[];
  let sectionTitle: string;

  if (gumtreeUrl) {
    filterChips = parseGumtreeUrlToChips(gumtreeUrl);
    if (filterChips.length === 0) {
      filterChips = [`Custom search (${truncateMiddle(gumtreeUrl)})`];
    }
    sectionTitle = "Your search";
  } else {
    const f = defaultSearchFilters;
    filterChips = [
      `Max ${f.maxPriceAud.toLocaleString()} AUD`,
      `Up to ${f.maxKm.toLocaleString()} km`,
      f.transmission.charAt(0).toUpperCase() + f.transmission.slice(1),
      f.condition.charAt(0).toUpperCase() + f.condition.slice(1),
    ];
    sectionTitle = "Search filters";
  }

  const scrapeGt = process.env.SCRAPE_GUMTREE !== "false";
  const scrapeCs = process.env.SCRAPE_CARSALES !== "false";

  const parts: string[] = [];
  if (scrapeGt) parts.push("Gumtree");
  if (scrapeCs) parts.push("carsales");
  const tagline =
    parts.length > 0
      ? `Watching ${parts.join(" and ")} for new listings`
      : "Not watching any sites yet";

  return {
    sectionTitle,
    filterChips,
    tagline,
    gumtreeSearchUrl: gumtreeUrl,
    carsalesSearchUrl: carsalesUrl,
    emptyHint: null,
  };
}
