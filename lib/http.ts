import axios, { type AxiosRequestConfig, isAxiosError } from "axios";
import { fetchHtmlWithPlaywright } from "@/lib/playwrightHtml";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function shouldRetryWithPlaywright(args: { status: number; html: string }): boolean {
  if (process.env.USE_PLAYWRIGHT === "false") return false;
  if (args.status === 403) return true;
  if (args.status === 200 && looksLikeBotWallHtml(args.html)) return true;
  return false;
}

function looksLikeBotWallHtml(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("captcha-delivery.com") ||
    h.includes("peakhour-challenge") ||
    h.includes("please enable js") ||
    h.includes("enable js and disable any ad blocker")
  );
}

export async function fetchHtml(url: string, config?: AxiosRequestConfig): Promise<string> {
  try {
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
      ...config,
    });

    if (res.status === 200 && typeof res.data === "string" && !looksLikeBotWallHtml(res.data)) {
      return res.data;
    }

    if (typeof res.data === "string" && shouldRetryWithPlaywright({ status: res.status, html: res.data })) {
      console.warn(`[fetchHtml] blocked/interstitial for ${url} (HTTP ${res.status}) — trying Playwright…`);
      const html2 = await fetchHtmlWithPlaywright(url);
      if (looksLikeBotWallHtml(html2)) {
        throw new Error(
          `Still seeing bot/captcha interstitial after Playwright for ${url}. You may need a different network (residential IP/VPN) or a manual session approach.`,
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
      if (shouldRetryWithPlaywright({ status, html })) {
        console.warn(`[fetchHtml] blocked/interstitial for ${url} (HTTP ${status}) — trying Playwright…`);
        const html2 = await fetchHtmlWithPlaywright(url);
        if (looksLikeBotWallHtml(html2)) {
          throw new Error(
            `Still seeing bot/captcha interstitial after Playwright for ${url}. You may need a different network (residential IP/VPN) or a manual session approach.`,
          );
        }
        return html2;
      }
    }
    throw e;
  }
}
