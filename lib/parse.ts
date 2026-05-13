/** Extract digits for numeric comparison; preserve display via formatPriceDisplay */
export function parsePriceToNumber(raw: string | number | undefined | null): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const digits = String(raw).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * JSON-LD `offers` may be an object, array, or AggregateOffer with lowPrice/highPrice.
 */
export function offerPriceValue(offers: unknown): unknown {
  if (offers == null || offers === false) return undefined;
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const v = offerPriceValue(o);
      if (v != null && v !== "") return v;
    }
    return undefined;
  }
  if (typeof offers === "object") {
    const o = offers as Record<string, unknown>;
    const type = String(o["@type"] ?? "");
    if (type.includes("AggregateOffer")) {
      return o.lowPrice ?? o.highPrice ?? o.price;
    }
    if (type.includes("Offer")) {
      return o.price;
    }
    return o.price ?? o.lowPrice ?? o.highPrice;
  }
  return undefined;
}

/**
 * Gumtree/Carsales SERP JSON often uses strings, numbers, or nested price objects.
 */
export function coerceScrapedPrice(value: unknown): { n: number; displayText?: string } {
  if (value == null || value === false) return { n: 0 };

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return { n: 0 };
    return { n: Math.round(value) };
  }

  if (typeof value === "string") {
    const t = value.trim();
    const n = parsePriceToNumber(t);
    if (n > 0) return { n, displayText: t };
    return { n: 0 };
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const numericKeys = [
      "amount",
      "value",
      "price",
      "amountAud",
      "amountAUD",
      "numericPrice",
      "priceAmount",
      "egc",
      "dap",
      "listPrice",
    ];
    for (const k of numericKeys) {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        return { n: Math.round(v) };
      }
      if (typeof v === "string") {
        const n = parsePriceToNumber(v);
        if (n > 0) return { n, displayText: v.trim() };
      }
    }
    const textKeys = [
      "displayPrice",
      "priceText",
      "formatted",
      "formattedPrice",
      "label",
      "text",
      "display",
      "egcPrice",
      "dapPrice",
    ];
    for (const k of textKeys) {
      const v = o[k];
      if (typeof v === "string") {
        const t = v.trim();
        const n = parsePriceToNumber(t);
        if (n > 0) return { n, displayText: t };
      }
    }
  }

  return { n: 0 };
}

export function formatPriceDisplay(n: number, rawFallback?: string): string {
  if (rawFallback && rawFallback.trim() && !/^\d+$/.test(rawFallback.trim())) {
    return rawFallback.trim();
  }
  if (!n) return rawFallback?.trim() || "—";
  return `$${n.toLocaleString("en-AU")}`;
}
