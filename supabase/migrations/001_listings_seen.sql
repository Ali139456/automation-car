-- Run in Supabase SQL Editor or via CLI migration.

create table if not exists public.listings_seen (
  id text primary key,
  title text not null default '',
  price text not null default '',
  link text not null default '',
  created_at timestamptz not null default now()
);

alter table public.listings_seen enable row level security;

-- Server / service role bypasses RLS by default.
-- For anon key from a client, add policies as needed.
-- Example: allow read for authenticated users only:
-- create policy "read own" on public.listings_seen for select using (true);

create index if not exists listings_seen_created_at_idx on public.listings_seen (created_at desc);
