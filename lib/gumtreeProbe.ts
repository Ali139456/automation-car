import { fetchHtml, looksLikeBotWallHtml, gumtreeHtmlMissingSearchResults } from "@/lib/http";
import { getGumtreeSearchUrl } from "@/lib/scrapers/gumtree";
import { isPlaywrightCdpConfigured } from "@/lib/playwrightCdp";

/**
 * One-off fetch of the configured Gumtree search page for debugging when `examined: 0`.
 */
export async function probeGumtreeSearchPage(): Promise<{
  url: string;
  htmlLength: number;
  hasListingLinks: boolean;
  hasNextData: boolean;
  hasJsonLdItemList: boolean;
  looksLikeBotWall: boolean;
  gumtreeIncompleteShell: boolean;
  usePlaywright: boolean;
  playwrightCdp: boolean;
  error?: string;
}> {
  const url = getGumtreeSearchUrl();
  const usePlaywright = process.env.USE_PLAYWRIGHT !== "false";
  try {
    const html = await fetchHtml(url);
    const h = html.toLowerCase();
    return {
      url,
      htmlLength: html.length,
      hasListingLinks: html.includes("/s-ad/"),
      hasNextData: html.includes("__NEXT_DATA__"),
      hasJsonLdItemList: h.includes("itemlist") && h.includes("application/ld+json"),
      looksLikeBotWall: looksLikeBotWallHtml(html),
      gumtreeIncompleteShell: gumtreeHtmlMissingSearchResults(html),
      usePlaywright,
      playwrightCdp: isPlaywrightCdpConfigured(),
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      url,
      htmlLength: 0,
      hasListingLinks: false,
      hasNextData: false,
      hasJsonLdItemList: false,
      looksLikeBotWall: false,
      gumtreeIncompleteShell: true,
      usePlaywright,
      playwrightCdp: isPlaywrightCdpConfigured(),
      error,
    };
  }
}
