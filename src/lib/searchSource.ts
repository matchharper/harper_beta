export const SEARCH_SOURCE_VALUES = ["linkedin", "scholar", "github"] as const;

export type SearchSource = (typeof SEARCH_SOURCE_VALUES)[number];

export const QUERY_SOURCE_LINKEDIN = 0;
export const QUERY_SOURCE_SCHOLAR = 1;
export const QUERY_SOURCE_GITHUB = 2;

export function isSearchSource(value: unknown): value is SearchSource {
  return (
    typeof value === "string" &&
    SEARCH_SOURCE_VALUES.includes(value as SearchSource)
  );
}

export function queryTypeToSearchSource(value?: number | null): SearchSource {
  if (value === QUERY_SOURCE_SCHOLAR) return "scholar";
  if (value === QUERY_SOURCE_GITHUB) return "github";
  return "linkedin";
}

export function searchSourceToQueryType(value?: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === QUERY_SOURCE_SCHOLAR) return QUERY_SOURCE_SCHOLAR;
    if (value === QUERY_SOURCE_GITHUB) return QUERY_SOURCE_GITHUB;
    return QUERY_SOURCE_LINKEDIN;
  }

  if (!isSearchSource(value)) return QUERY_SOURCE_LINKEDIN;
  if (value === "scholar") return QUERY_SOURCE_SCHOLAR;
  if (value === "github") return QUERY_SOURCE_GITHUB;
  return QUERY_SOURCE_LINKEDIN;
}

export function normalizeSearchSource(value?: unknown): SearchSource {
  if (typeof value === "number" && Number.isFinite(value)) {
    return queryTypeToSearchSource(value);
  }

  if (isSearchSource(value)) return value;
  return "linkedin";
}

export function isScholarSearchSource(value?: unknown): boolean {
  return normalizeSearchSource(value) === "scholar";
}
