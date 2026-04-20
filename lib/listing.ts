export type ScrapedListing = {
  id: string;
  title: string;
  price: string;
  link: string;
};

export const defaultSearchFilters = {
  maxPriceAud: 3200,
  maxKm: 200_000,
  transmission: "automatic" as const,
  condition: "used" as const,
};
