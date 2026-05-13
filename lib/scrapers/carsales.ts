import * as cheerio from "cheerio";
import type { ScrapedListing } from "@/lib/listing";
import { defaultSearchFilters } from "@/lib/listing";
import { fetchHtml } from "@/lib/http";
import { formatPriceDisplay, parsePriceToNumber, offerPriceValue, coerceScrapedPrice } from "@/lib/parse";
import { mergePreferRicher } from "@/lib/scrapedListingMerge";

const BASE = "https://www.carsales.com.au/cars";

function buildSearchUrl(): string {
  const custom = process.env.CARSALES_SEARCH_URL;
  if (custom?.trim()) return custom.trim();

  const { maxPriceAud, maxKm } = defaultSearchFilters;
  /** Mirror working query shape: used, price + odometer caps, automatic, newest */
  const parts = [
    "q=(And.Service.carsales._.Type.Used.)",
    `pricetype=egc&price=[..${maxPriceAud}]`,
    `odometer=[..${maxKm}]`,
    "transmissiontype=Automatic",
    "sort=~LastUpdated",
    "offset=0",
    "limit=24",
  ];
  return `${BASE}?${parts.join("&")}`;
}

function idFromCarsalesUrl(listingUrl: string): string | null {
  const m = listingUrl.match(/\/(\d{5,})\/?(?:\?|$)/);
  if (m) return `carsales:${m[1]}`;
  const tail = listingUrl.replace(/\/$/, "").split("/").pop();
  if (tail && /^\d+$/.test(tail)) return `carsales:${tail}`;
  return null;
}

const CS_ORIGIN = "https://www.carsales.com.au";

function normalizeCarsalesLink(urlRaw: string): string {
  const u = urlRaw.trim();
  if (!u) return CS_ORIGIN;
  if (u.startsWith("http")) return u;
  return `${CS_ORIGIN}${u.startsWith("/") ? u : `/${u}`}`;
}

function listingUrlFromRecord(o: Record<string, unknown>): string {
  const keys = [
    "url",
    "Url",
    "href",
    "Href",
    "canonicalUrl",
    "CanonicalUrl",
    "detailUrl",
    "DetailUrl",
    "listingUrl",
    "ListingUrl",
    "permalink",
    "Permalink",
    "link",
    "Link",
  ];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.includes("/cars/details/")) return v;
  }
  return "";
}

function tryMergeCarsalesRecord(o: Record<string, unknown>, map: Map<string, ScrapedListing>): void {
  const urlRaw = listingUrlFromRecord(o);
  if (!urlRaw) return;
  const id = idFromCarsalesUrl(urlRaw);
  if (!id) return;

  const title = String(
    o.name ??
      o.title ??
      o.Title ??
      o.heading ??
      o.Heading ??
      o.listingTitle ??
      o.ListingTitle ??
      o.displayTitle ??
      o.DisplayTitle ??
      o.vehicleTitle ??
      o.VehicleTitle ??
      o.headline ??
      "Unknown",
  );

  const offerPart = o.offers ?? o.Offers;
  const flatPrice =
    o.price ??
    o.Price ??
    o.displayPrice ??
    o.DisplayPrice ??
    o.egcPrice ??
    o.EgcPrice ??
    o.formattedPrice ??
    o.FormattedPrice ??
    o.priceLabel ??
    o.PriceLabel;

  let { n, displayText } = coerceScrapedPrice(flatPrice);
  if (n <= 0) ({ n, displayText } = coerceScrapedPrice(offerPriceValue(offerPart)));

  mergePreferRicher(map, {
    id,
    title,
    price: formatPriceDisplay(n, displayText),
    link: normalizeCarsalesLink(urlRaw),
  });
}

function walkCarsalesJson(val: unknown, map: Map<string, ScrapedListing>, depth: number): void {
  if (depth > 24 || val == null) return;
  if (typeof val === "string") {
    if (val.length > 12_000) return;
    if (val.includes("/cars/details/")) {
      const id = idFromCarsalesUrl(val);
      if (id) {
        mergePreferRicher(map, {
          id,
          title: "Unknown",
          price: "—",
          link: normalizeCarsalesLink(val),
        });
      }
    }
    return;
  }
  if (Array.isArray(val)) {
    for (const el of val) walkCarsalesJson(el, map, depth + 1);
    return;
  }
  if (typeof val === "object") {
    tryMergeCarsalesRecord(val as Record<string, unknown>, map);
    for (const v of Object.values(val as Record<string, unknown>)) {
      walkCarsalesJson(v, map, depth + 1);
    }
  }
}

/** Carsales Next.js embeds listing payloads in __NEXT_DATA__ (not always in static anchors). */
function parseCarsalesNextData(html: string, map: Map<string, ScrapedListing>): void {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return;
  try {
    const data = JSON.parse(m[1]) as Record<string, unknown>;
    walkCarsalesJson(data, map, 0);
  } catch {
    /* skip */
  }
}

function parseJsonLdListing(
  item: Record<string, unknown>,
  map: Map<string, ScrapedListing>,
) {
  const url = String(item.url ?? "");
  const id = idFromCarsalesUrl(url);
  if (!id) return;

  const offers = item.offers;
  const priceRaw = offerPriceValue(offers);
  const { n, displayText } = coerceScrapedPrice(priceRaw);

  const link = url.startsWith("http") ? url : `https://www.carsales.com.au${url}`;
  const title = String(item.name ?? "Unknown");

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
          for (const elItem of els) {
            const item = (elItem as Record<string, unknown>)?.item ?? elItem;
            parseJsonLdListing(item as Record<string, unknown>, map);
          }
        }
      }
    } catch {
      /* skip */
    }
  });
}

function parseHtmlCards(html: string, map: Map<string, ScrapedListing>) {
  const $ = cheerio.load(html);
  const priceSel =
    "[data-testid*='price'],[data-testid*='Price'],[class*='price'],[class*='Price'],[class*='egc'],[class*='EGC'],[class*='vehicle-price']";

  let cards = $("[data-webm-searchlist]");
  if (!cards.length) cards = $(".listing-item");
  if (!cards.length) cards = $("a[href*='/cars/details/']");

  cards.each((_, node) => {
    const card = $(node);
    const linkEl = node.name === "a" ? card : card.find("a[href*='/cars/details/']").first();
    const href = linkEl.attr("href") ?? "";
    if (!href.includes("/cars/details/")) return;
    const id = idFromCarsalesUrl(href);
    if (!id) return;

    const url = href.startsWith("http") ? href : `https://www.carsales.com.au${href}`;
    const title =
      card.find("h3, [class*='title'], .cs-text-bold, [class*='heading']").first().text().trim() ||
      "Unknown";

    let priceTxt = card.find(priceSel).first().text().trim();
    if (!parsePriceToNumber(priceTxt)) {
      let wrap = card.closest("[class*='listing'], [class*='vehicle'], article, li").first();
      if (!wrap.length) wrap = card;
      priceTxt = wrap.find(priceSel).first().text().trim();
    }

    const n = parsePriceToNumber(priceTxt);

    mergePreferRicher(map, {
      id,
      title,
      price: formatPriceDisplay(n, priceTxt || undefined),
      link: url,
    });
  });
}

/**
 * Carsales search with client filters (used, price & km caps, automatic).
 */
export async function scrapeCarsales(): Promise<ScrapedListing[]> {
  const url = buildSearchUrl();
  const html = await fetchHtml(url);
  const map = new Map<string, ScrapedListing>();

  const $ = cheerio.load(html);
  parseJsonLd($, map);
  parseCarsalesNextData(html, map);
  parseHtmlCards(html, map);

  return [...map.values()];
}
