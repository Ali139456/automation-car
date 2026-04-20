import axios, { type AxiosRequestConfig } from "axios";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, config?: AxiosRequestConfig): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: 35_000,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 400,
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      ...config?.headers,
    },
    ...config,
  });

  if (res.status !== 200 || typeof res.data !== "string") {
    throw new Error(`Unexpected response for ${url}: status ${res.status}`);
  }

  return res.data;
}
