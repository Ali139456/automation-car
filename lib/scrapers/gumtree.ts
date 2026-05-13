import * as cheerio from "cheerio";
import type { ScrapedListing } from "@/lib/listing";
import { defaultSearchFilters } from "@/lib/listing";
import { fetchHtml } from "@/lib/http";
import { formatPriceDisplay, parsePriceToNumber } from "@/lib/parse";
import { titleFromGumtreeLink } from "@/lib/listingDisplayTitle";
import { mergePreferRicher } from "@/lib/scrapedListingMerge";

const BASE = "https://www.gumtree.com.au";

/** Exposed for diagnostics (`/api/cron?diagnose=1`). */
export function getGumtreeSearchUrl(): string {
  return buildSearchUrl();
}

function buildSearchUrl(): string {
  const custom = process.env.GUMTREE_SEARCH_URL;
  if (custom?.trim()) return custom.trim();

  const f = defaultSearchFilters;
  const params = [
    `price-max__i=${f.maxPriceAud}`,
    `carmileageinkms-max__i=${f.maxKm}`,
    "cartransmission=Automatic",
    "carcondition=Used",
    "sort=date",
    "order=recent",
  ];
  return `${BASE}/s-cars-vans-utes/c18320?${params.join("&")}`;
}

function extractIdFromUrl(url: string): string | null {
  const m = url.match(/\/(\d{8,})(?:\/?|$)/);
  if (m) return `gumtree:${m[1]}`;
  const tail = url.replace(/\/$/, "").split("/").pop();
  if (tail && /^\d+$/.test(tail)) return `gumtree:${tail}`;
  return null;
}

function parseJsonLdItem(
  raw: Record<string, unknown>,
  map: Map<string, ScrapedListing>,
) {
  const product = (raw.item ?? raw) as Record<string, unknown>;
  const urlRaw = String(product.url ?? "");
  const id = extractIdFromUrl(urlRaw);
  if (!id) return;

  const offers = product.offers as Record<string, unknown> | undefined;
  const priceRaw = offers?.price;
  const n = parsePriceToNumber(
    typeof priceRaw === "number" ? priceRaw : String(priceRaw ?? ""),
  );

  const link =
    urlRaw.startsWith("http") ? urlRaw : urlRaw ? `${BASE}${urlRaw}` : BASE;
  const title = String(product.name ?? "Unknown");

  mergePreferRicher(map, {
    id,
    title,
    price: formatPriceDisplay(n, typeof priceRaw === "string" ? priceRaw : undefined),
    link,
  });
}

function parseJsonLd($: cheerio.CheerioAPI, map: Map<string, ScrapedListing>) {
  $("script[type='application/ld+json']").each((_, el) => {
    const txt = $(el).html();
    if (!txt) return;
    try {
      const data = JSON.parse(txt) as Record<string, unknown> | Record<string, unknown>[];
      const blocks = Array.isArray(data) ? data : [data];
      for (const block of blocks) {
        if (block["@type"] === "ItemList") {
          const els = block.itemListElement as unknown[] | undefined;
          if (!Array.isArray(els)) continue;
          for (const item of els) {
            parseJsonLdItem(item as Record<string, unknown>, map);
          }
        }
      }
    } catch {
      /* skip invalid JSON-LD */
    }
  });
}

function parseNextData(html: string, map: Map<string, ScrapedListing>) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return;
  try {
    const data = JSON.parse(m[1]) as Record<string, unknown>;
    const props = (data.props as Record<string, unknown> | undefined)?.pageProps as
      | Record<string, unknown>
      | undefined;
    if (!props) return;

    let results: unknown =
      props.results ?? props.ads ?? props.searchResults ?? [];
    if (results && typeof results === "object" && !Array.isArray(results)) {
      const r = results as Record<string, unknown>;
      results = r.results ?? r.ads ?? [];
    }
    if (!Array.isArray(results)) return;

    for (const ad of results as Record<string, unknown>[]) {
      const native = String(ad.id ?? ad.adId ?? "");
      if (!native) continue;
      const id = `gumtree:${native}`;
      const title = String(ad.title ?? ad.adTitle ?? "Unknown");
      const priceField = ad.price ?? ad.priceText ?? 0;
      const n = parsePriceToNumber(
        typeof priceField === "number" ? priceField : String(priceField ?? ""),
      );
      const urlPath = String(ad.url ?? ad.adUrl ?? "");
      const link = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
      mergePreferRicher(map, {
        id,
        title,
        price: formatPriceDisplay(
          n,
          typeof priceField === "string" ? priceField : undefined,
        ),
        link,
      });
    }
  } catch {
    /* ignore */
  }
}

function parseHtml(html: string, map: Map<string, ScrapedListing>) {
  const $ = cheerio.load(html);

  $("a[href*='/s-ad/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.includes("/s-ad/")) return;
    const id = extractIdFromUrl(href);
    if (!id) return;
    const card = $(el);
    const title =
      card.find("h3, .user-ad-row-title-style, span[class*='title']").first().text().trim() ||
      card.attr("aria-label")?.trim() ||
      "Unknown";
    const priceTxt =
      card.find("[class*='user-ad-price'], [class*='price']").first().text().trim() || "";
    const n = parsePriceToNumber(priceTxt);
    const link = href.startsWith("http") ? href : `${BASE}${href}`;

    mergePreferRicher(map, {
      id,
      title: title || "Unknown",
      price: formatPriceDisplay(n, priceTxt || undefined),
      link,
    });
  });
}

/**
 * Gumtree cars search: filters match client (under $3200, auto, under 200k km, used).
 */
export async function scrapeGumtree(): Promise<ScrapedListing[]> {
  const url = buildSearchUrl();
  const html = await fetchHtml(url);
  const map = new Map<string, ScrapedListing>();

  const $ = cheerio.load(html);
  parseJsonLd($, map);
  // Always run HTML/__NEXT_DATA__ too: JSON-LD can insert same ids with title "Unknown" and
  // previously blocked richer SERP parsing when map was already non-empty.
  parseNextData(html, map);
  parseHtml(html, map);

  for (const [id, listing] of map) {
    const t = listing.title?.trim().toLowerCase() ?? "";
    if (t === "unknown" || !listing.title?.trim()) {
      const hint = titleFromGumtreeLink(listing.link);
      if (hint) map.set(id, { ...listing, title: hint });
    }
  }

  if (map.size === 0) {
    const h = html.toLowerCase();
    console.warn(
      `[gumtree] 0 listings parsed. url=${url} htmlLength=${html.length} hasSAd=${html.includes("/s-ad/")} has__NEXT_DATA__=${html.includes("__NEXT_DATA__")} peakhour=${h.includes("peakhour")}`,
    );
  }

  return [...map.values()];
}
