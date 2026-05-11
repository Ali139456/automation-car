import { chromium, type Browser, type Page } from "playwright";
import { getScrapeProxy } from "@/lib/scrapeProxy";
import { getPlaywrightCdpUrl } from "@/lib/playwrightCdp";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;
/** Set when connecting so each fetch can match real-browser vs bundled Chromium behaviour. */
let browserConnectionKind: "launch" | "cdp" | null = null;

/** One Gumtree navigation at a time (shared Browser; concurrent contexts still race the process on some WAFs). */
let playwrightTail: Promise<unknown> = Promise.resolve();

function playwrightFeatureEnabled(): boolean {
  return process.env.USE_PLAYWRIGHT !== "false";
}

function headless(): boolean {
  return process.env.PLAYWRIGHT_HEADLESS !== "false";
}

function timeoutMs(): number {
  const n = Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? "60000");
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

function postLoadWaitMs(): number {
  const n = Number(process.env.PLAYWRIGHT_POST_LOAD_WAIT_MS ?? "3000");
  return Number.isFinite(n) && n >= 0 ? n : 3000;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function launchChannel(): "chrome" | "msedge" | "chromium" | undefined {
  const c = process.env.PLAYWRIGHT_CHANNEL?.trim().toLowerCase();
  if (c === "chrome" || c === "msedge" || c === "chromium") return c;
  return undefined;
}

async function resetBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  await b?.close().catch(() => undefined);
  browserPromise = null;
  browserConnectionKind = null;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const cdp = getPlaywrightCdpUrl();
    if (cdp) {
      console.info(`[playwrightHtml] Connecting to Chrome/Edge via CDP: ${cdp}`);
      browserConnectionKind = "cdp";
      browserPromise = chromium.connectOverCDP(cdp);
    } else {
      browserConnectionKind = "launch";
      browserPromise = chromium.launch({
        headless: headless(),
        channel: launchChannel(),
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });
    }
  }
  return browserPromise;
}

function enqueuePlaywright<T>(task: () => Promise<T>): Promise<T> {
  const run = playwrightTail.then(task);
  playwrightTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isRetriableNavigationError(message: string): boolean {
  return /ERR_ABORTED|ERR_BLOCKED_BY_CLIENT|Navigation timeout|Target page.*closed|has been closed|frame was detached/i.test(
    message,
  );
}

function shouldResetBrowser(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("browser") && (m.includes("closed") || m.includes("disconnect"))) ||
    m.includes("target page, context or browser has been closed")
  );
}

/**
 * WAFs often kill the document before `load` fires; `domcontentloaded` still yields the block / interstitial HTML.
 */
async function gotoWithFallbacks(page: Page, url: string, gumtree: boolean): Promise<void> {
  const t = timeoutMs();
  const strategies: Array<{ waitUntil: NonNullable<Parameters<Page["goto"]>[1]>["waitUntil"] }> =
    gumtree
      ? [{ waitUntil: "domcontentloaded" }, { waitUntil: "load" }, { waitUntil: "commit" }]
      : [{ waitUntil: "domcontentloaded" }, { waitUntil: "load" }];

  let lastErr: unknown;
  for (const { waitUntil } of strategies) {
    try {
      const effectiveTimeout = waitUntil === "commit" ? Math.min(t, 25_000) : t;
      await page.goto(url, { waitUntil, timeout: effectiveTimeout });
      return;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (isRetriableNavigationError(msg)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchHtmlWithPlaywrightInner(url: string): Promise<string> {
  const browser = await getBrowser();
  const gumtree = url.includes("gumtree.com.au");
  const viaCdp = browserConnectionKind === "cdp";
  const proxyConfig = getScrapeProxy()?.playwright;

  const context = await browser.newContext({
    ...(viaCdp ? {} : { userAgent: CHROME_UA }),
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    viewport: { width: 1365, height: 900 },
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
    extraHTTPHeaders: {
      "Accept-Language": "en-AU,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      ...(gumtree ? { Referer: "https://www.gumtree.com.au/" } : {}),
    },
  });

  const page = await context.newPage();
  try {
    if (!viaCdp) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });
    }

    await gotoWithFallbacks(page, url, gumtree);

    if (postLoadWaitMs() > 0) {
      await delay(postLoadWaitMs());
    }

    if (gumtree) {
      const cap = Math.min(45_000, Math.max(20_000, timeoutMs()));
      await page.waitForSelector('a[href*="/s-ad/"], [data-testid="srp-results"]', { timeout: cap }).catch(() => undefined);
    }

    const html = await page.content();
    if (html.length < 500) {
      console.warn(
        `[playwrightHtml] Short HTML (${html.length} chars). First 400 chars: ${html.slice(0, 400).replace(/\s+/g, " ")}`,
      );
    }
    return html;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Fetches fully-rendered HTML (JS executed). Used when sites return bot/captcha interstitials
 * to plain HTTP clients.
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<string> {
  if (!playwrightFeatureEnabled()) {
    throw new Error("USE_PLAYWRIGHT=false (Playwright disabled)");
  }

  return enqueuePlaywright(async () => {
    try {
      return await fetchHtmlWithPlaywrightInner(url);
    } catch (e1) {
      const msg = e1 instanceof Error ? e1.message : String(e1);
      const retryOnce =
        shouldResetBrowser(msg) ||
        (url.includes("gumtree.com.au") &&
          /ERR_ABORTED|ERR_BLOCKED_BY_CLIENT|has been closed|Target page/i.test(msg));
      if (retryOnce) {
        await resetBrowser();
        return fetchHtmlWithPlaywrightInner(url);
      }
      throw e1;
    }
  });
}

process.on("SIGINT", async () => {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => undefined);
  }
  browserPromise = null;
  browserConnectionKind = null;
});
process.on("SIGTERM", async () => {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => undefined);
  }
  browserPromise = null;
  browserConnectionKind = null;
});
