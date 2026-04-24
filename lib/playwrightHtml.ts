import { chromium, type Browser } from "playwright";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;

function usePlaywright(): boolean {
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

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: headless(),
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browserPromise;
}

/**
 * Fetches fully-rendered HTML (JS executed). Used when sites return bot/captcha interstitials
 * to plain HTTP clients.
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<string> {
  if (!usePlaywright()) {
    throw new Error("USE_PLAYWRIGHT=false (Playwright disabled)");
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: CHROME_UA,
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    viewport: { width: 1365, height: 900 },
    javaScriptEnabled: true,
  });

  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
    if (postLoadWaitMs() > 0) {
      await delay(postLoadWaitMs());
    }
    return await page.content();
  } finally {
    await context.close();
  }
}

process.on("SIGINT", async () => {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => undefined);
  }
});
process.on("SIGTERM", async () => {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => undefined);
  }
});
