import * as cheerio from "cheerio";
import type { ScrapedListing } from "@/lib/listing";
import { defaultSearchFilters } from "@/lib/listing";
import { fetchHtml } from "@/lib/http";
import { formatPriceDisplay, parsePriceToNumber, offerPriceValue, coerceScrapedPrice } from "@/lib/parse";
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

  const offers = product.offers;
  const priceRaw = offerPriceValue(offers);
  const { n, displayText } = coerceScrapedPrice(priceRaw);

  const link =
    urlRaw.startsWith("http") ? urlRaw : urlRaw ? `${BASE}${urlRaw}` : BASE;
  const title = String(product.name ?? "Unknown");

  mergePreferRicher(map, {
    id,
    title,
    price: formatPriceDisplay(n, displayText),
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
      const priceCandidate =
        ad.price ??
        ad.priceText ??
        ad.displayPrice ??
        ad.formattedPrice ??
        ad.egcPrice ??
        ad.dapPrice ??
        ad.priceDetail ??
        ad.pricing;
      const { n, displayText } = coerceScrapedPrice(priceCandidate);
      const urlPath = String(ad.url ?? ad.adUrl ?? "");
      const link = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
      mergePreferRicher(map, {
        id,
        title,
        price: formatPriceDisplay(n, displayText),
        link,
      });
    }
  } catch {
    /* ignore */
  }
}

function parseHtml(html: string, map: Map<string, ScrapedListing>) {
  const $ = cheerio.load(html);
  const priceSel =
    "[data-testid*='price'],[data-testid*='Price'],[class*='user-ad-price'],[class*='price__'],[class*='Price'],[class*='ad-price']";

  $("a[href*='/s-ad/']").each((_, el) => {
    const $link = $(el);
    const href = $link.attr("href") ?? "";
    if (!href.includes("/s-ad/")) return;
    const id = extractIdFromUrl(href);
    if (!id) return;

    let card = $link.closest('[data-q="search-result-ad"]').first();
    if (!card.length) card = $link.closest("[class*='user-ad-row']").first();
    if (!card.length) card = $link.closest("[class*='user-ad-collection']").first();
    if (!card.length) card = $link.closest("article").first();
    if (!card.length) card = $link;

    const title =
      card.find("h3, .user-ad-row-title-style, span[class*='title']").first().text().trim() ||
      $link.find("h3, span[class*='title']").first().text().trim() ||
      $link.attr("aria-label")?.trim() ||
      "Unknown";

    let priceTxt = card.find(priceSel).first().text().trim();
    if (!parsePriceToNumber(priceTxt)) {
      priceTxt = $link.find(priceSel).first().text().trim();
    }
    if (!parsePriceToNumber(priceTxt)) {
      let p: ReturnType<typeof $link.parent> = $link.parent();
      for (let i = 0; i < 6 && p.length; i++) {
        const t = p.find(priceSel).first().text().trim();
        if (parsePriceToNumber(t)) {
          priceTxt = t;
          break;
        }
        p = p.parent();
      }
    }

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
