import { getListingsPage, type ListingRow } from "@/lib/supabase";
import { getListingSource } from "@/lib/listingSource";
import { formatListingTitle } from "@/lib/listingDisplayTitle";
import { PagePagination } from "./PagePagination";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const LISTINGS_PAGE_SIZE = 12;

function firstQueryValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function listingsHref(page: number): string {
  if (page <= 1) return "/";
  return `/?listingsPage=${page}`;
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

function displayPrice(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t || t === "—" || /^n\/a$/i.test(t)) return "See ad for price";
  return t;
}

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const sp = (await searchParams) ?? {};
  const rawListingsPage = parsePositiveInt(firstQueryValue(sp.listingsPage), 1);

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

  const listingRangeStart =
    listingsTotal === 0 ? 0 : (listingsPage - 1) * LISTINGS_PAGE_SIZE + 1;
  const listingRangeEnd = Math.min(listingsPage * LISTINGS_PAGE_SIZE, listingsTotal);

  return (
    <div className={styles.shell}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Car Monitor</h1>
          {!errorMessage && listingsTotal > 0 && (
            <p className={styles.subCount}>
              <span className={styles.countNum}>{listingsTotal}</span>
              <span className={styles.countLabel}>
                {listingsTotal === 1 ? "saved listing" : "saved listings"}
              </span>
            </p>
          )}
        </div>
      </header>

      {errorMessage && (
        <div className={styles.error} role="alert">
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
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyText}>
            When the monitor finds a new car that matches your search, it will show up here. Open
            any card to view the full ad on Gumtree or Carsales.
          </p>
        </div>
      )}

      {!errorMessage && listingsTotal > 0 && (
        <main className={styles.main}>
          <div className={styles.toolbar}>
            <p className={styles.range} aria-live="polite">
              Showing <strong>{listingRangeStart}</strong>–<strong>{listingRangeEnd}</strong> of{" "}
              <strong>{listingsTotal}</strong>
            </p>
          </div>

          <ul className={styles.grid}>
            {listings.map((row) => {
              const src = getListingSource(row.id);
              const title = formatListingTitle(row.title, row.link);
              const price = displayPrice(row.price);
              const inner = (
                <>
                  <div className={styles.cardAccent} data-source={src.key} aria-hidden />
                  <div className={styles.cardInner}>
                    <div className={styles.cardTop}>
                      <span className={styles.badge} data-source={src.key}>
                        {src.label}
                      </span>
                      <time className={styles.time} dateTime={row.created_at}>
                        {formatWhen(row.created_at)}
                      </time>
                    </div>
                    <h3 className={styles.cardTitle}>{title}</h3>
                    <p className={styles.price}>{price}</p>
                    <span className={styles.cardCta}>
                      View ad
                      <span className={styles.cardCtaArrow} aria-hidden>
                        ↗
                      </span>
                    </span>
                  </div>
                </>
              );

              if (!row.link) {
                return (
                  <li key={row.id}>
                    <article className={styles.card}>{inner}</article>
                  </li>
                );
              }

              return (
                <li key={row.id}>
                  <a
                    className={styles.cardLink}
                    href={row.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <article className={styles.card}>{inner}</article>
                  </a>
                </li>
              );
            })}
          </ul>

          <PagePagination
            page={listingsPage}
            totalPages={listingsTotalPages}
            buildHref={listingsHref}
            ariaLabel="Listing pages"
          />
        </main>
      )}
    </div>
  );
}
