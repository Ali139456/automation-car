import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedListing } from "@/lib/listing";

export type ListingRow = {
  id: string;
  title: string;
  price: string;
  link: string;
  created_at: string;
};

function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const key = serviceKey ?? anonKey;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and a key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }

  return createClient(url, key);
}

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!cached) cached = getServerSupabase();
  return cached;
}

export async function checkIfExists(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings_seen")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

export async function saveListing(listing: ScrapedListing): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("listings_seen").insert({
    id: listing.id,
    title: listing.title,
    price: listing.price,
    link: listing.link,
  });

  if (error) throw error;
}

export async function getRecentListings(limit = 200): Promise<ListingRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings_seen")
    .select("id, title, price, link, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as ListingRow[]) ?? [];
}

export type ListingsPageResult = {
  rows: ListingRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Paginated listings (newest first). Uses a head count plus range query.
 */
export async function getListingsPage(
  page: number,
  pageSize: number,
): Promise<ListingsPageResult> {
  const supabase = getSupabase();
  const { count: totalCount, error: countErr } = await supabase
    .from("listings_seen")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from("listings_seen")
    .select("id, title, price, link, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return {
    rows: (data as ListingRow[]) ?? [],
    total,
    page: safePage,
    pageSize,
  };
}
