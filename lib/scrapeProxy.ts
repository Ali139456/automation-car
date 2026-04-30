/**
 * Optional outbound proxy for scrapers (residential / home exit you control).
 * `SCRAPE_HTTPS_PROXY` wins over `HTTPS_PROXY` so app traffic can differ from other tools.
 */
export type ScrapeProxyConfig = {
  /** Playwright `Browser.newContext({ proxy })` */
  playwright: { server: string; username?: string; password?: string };
  /** Axios `proxy` option (HTTP CONNECT to upstream) */
  axios: {
    protocol: string;
    host: string;
    port: number;
    auth?: { username: string; password: string };
  };
};

export function getScrapeProxy(): ScrapeProxyConfig | undefined {
  const raw =
    process.env.SCRAPE_HTTPS_PROXY?.trim() || process.env.HTTPS_PROXY?.trim();
  if (!raw) return undefined;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    console.warn("[scrapeProxy] invalid SCRAPE_HTTPS_PROXY / HTTPS_PROXY URL — ignoring");
    return undefined;
  }

  const protocol = (u.protocol === "https:" ? "https" : "http") as "http" | "https";
  const port = u.port
    ? Number(u.port)
    : u.protocol === "https:"
      ? 443
      : 80;
  const host = u.hostname;
  if (!host) return undefined;

  const server = `${protocol === "https" ? "https" : "http"}://${host}:${port}`;
  const hasUser = u.username !== "";
  const auth = hasUser
    ? {
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password ?? ""),
      }
    : undefined;

  const playwright: ScrapeProxyConfig["playwright"] = { server };
  if (auth) {
    playwright.username = auth.username;
    playwright.password = auth.password;
  }

  return {
    playwright,
    axios: {
      protocol,
      host,
      port,
      ...(auth && { auth }),
    },
  };
}
