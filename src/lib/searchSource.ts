export const SEARCH_SOURCE_VALUES = ["linkedin", "scholar", "github"] as const;
export const ENABLED_SEARCH_SOURCE_VALUES = [
  "linkedin",
  "scholar",
  "github",
] as const;

export type SearchSource = (typeof SEARCH_SOURCE_VALUES)[number];
export type EnabledSearchSource = (typeof ENABLED_SEARCH_SOURCE_VALUES)[number];

export const QUERY_SOURCE_LINKEDIN = 0;
export const QUERY_SOURCE_SCHOLAR = 1;
export const QUERY_SOURCE_GITHUB = 2;

export function isSearchSource(value: unknown): value is SearchSource {
  return (
    typeof value === "string" &&
    SEARCH_SOURCE_VALUES.includes(value as SearchSource)
  );
}

export function isEnabledSearchSource(
  value: unknown
): value is EnabledSearchSource {
  return (
    typeof value === "string" &&
    ENABLED_SEARCH_SOURCE_VALUES.includes(value as EnabledSearchSource)
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

export function getSearchSourceLabel(source: SearchSource): string {
  if (source === "scholar") return "Google Scholar";
  if (source === "github") return "GitHub";
  return "LinkedIn";
}

export function getSearchSourceLogoPath(source: SearchSource): string {
  if (source === "scholar") return "/images/logos/scholar.png";
  if (source === "github") return "/images/logos/github.svg";
  return "/images/logos/linkedin2.svg";
}

function toSearchSource(value: unknown): SearchSource | null {
  if (isSearchSource(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return queryTypeToSearchSource(value);
  }
  return null;
}

function prioritizeSearchSources(sources: SearchSource[]) {
  if (sources.length <= 1) return sources;

  const linkedinIdx = sources.indexOf("linkedin");
  if (linkedinIdx <= 0) return sources;

  return ["linkedin", ...sources.filter((source) => source !== "linkedin")];
}

export function normalizeSearchSources(
  values: unknown,
  options?: {
    enabledOnly?: boolean;
    fallback?: SearchSource[];
  }
): SearchSource[] {
  const allowed = options?.enabledOnly
    ? [...ENABLED_SEARCH_SOURCE_VALUES]
    : [...SEARCH_SOURCE_VALUES];
  const allowedSet = new Set<string>(allowed);

  const deduped: SearchSource[] = [];
  const pushSource = (value: unknown) => {
    const source = toSearchSource(value);
    if (!source || !allowedSet.has(source) || deduped.includes(source)) {
      return;
    }
    deduped.push(source);
  };

  if (Array.isArray(values)) {
    values.forEach(pushSource);
  } else {
    pushSource(values);
  }

  if (deduped.length > 0)
    return prioritizeSearchSources(deduped) as SearchSource[];

  const fallback = Array.isArray(options?.fallback) ? options?.fallback : [];
  fallback.forEach(pushSource);
  return prioritizeSearchSources(deduped) as SearchSource[];
}

const SEARCH_SOURCE_MATCHERS: Record<SearchSource, (value: string) => boolean> =
  {
    linkedin: (value) => value.includes("linkedin.com"),
    scholar: (value) => value.includes("scholar.google."),
    github: (value) => value.includes("github.com"),
  };

export function extractSearchSourcesFromLinks(
  links: string[] | null | undefined,
  options?: {
    enabledOnly?: boolean;
  }
): SearchSource[] {
  if (!Array.isArray(links) || links.length === 0) return [];

  const allowed = options?.enabledOnly
    ? [...ENABLED_SEARCH_SOURCE_VALUES]
    : [...SEARCH_SOURCE_VALUES];

  const detected: SearchSource[] = [];

  for (const source of allowed) {
    const matched = links.some((raw) =>
      SEARCH_SOURCE_MATCHERS[source](String(raw ?? "").toLowerCase())
    );

    if (matched) {
      detected.push(source);
    }
  }

  return detected;
}
