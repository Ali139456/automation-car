# Car monitor (`@car-monitor`)

Next.js app that polls **Gumtree** and **Carsales** on a **3–5 minute** cadence (default **every 4 minutes**), stores seen listing IDs in **Supabase**, and sends **Telegram** alerts only for **new** listings.

### How new rows get into the database

1. A **scan** runs: on a schedule (in-process cron when using `next start`), **once shortly after server boot** (unless `SKIP_INITIAL_SCAN=true`), or when you call **`GET /api/cron?secret=…`**.  
2. The scraper loads your **Gumtree** (and optionally **carsales**) search page, parses listing IDs.  
3. For each ID, the app checks **`listings_seen`**. If that ID **does not exist**, it **inserts** the row and sends Telegram. If it already exists, it **skips** (no duplicate).  
4. Each completed scan is appended to **`scrape_runs`** (run `002_scrape_runs.sql`) so the dashboard can show **recent scans** (examined / new / errors).

## Stack

- Next.js (App Router, API routes), TypeScript  
- Scraping: `axios` + `cheerio`  
- Scheduler: `node-cron` (in-process when using `next start`)  
- Database: Supabase (`listings_seen`, `scrape_runs`)  
- Notifications: Telegram Bot API  

## Setup

### 1. Supabase

1. Create a project and run the SQL in `supabase/migrations/001_listings_seen.sql` (SQL Editor or CLI).  
2. Run `supabase/migrations/002_scrape_runs.sql` so each scan is logged (dashboard “Recent scans”).  
3. Copy **Project URL** and **anon** key; for server-side inserts with RLS, prefer **service role** and keep it only in server env (never expose in the browser).

### 2. Telegram

1. Open `@BotFather`, create a bot, copy the **token**.  
2. Start a chat with your bot and get your **chat id** (e.g. message `@userinfobot` or use `getUpdates` once you messaged the bot).  
3. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env.local`.

### 3. Environment

Copy `.env.example` to `.env.local` and fill in values.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for inserts (recommended on Railway) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram alerts |
| `CRON_SECRET` | Shared secret for `GET /api/cron` |
| `ENABLE_CRON` | `true` (default) to run in-process cron with `next start`; `false` if you only use HTTP cron |
| `CRON_EXPRESSION` | Cron expression (default `*/4 * * * *`) |
| `SKIP_INITIAL_SCAN` | Set `true` to skip the automatic scan on server boot (only scheduled / manual cron) |
| `GUMTREE_SEARCH_URL` / `CARSALES_SEARCH_URL` | Optional full search URLs if defaults break |

### 4. Run locally

```bash
npm install
npm run dev
```

#### Gumtree / Carsales returning 403 in logs?

These sites often serve **bot / JS challenge** pages to plain `axios` requests. This project can automatically fall back to **Playwright (Chromium)** when it detects a challenge page (enabled by default via `USE_PLAYWRIGHT=true`).

1. Install the browser once:

```bash
npm run playwright:install
```

2. Set env in `.env.local` (see `.env.example`):

- `USE_PLAYWRIGHT=true`
- `PLAYWRIGHT_HEADLESS=true` (or `false` to debug)
- `PLAYWRIGHT_TIMEOUT_MS=60000`

3. Restart `npm run dev` and hit `/api/cron` again.

Note: if a site updates protections further, you may still need a **residential proxy** / manual cookies — but Playwright is the most practical “easy + reliable” self-hosted first step.

Cron **does not** run in `next dev` the same way as production; use `/api/cron` with `CRON_SECRET` to trigger a scan while developing, or run `npm run build && npm run start`.

### 5. Railway

1. Connect the repo and set the same env vars as `.env.example`.  
2. **Use Docker deploy** (recommended): this repo includes `Dockerfile` which installs **Playwright Chromium + OS dependencies** during the image build.  
   - **Root Directory:** leave it **empty** (repo root) for `Ali139456/automation-car` — the Next app and `Dockerfile` live at the top level. Only set a subfolder (e.g. `apps/web`) if your GitHub repo is a monorepo and the app is not at the root.  
   - Configure the service to build from the `Dockerfile` (disable default Nixpacks / Railpack builder if Railway does not pick Docker automatically).  
3. Start command is already `npm run start` in the Docker image (`next start`).  
4. Either keep `ENABLE_CRON=true` for built-in polling, **or** set `ENABLE_CRON=false` and add **Railway Cron** hitting:

   `GET https://<your-host>/api/cron?secret=<CRON_SECRET>`

   on your desired interval (e.g. every 5 minutes).

#### Common Railway error: “Executable doesn't exist … ms-playwright …”

That means the deployed container **does not have Playwright browsers installed**. Fix by using the provided **`Dockerfile`** (or run `npx playwright install --with-deps chromium` during your build image).

## Project layout

| Path | Role |
|------|------|
| `lib/supabase.ts` | `checkIfExists`, `saveListing` |
| `lib/scrapers/gumtree.ts` | Gumtree search + parse |
| `lib/scrapers/carsales.ts` | Carsales search + parse |
| `services/processListings.ts` | New-only pipeline |
| `services/notifications/telegram.ts` | `sendTelegramMessage`, `notifyNewListing` |
| `jobs/scheduler.ts` | Cron + `runOnce()` |
| `instrumentation.ts` | Starts scheduler on Node server boot |
| `app/api/cron/route.ts` | HTTP-triggered scan |

## Filters (defaults)

Aligned with client brief: price under **$3,200 AUD**, odometer under **200,000 km**, **automatic**, **used**. Adjust in `lib/listing.ts` (`defaultSearchFilters`) or override URLs via env.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
