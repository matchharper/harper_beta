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

export const TALENT_NETWORK_LOCATION_OPTIONS = [
  {
    id: "korea_based",
    label: "Korea-based Teams",
    description: "한국 진출 글로벌 팀 또는 국내 유니콘",
  },
  {
    id: "global_remote",
    label: "US/Global Remote",
    description: "한국에 머물며 해외 팀과 원격 근무",
  },
  {
    id: "relocation",
    label: "Relocation to US/Global",
    description: "비자 스폰서십 및 relocation 지원 시",
  },
] as const;

export const TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS = [
  {
    id: "ready_to_move",
    label: "좋은 기회라면 바로 이직 의향 있음",
  },
  {
    id: "open_to_explore",
    label: "아직 이직 생각은 없지만, 기회를 받아보고 결정하고 싶음",
  },
  {
    id: "advisor_or_part_time_only",
    label: "이직 생각 없고, 파트타임이나 advisor만 할 의향 있음",
  },
] as const;

export type TalentNetworkEngagementOptionId =
  (typeof TALENT_NETWORK_ENGAGEMENT_OPTIONS)[number]["id"];
export type TalentNetworkLocationOptionId =
  (typeof TALENT_NETWORK_LOCATION_OPTIONS)[number]["id"];
export type TalentNetworkCareerMoveIntentOptionId =
  (typeof TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS)[number]["id"];

export function getTalentCareerMoveIntentLabel(value: unknown) {
  const candidate = String(value ?? "").trim();
  const matched = TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS.find(
    (option) => option.id === candidate
  );
  return matched?.label ?? null;
}

export function getTalentEngagementLabels(values: unknown) {
  const selected = new Set(normalizeStringArray(values));
  return TALENT_NETWORK_ENGAGEMENT_OPTIONS.filter((option) =>
    selected.has(option.id)
  ).map((option) => option.label);
}

export function getTalentLocationLabels(values: unknown) {
  const selected = new Set(normalizeStringArray(values));
  return TALENT_NETWORK_LOCATION_OPTIONS.filter((option) =>
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
