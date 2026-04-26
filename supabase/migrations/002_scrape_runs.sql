-- Run in Supabase SQL Editor (after 001_listings_seen.sql). Logs each scan so the UI can show last run.

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  examined int not null default 0,
  new_listings int not null default 0,
  errors int not null default 0,
  gumtree_count int not null default 0,
  carsales_count int not null default 0,
  gumtree_error text,
  carsales_error text
);

create index if not exists scrape_runs_run_at_idx on public.scrape_runs (run_at desc);

alter table public.scrape_runs enable row level security;

-- Service role bypasses RLS. Add a read policy for anon if you only use the anon key on the server.
