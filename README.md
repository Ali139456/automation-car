# Car monitor (`@car-monitor`)

Next.js app that polls **Gumtree** and **Carsales** on a **3–5 minute** cadence (default **every 4 minutes**), stores seen listing IDs in **Supabase**, and sends **Telegram** alerts only for **new** listings.

## Stack

- Next.js (App Router, API routes), TypeScript  
- Scraping: `axios` + `cheerio`  
- Scheduler: `node-cron` (in-process when using `next start`)  
- Database: Supabase (`listings_seen`)  
- Notifications: Telegram Bot API  

## Setup

### 1. Supabase

1. Create a project and run the SQL in `supabase/migrations/001_listings_seen.sql` (SQL Editor or CLI).  
2. Copy **Project URL** and **anon** key; for server-side inserts with RLS, prefer **service role** and keep it only in server env (never expose in the browser).

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
| `GUMTREE_SEARCH_URL` / `CARSALES_SEARCH_URL` | Optional full search URLs if defaults break |

### 4. Run locally

```bash
npm install
npm run dev
```

Cron **does not** run in `next dev` the same way as production; use `/api/cron` with `CRON_SECRET` to trigger a scan while developing, or run `npm run build && npm run start`.

### 5. Railway

1. Connect the repo and set the same env vars as `.env.example`.  
2. Start command: `npm run start` (runs `next start`).  
3. Either keep `ENABLE_CRON=true` for built-in polling, **or** set `ENABLE_CRON=false` and add **Railway Cron** hitting:

   `GET https://<your-host>/api/cron?secret=<CRON_SECRET>`

   on your desired interval (e.g. every 5 minutes).

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
