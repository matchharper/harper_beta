import {
  extractSearchSourcesFromLinks,
  type SearchSource,
} from "@/lib/searchSource";

const MASKED_FULL_VALUE = "****";

const SOURCE_PLACEHOLDER_URLS: Record<SearchSource, string> = {
  linkedin: "https://linkedin.com",
  scholar: "https://scholar.google.com",
  github: "https://github.com",
};

function firstVisibleCharacter(value: string) {
  return Array.from(value.trim())[0] ?? "";
}

export function maskWithFirstCharacter(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return MASKED_FULL_VALUE;

  const first = firstVisibleCharacter(normalized);
  if (!first) return MASKED_FULL_VALUE;
  return `${first}***`;
}

export function maskFullValue() {
  return MASKED_FULL_VALUE;
}

export function buildMaskedSourceLinks(links: unknown) {
  if (!Array.isArray(links)) return [];

  const sources = extractSearchSourcesFromLinks(
    links.map((link) => String(link ?? ""))
  );

  return sources.map((source) => SOURCE_PLACEHOLDER_URLS[source]);
}

export function getRevealLogoColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 54%)`;
}
