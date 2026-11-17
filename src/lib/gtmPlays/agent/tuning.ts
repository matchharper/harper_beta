/**
 * #5 사람 찾기 tuning: what Ops changes per source on /ops #5 settings without a deploy. Pure (the API, the run and the
 * screen share it).
 *
 * Per source: two free texts (who to look for → the plan prompt's goal; extra keep/drop criteria → the judge prompt),
 * both put into the prompts as delimited Ops guidance under fixed rules they cannot change (signals.ts), and a few
 * numbers. `signalTuningVersion` is a short, stable hash of the effective tuning (with the prompt revision), so each
 * found person can carry the version that found them and Ops can compare versions.
 */
import { SIGNAL_MAX_AGE_DAYS } from "./people";
import {
  EXPLORE_SOURCE, SIGNAL_PROMPT_REVISION, SIGNAL_SOURCES, cleanOpsText, isDomainSource, normalizeDomainList,
  normalizeSignalSource, signalSourceInfo, type SignalSource,
} from "./signals";

export type SignalTuning = {
  /** Who to look for (free text, merged into the plan prompt's goal). */
  lookFor: string;
  /** Extra keep/drop criteria (free text, merged into the judge prompt). */
  keepRule: string;
  /** Lowest judge score (0-100) a person needs to be kept. */
  minScore: number;
  /** Only pages published within this many days. */
  maxAgeDays: number;
  /** The most one run of this source may spend (search and model together); today's money caps it further. */
  budgetUsd: number;
  /** Plan → search → judge → revise rounds (the layoff method adds one news step and up to two rounds). */
  maxRounds: number;
  /** Results per search. */
  resultsPerSearch: number;
  /** Also look for people from companies with recent layoff news (inside the same budget). */
  layoffSearch: boolean;
};

export type SignalTuningField = keyof SignalTuning;
export const SIGNAL_TUNING_FIELDS: readonly SignalTuningField[] = [
  "lookFor", "keepRule", "minScore", "maxAgeDays", "budgetUsd", "maxRounds", "resultsPerSearch", "layoffSearch",
];

export const SIGNAL_TUNING_LIMITS = {
  textChars: 800,
  minScore: { min: 0, max: 100 },
  maxAgeDays: { min: 1, max: 30 },
  budgetUsd: { min: 0.05, max: 5 },
  maxRounds: { min: 1, max: 5 },
  resultsPerSearch: { min: 5, max: 25 },
  daily: { min: 0, max: 200 },
  exploreShare: { min: 0, max: 1 },
  blockedDomains: 200,
} as const;

/** Share of a run's budget for the open-web search, by default. */
export const DEFAULT_EXPLORE_SHARE = 0.2;

/** Labels for /ops #5. */
export const SIGNAL_TUNING_LABELS: Record<SignalTuningField | "enabled" | "daily" | "exploreShare" | "blockedDomains", string> = {
  exploreShare: "열린 웹 검색 비율",
  blockedDomains: "막을 도메인",
  enabled: "켜기",
  daily: "하루 최대 인원",
  lookFor: "찾을 사람",
  keepRule: "남길 기준",
  minScore: "최소 점수",
  maxAgeDays: "최근 며칠 글",
  budgetUsd: "한 번에 쓸 돈 (USD)",
  maxRounds: "검색 라운드",
  resultsPerSearch: "검색당 결과 수",
  layoffSearch: "감원 뉴스로도 찾기",
};

export function defaultSignalTuning(source: SignalSource): SignalTuning {
  return {
    lookFor: "",
    keepRule: "",
    minScore: 60,
    maxAgeDays: SIGNAL_MAX_AGE_DAYS,
    budgetUsd: signalSourceInfo(source).group === "sns" ? 1 : 0.5,
    maxRounds: 3,
    resultsPerSearch: 10,
    layoffSearch: source === "linkedin",
  };
}

export type SignalTuningIssue = { field: SignalTuningField | "enabled" | "daily" | "exploreShare"; message: string };

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());

function readNumber(
  input: Record<string, unknown>,
  field: SignalTuningField | "daily" | "exploreShare",
  fallback: number,
  limits: { min: number; max: number },
  issues: SignalTuningIssue[],
  round: (value: number) => number = Math.round,
): number {
  const raw = input[field];
  if (isBlank(raw)) return fallback;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  const label = SIGNAL_TUNING_LABELS[field];
  if (!Number.isFinite(value)) {
    issues.push({ field, message: `${label}: 숫자가 아니라서 기본값으로 둬요 (${fallback}).` });
    return fallback;
  }
  const clamped = Math.min(limits.max, Math.max(limits.min, round(value)));
  if (clamped !== round(value)) {
    issues.push({ field, message: `${label}: ${limits.min}~${limits.max} 사이만 돼요 (${value} → ${clamped}).` });
  }
  return clamped;
}

function readText(input: Record<string, unknown>, field: "lookFor" | "keepRule", issues: SignalTuningIssue[]): string {
  const raw = input[field];
  if (isBlank(raw)) return "";
  const full = cleanOpsText(raw, Number.MAX_SAFE_INTEGER);
  const max = SIGNAL_TUNING_LIMITS.textChars;
  if (full.length > max) {
    issues.push({ field, message: `${SIGNAL_TUNING_LABELS[field]}: ${max}자까지만 써요 (${full.length}자 → ${max}자).` });
  }
  return cleanOpsText(raw, max);
}

function readBoolean(input: Record<string, unknown>, field: "layoffSearch" | "enabled", fallback: boolean, issues: SignalTuningIssue[]): boolean {
  const raw = input[field];
  if (isBlank(raw)) return fallback;
  if (typeof raw === "boolean") return raw;
  const text = String(raw).trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(text)) return true;
  if (["false", "0", "off", "no"].includes(text)) return false;
  issues.push({ field, message: `${SIGNAL_TUNING_LABELS[field]}: 켜기/끄기 값이 아니라서 기본값으로 둬요.` });
  return fallback;
}

const asRecord = (input: unknown): Record<string, unknown> => (input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {});

/** The effective tuning of a source: missing fields take the default, numbers are clamped, texts cleaned and cut. */
export function normalizeSignalTuning(input: unknown, source: SignalSource): { tuning: SignalTuning; issues: SignalTuningIssue[] } {
  const record = asRecord(input);
  const base = defaultSignalTuning(source);
  const issues: SignalTuningIssue[] = [];
  const limits = SIGNAL_TUNING_LIMITS;
  const tuning: SignalTuning = {
    lookFor: readText(record, "lookFor", issues),
    keepRule: readText(record, "keepRule", issues),
    minScore: readNumber(record, "minScore", base.minScore, limits.minScore, issues),
    maxAgeDays: readNumber(record, "maxAgeDays", base.maxAgeDays, limits.maxAgeDays, issues),
    budgetUsd: readNumber(record, "budgetUsd", base.budgetUsd, limits.budgetUsd, issues, (value) => Math.round(value * 100) / 100),
    maxRounds: readNumber(record, "maxRounds", base.maxRounds, limits.maxRounds, issues),
    resultsPerSearch: readNumber(record, "resultsPerSearch", base.resultsPerSearch, limits.resultsPerSearch, issues),
    layoffSearch: readBoolean(record, "layoffSearch", base.layoffSearch, issues),
  };
  return { tuning, issues };
}

/** FNV-1a (32-bit) of the UTF-8 bytes, as 8 hex characters. */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A short, stable version of a source's effective tuning (8 hex characters). The same settings give the same
 * version (whatever the key order or extra whitespace); any change that changes who is found gives a new one,
 * including a code change to the prompts (SIGNAL_PROMPT_REVISION). On/off and the daily cap are not part of it.
 */
export function signalTuningVersion(source: SignalSource, tuning: Partial<SignalTuning> | null | undefined): string {
  const effective = normalizeSignalTuning(tuning ?? {}, source).tuning;
  return fnv1a32(JSON.stringify([
    SIGNAL_PROMPT_REVISION, source, ...SIGNAL_TUNING_FIELDS.map((field) => effective[field]),
  ]));
}

/** What changed between two tunings of a source (for the change log on /ops #5). */
export function signalTuningChanges(source: SignalSource, before: Partial<SignalTuning> | null | undefined, after: Partial<SignalTuning> | null | undefined) {
  const a = normalizeSignalTuning(before ?? {}, source).tuning;
  const b = normalizeSignalTuning(after ?? {}, source).tuning;
  return SIGNAL_TUNING_FIELDS.filter((field) => a[field] !== b[field])
    .map((field) => ({ field, label: SIGNAL_TUNING_LABELS[field], before: a[field], after: b[field] }));
}

/** The open-web search's share of a run's signal budget (the rest goes to the enabled sources). */
export function exploreBudgetUsd(runBudgetUsd: number, exploreShare: number): number {
  const share = Number.isFinite(exploreShare) ? Math.min(1, Math.max(0, exploreShare)) : DEFAULT_EXPLORE_SHARE;
  return Math.max(0, Math.round(runBudgetUsd * share * 100) / 100);
}

/** One source's settings entry: on/off, the daily cap (people per day), and its tuning. */
export type SignalSourceSetting = { enabled: boolean; daily: number } & SignalTuning;

export function defaultSignalSourceSetting(source: SignalSource): SignalSourceSetting {
  return { enabled: false, daily: signalSourceInfo(source).group === "sns" ? 30 : 10, ...defaultSignalTuning(source) };
}

/** A source's settings entry, cleaned the same way. */
export function normalizeSignalSourceSetting(input: unknown, source: SignalSource): { setting: SignalSourceSetting; issues: SignalTuningIssue[] } {
  const record = asRecord(input);
  const base = defaultSignalSourceSetting(source);
  const { tuning, issues } = normalizeSignalTuning(record, source);
  const enabled = readBoolean(record, "enabled", base.enabled, issues);
  const daily = readNumber(record, "daily", base.daily, SIGNAL_TUNING_LIMITS.daily, issues);
  return { setting: { enabled, daily, ...tuning }, issues };
}

/**
 * Every source's settings entry, from what is saved: the default list always, plus any domain Ops added ("기본 목록에
 * 넣기"). Keys are source ids; earlier ids such as "opentowork" count for their source unless the source's own id is
 * there too; other keys (e.g. "recruiter", "explore") are left out.
 */
export function normalizeSignalSourceSettings(input: unknown): {
  settings: Record<SignalSource, SignalSourceSetting>;
  issues: Array<SignalTuningIssue & { source: SignalSource }>;
} {
  const record = asRecord(input);
  const byId = new Map<SignalSource, unknown>();
  for (const [key, value] of Object.entries(record)) {
    const id = normalizeSignalSource(key);
    if (!id || id === EXPLORE_SOURCE || (byId.has(id) && key !== id)) continue;
    byId.set(id, value);
  }
  const settings = {} as Record<SignalSource, SignalSourceSetting>;
  const issues: Array<SignalTuningIssue & { source: SignalSource }> = [];
  const added = [...byId.keys()].filter((id) => isDomainSource(id)).sort();
  for (const source of [...SIGNAL_SOURCES, ...added]) {
    const normalized = normalizeSignalSourceSetting(byId.get(source), source);
    settings[source] = normalized.setting;
    issues.push(...normalized.issues.map((issue) => ({ ...issue, source })));
  }
  return { settings, issues };
}

/** The tuning part of a settings entry. */
export function tuningOf(setting: SignalSourceSetting): SignalTuning {
  return Object.fromEntries(SIGNAL_TUNING_FIELDS.map((field) => [field, setting[field]])) as SignalTuning;
}

/** Settings for #5 사람 찾기 as a whole: per-source entries, the open-web search, and blocked domains. */
export type SignalSettings = {
  sources: Record<SignalSource, SignalSourceSetting>;
  /** Share (0..1) of each run's signal budget for the open-web search; 0 turns it off. */
  exploreShare: number;
  /** The open-web search's own tuning (the same fields; layoffSearch is not used there). */
  explore: SignalTuning;
  /** Never searched (exclude_domains on the open web) and never kept, on any source. */
  blockedDomains: string[];
};

/** All signal settings from what is saved ({ sources, exploreShare, explore, blockedDomains }), cleaned. */
export function normalizeSignalSettings(input: unknown): {
  settings: SignalSettings;
  issues: Array<SignalTuningIssue & { source: SignalSource | "settings" }>;
} {
  const record = asRecord(input);
  const sources = normalizeSignalSourceSettings(record.sources);
  const explore = normalizeSignalTuning(record.explore, EXPLORE_SOURCE);
  const issues: Array<SignalTuningIssue & { source: SignalSource | "settings" }> = [
    ...sources.issues,
    ...explore.issues.map((issue) => ({ ...issue, source: EXPLORE_SOURCE })),
  ];
  const share = readNumber(record, "exploreShare", DEFAULT_EXPLORE_SHARE, SIGNAL_TUNING_LIMITS.exploreShare, [], (value) => Math.round(value * 100) / 100);
  const rawShare = record.exploreShare;
  if (!isBlank(rawShare) && share !== Number(rawShare)) {
    issues.push({ source: "settings", field: "exploreShare", message: `${SIGNAL_TUNING_LABELS.exploreShare}: 0~1 사이 숫자만 돼요 (${String(rawShare)} → ${share}).` });
  }
  const blockedDomains = normalizeDomainList(record.blockedDomains, SIGNAL_TUNING_LIMITS.blockedDomains);
  return { settings: { sources: sources.settings, exploreShare: share, explore: explore.tuning, blockedDomains }, issues };
}
