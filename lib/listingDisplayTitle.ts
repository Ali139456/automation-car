/**
 * Human-readable title when DB has placeholder "Unknown" (weak JSON-LD won over HTML parse).
 */
function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function slugToTitle(slug: string): string | null {
  const raw = decodeURIComponent(slug).replace(/\+/g, " ").trim();
  if (!raw || raw.length < 3) return null;
  if (/^c\d+$/i.test(raw)) return null;
  if (/^\d+$/.test(raw)) return null;
  const cleaned = raw.replace(/-/g, " ").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return null;
  return titleCaseWords(cleaned);
}

/** Gumtree ad path: .../s-ad/<area>/<slug>/<id> (slug is usually before numeric id). */
export function titleFromGumtreeLink(link: string): string | null {
  try {
    const u = new URL(link);
    if (!u.hostname.includes("gumtree.com.au")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("s-ad");
    if (i < 0) return null;
    const after = parts.slice(i + 1);
    if (after.length < 2) return null;
    const last = after[after.length - 1] ?? "";
    if (!/^\d{6,}$/.test(last)) return null;
    const slug = after[after.length - 2] ?? "";
    return slugToTitle(slug);
  } catch {
    return null;
  }
}

/** Carsales: /cars/details/<slug-with-dashes>/… */
export function titleFromCarsalesLink(link: string): string | null {
  try {
    const u = new URL(link);
    if (!u.hostname.includes("carsales.com.au")) return null;
    const m = u.pathname.match(/\/cars\/details\/([^/?]+)/i);
    const slug = m?.[1];
    if (!slug) return null;
    return slugToTitle(slug);
  } catch {
    return null;
  }
}

export function formatListingTitle(
  title: string | null | undefined,
  link: string | null | undefined,
): string {
  const t = title?.trim();
  if (t && t.toLowerCase() !== "unknown") return t;
  const href = link?.trim() ?? "";
  if (!href) return t || "Listing";
  const fromGum = titleFromGumtreeLink(href);
  if (fromGum) return fromGum;
  const fromCs = titleFromCarsalesLink(href);
  if (fromCs) return fromCs;
  return t && t.length > 0 ? t : "Listing";
}
