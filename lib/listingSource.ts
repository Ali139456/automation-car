/**
 * ID shape from scrapers: "gumtree:…" | "carsales:…"
 */
export function getListingSource(id: string): { key: string; label: string } {
  const i = id.indexOf(":");
  if (i <= 0) return { key: "unknown", label: "Unknown" };
  const key = id.slice(0, i);
  if (key === "gumtree") return { key, label: "Gumtree" };
  if (key === "carsales") return { key, label: "carsales" };
  return { key, label: key };
}
