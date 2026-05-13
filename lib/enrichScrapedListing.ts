import type { ScrapedListing } from "@/lib/listing";
import { formatListingTitle } from "@/lib/listingDisplayTitle";

function isMissingPrice(price: string | undefined): boolean {
  const p = price?.trim() ?? "";
  return !p || p === "—" || /^n\/a$/i.test(p);
}

/**
 * Normalizes title (Unknown → slug from URL) and empty price before DB + Telegram.
 */
export function enrichScrapedListing(listing: ScrapedListing): ScrapedListing {
  const title = formatListingTitle(listing.title, listing.link);
  const price = isMissingPrice(listing.price) ? "See listing for price" : listing.price.trim();
  return { ...listing, title, price };
}
