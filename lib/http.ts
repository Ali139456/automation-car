import axios, { type AxiosRequestConfig, isAxiosError } from "axios";
import { fetchHtmlWithPlaywright } from "@/lib/playwrightHtml";
import { getScrapeProxy } from "@/lib/scrapeProxy";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function isGumtreeUrl(url: string): boolean {
  return url.includes("gumtree.com.au");
}

function gumtreePreferPlaywrightFirst(): boolean {
  if (process.env.USE_PLAYWRIGHT === "false") return false;
  if (process.env.GUMTREE_HTTP_FIRST === "true") return false;
  if (process.env.GUMTREE_PLAYWRIGHT_FIRST === "false") return false;
  return true;
}

function shouldRetryWithPlaywright(args: {
  status: number;
  html: string;
  url: string;
}): boolean {
  if (process.env.USE_PLAYWRIGHT === "false") return false;
  if (args.status === 403) return true;
  if ([401, 429, 503].includes(args.status)) return true;
  if (args.status === 200 && looksLikeBotWallHtml(args.html)) return true;
  if (
    args.status === 200 &&
    isGumtreeUrl(args.url) &&
    gumtreeHtmlMissingSearchResults(args.html)
  )
    return true;
  return false;
}

/**
 * Gumtree often serves a Peakhour / anti-bot script to plain `fetch`/axios (datacenters, servers).
 * Browsers get full HTML after JS. Match multiple markers so we fall back to Playwright when needed.
 */
export function looksLikeBotWallHtml(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("captcha-delivery.com") ||
    h.includes("datadome") ||
    h.includes("geo.captcha") ||
    h.includes("peakhour") ||
    h.includes("peakhour-challenge") ||
    h.includes("picassopaint") ||
    h.includes("please enable js") ||
    h.includes("enable js and disable any ad blocker") ||
    h.includes("access denied") ||
    h.includes("verify you are human") ||
    h.includes("perimeterx") ||
    h.includes("px-captcha")
  );
}

/**
 * Axios often gets HTTP 200 with a slim shell/challenge HTML that does not contain our markers yet
 * has no searchable listing payloads. Real Gumtree SERP embeds `/s-ad/` links and/or ItemList JSON-LD.
 */
export function gumtreeHtmlMissingSearchResults(html: string): boolean {
  if (looksLikeBotWallHtml(html)) return true;
  if (html.includes("/s-ad/")) return false;
  const h = html.toLowerCase();
  if (h.includes("itemlistelement")) return false;
  if (/@type"\s*:\s*"itemlist/.test(html)) return false;
  return true;
}

export async function fetchHtml(url: string, config?: AxiosRequestConfig): Promise<string> {
  if (
    isGumtreeUrl(url) &&
    gumtreePreferPlaywrightFirst() &&
    process.env.USE_PLAYWRIGHT !== "false"
  ) {
    const html = await fetchHtmlWithPlaywright(url);
    if (looksLikeBotWallHtml(html)) {
      throw new Error(
        `Gumtree blocked HTML (bot wall / Access denied). Use real Chrome: PLAYWRIGHT_CDP_URL=http://127.0.0.1:9222 and run scripts/start-chrome-cdp.ps1, or change network. Set GUMTREE_HTTP_FIRST=true only to debug axios.`,
      );
    }
    return html;
  }

  try {
    const proxyCfg = getScrapeProxy();
    const res = await axios.get<string>(url, {
      timeout: 35_000,
      responseType: "text",
      // We'll decide how to handle status codes ourselves (so we can fall back to Playwright).
      validateStatus: () => true,
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        ...config?.headers,
      },
      ...(proxyCfg ? { proxy: proxyCfg.axios } : {}),
      ...config,
    });

    if (
      res.status === 200 &&
      typeof res.data === "string" &&
      !looksLikeBotWallHtml(res.data) &&
      !(isGumtreeUrl(url) && gumtreeHtmlMissingSearchResults(res.data))
    ) {
      return res.data;
    }

    if (
      typeof res.data === "string" &&
      shouldRetryWithPlaywright({ status: res.status, html: res.data, url })
    ) {
      console.warn(`[fetchHtml] blocked/interstitial for ${url} (HTTP ${res.status}) — trying Playwright…`);
      const html2 = await fetchHtmlWithPlaywright(url);
      if (looksLikeBotWallHtml(html2)) {
        throw new Error(
          `Gumtree blocked after Playwright (Access denied / bot page). Fix: PLAYWRIGHT_CDP_URL with your Chrome (scripts/start-chrome-cdp.ps1), or residential IP / SCRAPE_HTTPS_PROXY.`,
        );
      }
      if (isGumtreeUrl(url) && gumtreeHtmlMissingSearchResults(html2)) {
        console.warn(
          `[fetchHtml] Gumtree HTML after Playwright still has no /s-ad/ or ItemList (len=${html2.length}). Empty search or residual block.`,
        );
      }
      return html2;
    }

    throw new Error(`Unexpected response for ${url}: status ${res.status}`);
  } catch (e) {
    // `validateStatus: always true` means non-2xx/3xx are usually not thrown; this catch is for
    // real transport failures (TLS/DNS/timeouts) where we might still want Playwright sometimes.
    if (isAxiosError(e) && e.response && typeof e.response.data === "string") {
      const status = e.response.status ?? 0;
      const html = e.response.data;
      if (shouldRetryWithPlaywright({ status, html, url })) {
        console.warn(`[fetchHtml] blocked/interstitial for ${url} (HTTP ${status}) — trying Playwright…`);
        const html2 = await fetchHtmlWithPlaywright(url);
        if (looksLikeBotWallHtml(html2)) {
          throw new Error(
            `Gumtree blocked after Playwright (Access denied / bot page). Fix: PLAYWRIGHT_CDP_URL with your Chrome (scripts/start-chrome-cdp.ps1), or residential IP / SCRAPE_HTTPS_PROXY.`,
          );
        }
        if (isGumtreeUrl(url) && gumtreeHtmlMissingSearchResults(html2)) {
          console.warn(
            `[fetchHtml] Gumtree HTML after Playwright still has no /s-ad/ or ItemList (len=${html2.length}). Empty search or residual block.`,
          );
        }
        return html2;
      }
    }
    throw e;
  }
}
