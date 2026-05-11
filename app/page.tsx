import { getMonitorSearchContext } from "@/lib/searchDisplay";
import { getScrapeRunsPage } from "@/lib/scrapeRunLog";
import { getListingsPage, type ListingRow } from "@/lib/supabase";
import { getListingSource } from "@/lib/listingSource";
import { formatListingTitle } from "@/lib/listingDisplayTitle";
import { PagePagination } from "./PagePagination";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const LISTINGS_PAGE_SIZE = 12;
const RUNS_PAGE_SIZE = 8;

function firstQueryValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function homeHref(listingsPage: number, runsPage: number): string {
  const p = new URLSearchParams();
  if (listingsPage > 1) p.set("listingsPage", String(listingsPage));
  if (runsPage > 1) p.set("runsPage", String(runsPage));
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

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

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const sp = (await searchParams) ?? {};
  const rawListingsPage = parsePositiveInt(firstQueryValue(sp.listingsPage), 1);
  const rawRunsPage = parsePositiveInt(firstQueryValue(sp.runsPage), 1);

  let listings: ListingRow[] = [];
  let listingsTotal = 0;
  let listingsPage = 1;
  let listingsTotalPages = 1;
  let errorMessage: string | null = null;
  let configHint = false;

  try {
    const pageResult = await getListingsPage(rawListingsPage, LISTINGS_PAGE_SIZE);
    listings = pageResult.rows;
    listingsTotal = pageResult.total;
    listingsPage = pageResult.page;
    listingsTotalPages = Math.max(1, Math.ceil(listingsTotal / LISTINGS_PAGE_SIZE));
  } catch (e) {
    configHint = isConfigError(e);
    errorMessage = formatLoadError(e);
  }

  const searchCtx = getMonitorSearchContext();
  const runsResult = await getScrapeRunsPage(rawRunsPage, RUNS_PAGE_SIZE);
  const recentRuns = runsResult.rows;
  const runsPage = runsResult.page;
  const runsTotalPages = Math.max(1, Math.ceil(runsResult.total / RUNS_PAGE_SIZE));
  const listingRangeStart =
    listingsTotal === 0 ? 0 : (listingsPage - 1) * LISTINGS_PAGE_SIZE + 1;
  const listingRangeEnd = Math.min(listingsPage * LISTINGS_PAGE_SIZE, listingsTotal);

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
        {listingsTotal > 0 && !errorMessage && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{listingsTotal}</span>
            <span className={styles.statLabel}>
              {listingsTotal === 1 ? "listing" : "listings"} stored
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
        <div className={styles.filterLinks}>
          {searchCtx.gumtreeSearchUrl ? (
            <a
              className={styles.filterLink}
              href={searchCtx.gumtreeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Gumtree ↗
            </a>
          ) : null}
          {searchCtx.carsalesSearchUrl ? (
            <a
              className={styles.filterLink}
              href={searchCtx.carsalesSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Carsales ↗
            </a>
          ) : null}
        </div>
      </section>

      {!errorMessage && (
        <section className={styles.scanSection} aria-label="Recent activity">
          <h2 className={styles.sectionTitle}>Recent activity</h2>
          {recentRuns.length === 0 ? (
            <p className={styles.scanEmpty}>
              No runs recorded yet. Check history will show here after the watch has run.
            </p>
          ) : (
            <div className={styles.scanTableWrap}>
              <table className={styles.scanTable}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Checked</th>
                    <th>New</th>
                    <th>Gumtree</th>
                    <th>Carsales</th>
                    <th>Errors</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.scanMono}>{formatWhen(r.run_at)}</td>
                      <td>{r.examined}</td>
                      <td className={r.new_listings > 0 ? styles.scanHighlight : undefined}>
                        {r.new_listings}
                      </td>
                      <td>{r.gumtree_count}</td>
                      <td>{r.carsales_count}</td>
                      <td>{r.errors}</td>
                      <td className={styles.scanNotes}>
                        {[r.gumtree_error, r.carsales_error].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PagePagination
            page={runsPage}
            totalPages={runsTotalPages}
            buildHref={(next) => homeHref(listingsPage, next)}
            ariaLabel="Recent activity pages"
          />
        </section>
      )}

      {errorMessage && (
        <div
          className={styles.error}
          role="alert"
        >
          <strong>{configHint ? "Configuration needed" : "Could not load data"}</strong>
          <p>{errorMessage}</p>
          {configHint && (
            <p className={styles.errorHint}>
              Connect the app to your database in the environment settings, then try again.
            </p>
          )}
          {!configHint && (
            <p className={styles.errorHint}>
              If this persists, check that the database is set up and the app can reach it.
            </p>
          )}
        </div>
      )}

      {!errorMessage && listingsTotal === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No listings yet</p>
          <p className={styles.emptyText}>
            New cars that match your search will appear here after they are found. Open a
            listing to see the full ad on the original site.
          </p>
        </div>
      )}

      {!errorMessage && listingsTotal > 0 && (
        <section className={styles.listingsSection} aria-label="Stored listings">
          <div className={styles.listingsSectionHeader}>
            <h2 className={styles.sectionTitle}>Listings</h2>
            <span className={styles.listingsRange}>
              {listingRangeStart}–{listingRangeEnd} of {listingsTotal}
            </span>
          </div>
          <ul className={styles.grid}>
            {listings.map((row) => {
              const src = getListingSource(row.id);
              return (
                <li key={row.id}>
                  <article className={styles.card}>
                    <div className={styles.cardHero} aria-hidden>
                      <span className={styles.cardHeroIcon}>🚗</span>
                      <span className={styles.cardHeroHint}>Photos on listing site</span>
                    </div>
                    <div className={styles.cardBody}>
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
                        {formatListingTitle(row.title, row.link)}
                      </h3>
                      <p className={styles.price}>{row.price || "—"}</p>
                      {row.link ? (
                        <a
                          className={styles.link}
                          href={row.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on listing site"
                        >
                          Open listing
                          <span className={styles.linkArrow} aria-hidden>
                            ↗
                          </span>
                        </a>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          <PagePagination
            page={listingsPage}
            totalPages={listingsTotalPages}
            buildHref={(next) => homeHref(next, runsPage)}
            ariaLabel="Listing pages"
          />
        </section>
      )}

      <footer className={styles.footer}>
        <p>Car Monitor</p>
      </footer>
    </div>
  );
}
