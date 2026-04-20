/** Extract digits for numeric comparison; preserve display via formatPriceDisplay */
export function parsePriceToNumber(raw: string | number | undefined | null): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const digits = String(raw).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function formatPriceDisplay(n: number, rawFallback?: string): string {
  if (rawFallback && rawFallback.trim() && !/^\d+$/.test(rawFallback.trim())) {
    return rawFallback.trim();
  }
  if (!n) return rawFallback?.trim() || "—";
  return `$${n.toLocaleString("en-AU")}`;
}
