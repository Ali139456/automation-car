import * as cheerio from "cheerio";
import type { ScrapedListing } from "@/lib/listing";
import { defaultSearchFilters } from "@/lib/listing";
import { fetchHtml } from "@/lib/http";
import { formatPriceDisplay, parsePriceToNumber } from "@/lib/parse";

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

function pushUnique(map: Map<string, ScrapedListing>, listing: ScrapedListing | null) {
  if (!listing?.id) return;
  if (!map.has(listing.id)) map.set(listing.id, listing);
}

function idFromCarsalesUrl(listingUrl: string): string | null {
  const m = listingUrl.match(/\/(\d{5,})\/?(?:\?|$)/);
  if (m) return `carsales:${m[1]}`;
  const tail = listingUrl.replace(/\/$/, "").split("/").pop();
  if (tail && /^\d+$/.test(tail)) return `carsales:${tail}`;
  return null;
}

function parseJsonLdListing(
  item: Record<string, unknown>,
  map: Map<string, ScrapedListing>,
) {
  const url = String(item.url ?? "");
  const id = idFromCarsalesUrl(url);
  if (!id) return;

  const offers = (item.offers ?? {}) as Record<string, unknown>;
  const priceRaw = offers.price;
  const n = parsePriceToNumber(
    typeof priceRaw === "number" ? priceRaw : String(priceRaw ?? ""),
  );

  const link = url.startsWith("http") ? url : `https://www.carsales.com.au${url}`;
  const title = String(item.name ?? "Unknown");

  pushUnique(map, {
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
      card.find("h3, [class*='title'], .cs-text-bold").first().text().trim() || "Unknown";
    const priceTxt =
      card.find("[class*='price']").first().text().trim() || "";
    const n = parsePriceToNumber(priceTxt);

    pushUnique(map, {
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

  if (map.size === 0) parseHtmlCards(html, map);

  return [...map.values()];
}
