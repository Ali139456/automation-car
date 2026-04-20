import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedListing } from "@/lib/listing";

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
