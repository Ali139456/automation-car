import { checkIfExists, saveListing } from "@/lib/supabase";
import type { ScrapedListing } from "@/lib/listing";
import { notifyNewListing } from "@/services/notifications/telegram";

export type ProcessResult = {
  examined: number;
  newListings: number;
  errors: number;
};

/**
 * For each listing: if id is not in Supabase, insert and notify. Existing rows are skipped.
 */
export async function processListings(listings: ScrapedListing[]): Promise<ProcessResult> {
  let newListings = 0;
  let errors = 0;

  for (const listing of listings) {
    try {
      const exists = await checkIfExists(listing.id);
      if (exists) continue;

      await saveListing(listing);
      await notifyNewListing(listing);
      newListings++;
    } catch (e) {
      errors++;
      console.error(`[processListings] Failed for ${listing.id}:`, e);
    }
  }

  return { examined: listings.length, newListings, errors };
}
