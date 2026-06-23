import {
  normalizeLocaleOrDefault,
  type ResolvedLocale,
} from "@/i18n/localeResolution";

export type TalentNetworkProfileInputType =
  | "linkedin"
  | "github"
  | "scholar"
  | "website"
  | "cv";

export const TALENT_NETWORK_PROFILE_INPUT_OPTIONS: Array<{
  id: TalentNetworkProfileInputType;
  label: string;
}> = [
  { id: "cv", label: "CV/이력서" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "github", label: "GitHub / Hugging Face" },
  { id: "scholar", label: "Google Scholar" },
  { id: "website", label: "개인 사이트" },
];

const TALENT_NETWORK_PROFILE_INPUT_LABELS: Record<
  TalentNetworkProfileInputType,
  Record<ResolvedLocale, string>
> = {
  cv: {
    ko: "CV/이력서",
    en: "CV / Resume",
  },
  linkedin: {
    ko: "LinkedIn",
    en: "LinkedIn",
  },
  github: {
    ko: "GitHub / Hugging Face",
    en: "GitHub / Hugging Face",
  },
  scholar: {
    ko: "Google Scholar",
    en: "Google Scholar",
  },
  website: {
    ko: "개인 사이트",
    en: "Personal website",
  },
};

export function getTalentNetworkProfileInputLabel(
  id: TalentNetworkProfileInputType,
  locale?: string | null
) {
  const resolvedLocale = normalizeLocaleOrDefault(locale, "ko");
  return TALENT_NETWORK_PROFILE_INPUT_LABELS[id][resolvedLocale];
}

export function getTalentNetworkProfileInputOptions(locale?: string | null) {
  return TALENT_NETWORK_PROFILE_INPUT_OPTIONS.map((option) => ({
    ...option,
    label: getTalentNetworkProfileInputLabel(option.id, locale),
  }));
}

export const TALENT_NETWORK_ENGAGEMENT_OPTIONS = [
  {
    id: "full_time",
    label: "Full-time Role",
    description: "현재 지원한 포지션 포함",
  },
  {
    id: "fractional",
    label: "Fractional / Part-time",
    description: "현업 유지하며 핵심 프로젝트만 참여",
  },
  {
    id: "advisor",
    label: "Technical Advisor",
    description: "전략적/기술적 자문 중심",
  },
] as const;

export type TalentNetworkEngagementOptionId =
  (typeof TALENT_NETWORK_ENGAGEMENT_OPTIONS)[number]["id"];

export function getTalentEngagementLabels(values: unknown) {
  const selected = new Set(normalizeStringArray(values));
  return TALENT_NETWORK_ENGAGEMENT_OPTIONS.filter((option) =>
    selected.has(option.id)
  ).map((option) => option.label);
}

function normalizeText(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeStringArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const next = normalizeText(item, 160);
    if (!next) continue;
    if (unique.has(next)) continue;
    unique.add(next);
    normalized.push(next);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}
