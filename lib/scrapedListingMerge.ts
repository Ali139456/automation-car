import type { ScrapedListing } from "@/lib/listing";

/** Prefer rows with real title + price (HTML cards) over thin JSON-LD. */
export function listingQualityScore(l: ScrapedListing): number {
  let s = 0;
  const title = l.title?.trim().toLowerCase() ?? "";
  if (title && title !== "unknown") s += 3;
  const price = l.price?.trim() ?? "";
  if (price && price !== "—" && !/^n\/a$/i.test(price)) s += 2;
  if (l.link?.includes("/s-ad/") || l.link?.includes("/cars/details/")) s += 1;
  return s;
}

export function mergePreferRicher(
  map: Map<string, ScrapedListing>,
  listing: ScrapedListing | null,
): void {
  if (!listing?.id) return;
  const existing = map.get(listing.id);
  if (!existing) {
    map.set(listing.id, listing);
    return;
  }
  if (listingQualityScore(listing) > listingQualityScore(existing)) {
    map.set(listing.id, listing);
  }
}
