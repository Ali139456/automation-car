import { getMonitorSearchContext } from "@/lib/searchDisplay";
import { getRecentListings, type ListingRow } from "@/lib/supabase";
import { getListingSource } from "@/lib/listingSource";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function isConfigError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE");
}

function formatLoadError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (m != null) return String(m);
  }
  return "Could not load listings.";
}

export default async function Home() {
  let listings: ListingRow[] = [];
  let errorMessage: string | null = null;
  let configHint = false;

  try {
    listings = await getRecentListings();
  } catch (e) {
    configHint = isConfigError(e);
    errorMessage = formatLoadError(e);
  }

  const searchCtx = getMonitorSearchContext();

  return (
    <div className={styles.shell}>
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h1l1.5-4h12L19 12h1" />
              <path d="M5.5 12v4a1 1 0 001 1h.5" />
              <path d="M18.5 12v4a1 1 0 01-1 1h-.5" />
              <circle cx="7.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="16.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div>
            <h1 className={styles.title}>Car Monitor</h1>
            <p className={styles.tagline}>{searchCtx.tagline}</p>
          </div>
        </div>
        {listings.length > 0 && !errorMessage && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{listings.length}</span>
            <span className={styles.statLabel}>
              {listings.length === 1 ? "listing" : "listings"} stored
            </span>
          </div>
        )}
      </header>

      <section className={styles.filters} aria-label="Current search parameters">
        <h2 className={styles.sectionTitle}>{searchCtx.sectionTitle}</h2>
        <ul className={styles.filterChips}>
          {searchCtx.filterChips.map((label, i) => (
            <li key={`${i}-${label}`}>{label}</li>
          ))}
        </ul>
        {searchCtx.gumtreeSearchUrl ? (
          <a
            className={styles.filterLink}
            href={searchCtx.gumtreeSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open this search on Gumtree (same URL as the scraper) ↗
          </a>
        ) : null}
      </section>

      {errorMessage && (
        <div
          className={styles.error}
          role="alert"
        >
          <strong>{configHint ? "Configuration needed" : "Could not load data"}</strong>
          <p>{errorMessage}</p>
          {configHint && (
            <p className={styles.errorHint}>
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and a Supabase key in{" "}
              <code>.env.local</code>, then restart the dev server.
            </p>
          )}
          {!configHint && (
            <p className={styles.errorHint}>
              Common fixes: run <code>001_listings_seen.sql</code> in Supabase SQL; keep{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code> (or add a
              read policy for <code>anon</code>); restart <code>npm run dev</code> after
              env changes. Listings only appear after the scraper has saved at least one
              row (cron or <code>/api/cron</code>).
            </p>
          )}
        </div>
      )}

      {!errorMessage && listings.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No listings yet</p>
          <p className={styles.emptyText}>
            New ads that pass your filters and are not already in the database will show
            here after a successful scan. Trigger a scan with your Railway URL or local{" "}
            <code className={styles.emptyCode}>/api/cron?secret=…</code> (in-process
            timer runs when you use <code className={styles.emptyCode}>next start</code>).
          </p>
          {searchCtx.emptyHint ? (
            <p className={styles.emptyHint}>{searchCtx.emptyHint}</p>
          ) : null}
        </div>
      )}

      {!errorMessage && listings.length > 0 && (
        <ul className={styles.grid}>
          {listings.map((row) => {
            const src = getListingSource(row.id);
            return (
              <li key={row.id}>
                <article className={styles.card}>
                  <div className={styles.cardTop}>
                    <span
                      className={styles.badge}
                      data-source={src.key}
                    >
                      {src.label}
                    </span>
                    <time
                      className={styles.time}
                      dateTime={row.created_at}
                    >
                      {formatWhen(row.created_at)}
                    </time>
                  </div>
                  <h3 className={styles.cardTitle}>
                    {row.title?.trim() || "Untitled listing"}
                  </h3>
                  <p className={styles.price}>{row.price || "—"}</p>
                  {row.link ? (
                    <a
                      className={styles.link}
                      href={row.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open listing
                      <span className={styles.linkArrow} aria-hidden>
                        ↗
                      </span>
                    </a>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <footer className={styles.footer}>
        <p>Car Monitor · Refreshes with each page load</p>
      </footer>
    </div>
  );
}
