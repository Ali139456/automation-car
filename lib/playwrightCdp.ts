/**
 * Attach Playwright to an already-running Chrome/Edge with remote debugging.
 * Fixes Gumtree "Access denied" when manual Chrome works but bundled Chromium is blocked.
 */
export function getPlaywrightCdpUrl(): string | undefined {
  const u = process.env.PLAYWRIGHT_CDP_URL?.trim();
  return u || undefined;
}

export function isPlaywrightCdpConfigured(): boolean {
  return Boolean(getPlaywrightCdpUrl());
}
