/**
 * #5 설정 묶음 (owner 11/18: every search, log line and number must be traceable to the exact configuration it ran
 * with, to evaluate and compare later). A 설정 묶음 is everything that decides what the agent does on a tick:
 *   settings   places on/off, the budget split, blocked domains, sender, caps, send days and hours, follow-up rules
 *   search     the one 찾는 기준 (tuning.ts SignalTuning)
 *   rules      fixed rules in code (2 fitting companies, the lookup's score bar, the grader's gate, search budgets …)
 *   prompts    a short hash of each instruction text the model gets (the text for fixed sample inputs, so a wording
 *              change in a template or a rule it includes gives a new hash)
 *   models     the model ids
 * The deployed code version is not part of it (a deploy that changes none of these would split every comparison):
 * each run keeps it on its own (gtm_agent_runs.code_version, agentCodeVersion). It is stored once per distinct content (gtm_agent_configs, id = agentConfigId: a hash of the canonical JSON), so
 * days with nothing changed share one id, and runs, searches, people and spend rows carry the id they ran with.
 * Pure: the run, the API, the screen and the tests share it.
 */
import { SIGNAL_TUNING_FIELDS, SIGNAL_TUNING_LABELS, fnv1a32, type SignalTuning } from "./tuning";
import type { AgentSettings } from "./types";

export const AGENT_CONFIG_SCHEMA = 1;

/** Fixed rules in code that change what the agent does (each has its constant where the rule lives). */
export type AgentConfigRules = {
  /** Different companies' postings a mail needs (match.ts MIN_FITS) and carries at most (MAX_FITS). */
  minFits: number;
  maxFits: number;
  /** A searched person's job-seeking score needed for a paid email lookup (emailLookup.ts LOOKUP_MIN_SIGNAL_SCORE). */
  lookupMinSignalScore: number;
  /** The separate grader's 안 맞음 takes a posting out of the mail (review.ts postingsToMail). */
  graderDropsPoor: boolean;
  /** Search budgets (tickRules.ts): Hacker News per search, a run's share of what is left today, its cap, people per search. */
  hnBudgetUsd: number;
  searchBudgetShare: number;
  searchBudgetMaxUsd: number;
  searchMaxPeople: number;
  /** A searched person's own pages are read too (profileRead.ts READ_SEARCHED_PAGES). */
  readSearchedPages: boolean;
  /** People and pages a search remembers (signals.ts RECENT_MEMORY_DAYS), no second mail within (people.ts RECENT_CONTACT_DAYS). */
  recentMemoryDays: number;
  recentContactDays: number;
  /** A written mail not sent within this many days is not sent (tickRules.ts DRAFT_MAX_AGE_DAYS). */
  draftMaxAgeDays: number;
  /** New people wait while the written mails cover this many days (tickRules.ts QUEUE_DAYS). */
  queueDays: number;
  /** Kept from the day's cap for follow-ups (spend.ts FOLLOWUP_RESERVE_USD); a follow-up this late is not sent. */
  followupReserveUsd: number;
  followupMaxLateDays: number;
  /** The automatic brake (tickRules.ts): this share of hard bounces, or this many spam complaints, turns the agent off. */
  brakeBounceRate: number;
  brakeComplaints: number;
};

/** The instruction texts whose hash a 설정 묶음 keeps (config.server.ts agentPromptVersions). */
export const AGENT_PROMPT_NAMES = ["planner", "judge", "matcher", "postingFrame", "grader", "mailWriter", "lookup", "profile"] as const;
export type AgentPromptName = (typeof AGENT_PROMPT_NAMES)[number];
export type AgentPromptVersions = Partial<Record<AgentPromptName, string>>;

export type AgentConfigModels = {
  /** The model and effort of #5's own calls (llm.server.ts gtmStructuredCall). */
  agent: string;
  /** The posting pick's (Career's shared matcher). */
  matcher: string;
};

export type AgentConfigSettings = {
  /** Place id → on. */
  sources: Record<string, boolean>;
  exploreShare: number;
  blockedDomains: string[];
  senderName: string;
  senderEmail: string;
  dailyMailCap: number;
  dailyCostUsd: number;
  sendStartHour: number;
  sendEndHour: number;
  sendWeekdays: number[];
  followupDays: number;
  quietDaysAfterEnd: number;
};

export type AgentConfigSnapshot = {
  schema: number;
  settings: AgentConfigSettings;
  search: SignalTuning;
  rules: AgentConfigRules;
  prompts: AgentPromptVersions;
  models: AgentConfigModels;
};

/** A stored 설정 묶음 (gtm_agent_configs). */
export type AgentConfig = { id: string; snapshot: AgentConfigSnapshot; firstUsedAt: string };

/**
 * The 설정 묶음 of these settings and code facts, with every list in a fixed order (the same settings give the same
 * snapshot whatever order they were saved in). The on/off switch and the settings version are not in it: an unchanged
 * save is the same 설정 묶음.
 */
export function buildAgentConfigSnapshot(args: {
  settings: Omit<AgentSettings, "enabled" | "version" | "updatedAt">;
  rules: AgentConfigRules;
  prompts: AgentPromptVersions;
  models: AgentConfigModels;
}): AgentConfigSnapshot {
  const { settings } = args;
  const { signals } = settings;
  const sources = Object.fromEntries(Object.entries(signals.sources)
    .map(([id, setting]) => [id, Boolean(setting.enabled)] as const)
    .sort(([a], [b]) => a.localeCompare(b)));
  return {
    schema: AGENT_CONFIG_SCHEMA,
    settings: {
      sources,
      exploreShare: Number(signals.exploreShare),
      blockedDomains: [...new Set(signals.blockedDomains)].sort(),
      senderName: (settings.senderName ?? "").trim(),
      senderEmail: (settings.senderEmail ?? "").trim(),
      dailyMailCap: Number(settings.dailyMailCap),
      dailyCostUsd: Number(settings.dailyCostUsd),
      sendStartHour: Number(settings.sendStartHour),
      sendEndHour: Number(settings.sendEndHour),
      sendWeekdays: [...new Set(settings.sendWeekdays.map(Number))].sort((a, b) => a - b),
      followupDays: Number(settings.followupDays),
      quietDaysAfterEnd: Number(settings.quietDaysAfterEnd),
    },
    search: Object.fromEntries(SIGNAL_TUNING_FIELDS.map((field) => [field, signals.tuning[field]])) as SignalTuning,
    rules: { ...args.rules },
    prompts: Object.fromEntries(Object.entries(args.prompts).filter(([, value]) => typeof value === "string")),
    models: { ...args.models },
  };
}

/** JSON with every object's keys sorted (undefined left out): the same content always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

/** cyrb53: a fast 53-bit string hash (two 32-bit lanes), as 14 hex characters. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export const AGENT_CONFIG_ID = /^[0-9a-f]{12}$/;

/** A 설정 묶음's id: 12 hex characters of the hash of its canonical JSON. */
export function agentConfigId(snapshot: AgentConfigSnapshot): string {
  return hash53(canonicalJson(snapshot)).slice(-12);
}

/** One instruction's version: 8 hex characters of its texts (system and user, for the fixed sample inputs). */
export function promptVersion(texts: readonly string[]): string {
  return fnv1a32(texts.join("\n\u0000\n"));
}

/** The code version a run ran with (not part of the 설정 묶음): the deployed commit (12 characters), else the deployment id, else "local". */
export function agentCodeVersion(env: Readonly<Record<string, string | undefined>>): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) return sha.slice(0, 12);
  return env.VERCEL_DEPLOYMENT_ID?.trim() || "local";
}

/** "#3fa9c": how the screen names a 설정 묶음. */
export const shortConfigId = (id: string) => `#${id.slice(0, 5)}`;

/** "11/18": the Korea-time day a 설정 묶음 was first used. */
export function configStartLabel(firstUsedAt: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(firstUsedAt));
  const [month, date] = day.split("-").map(Number);
  return `${month}/${date}`;
}

/** "설정 묶음 #3fa9c (11/18부터)". */
export const configLabel = (config: Pick<AgentConfig, "id" | "firstUsedAt">) =>
  `설정 묶음 ${shortConfigId(config.id)} (${configStartLabel(config.firstUsedAt)}부터)`;

/**
 * The 설정 묶음 used just before this one (the latest first used before it), or null for the first. `configs` in any
 * order.
 */
export function previousConfig<T extends Pick<AgentConfig, "id" | "firstUsedAt">>(configs: readonly T[], id: string): T | null {
  const current = configs.find((config) => config.id === id);
  if (!current) return null;
  let previous: T | null = null;
  for (const config of configs) {
    if (config.id === id || config.firstUsedAt >= current.firstUsedAt) continue;
    if (!previous || config.firstUsedAt > previous.firstUsedAt) previous = config;
  }
  return previous;
}

// ---------------------------------------------------------------------------------------------------------------
// In words (the screen's list and what changed)

export type AgentConfigGroup = "sources" | "search" | "sending" | "rules" | "prompts" | "models";

export const CONFIG_GROUP_LABEL: Record<AgentConfigGroup, string> = {
  sources: "찾는 곳",
  search: "찾는 기준",
  sending: "보내기·비용",
  rules: "코드에 정한 규칙",
  prompts: "AI에게 주는 지침",
  models: "AI 모델·프로그램",
};

const PROMPT_LABEL: Record<AgentPromptName, string> = {
  planner: "검색 계획 지침",
  judge: "구직 판단 지침",
  matcher: "공고 고르기 지침",
  postingFrame: "공고 이유 쓰기 지침",
  grader: "따로 채점 지침",
  mailWriter: "메일 쓰기 지침",
  lookup: "이메일 찾기 지침",
  profile: "프로필 읽기 지침",
};

const RULE_LABEL: Record<keyof AgentConfigRules, string> = {
  minFits: "메일을 보내려면 맞는 회사가 몇 곳 있어야 하나",
  maxFits: "메일 한 통에 넣는 공고 수(최대)",
  lookupMinSignalScore: "돈 내고 이메일 찾기: 검색으로 찾은 사람의 구직 신호 점수",
  graderDropsPoor: "따로 채점에서 '안 맞음'인 공고는 메일에서 빼기",
  hnBudgetUsd: "해커뉴스 검색 한 번의 최대 비용",
  searchBudgetShare: "실행 한 번의 검색 예산(오늘 남은 돈 중)",
  searchBudgetMaxUsd: "실행 한 번의 검색 예산 상한",
  searchMaxPeople: "검색 한 번에 남기는 사람(최대)",
  readSearchedPages: "검색으로 찾은 사람의 페이지도 읽기",
  recentMemoryDays: "이미 찾은 사람·본 페이지를 기억하는 기간",
  recentContactDays: "최근에 메일 받은 사람에게 다시 안 보내는 기간",
  draftMaxAgeDays: "써 둔 메일을 보낼 수 있는 기간",
  queueDays: "써 둔 메일이 며칠치 쌓이면 새 사람을 멈추나",
  followupReserveUsd: "하루 비용 한도 중 후속 메일용으로 남기는 돈",
  followupMaxLateDays: "후속 메일이 이만큼 늦으면 보내지 않기",
  brakeBounceRate: "반송이 이 비율을 넘으면 자동으로 끄기",
  brakeComplaints: "스팸 신고가 이만큼이면 자동으로 끄기",
};

const onOff = (value: unknown) => (value ? "켜짐" : "꺼짐");
const money = (value: unknown) => `$${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;
const percent = (value: unknown) => `${Math.round(Number(value) * 100)}%`;
const unit = (suffix: string) => (value: unknown) => `${value}${suffix}`;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "없음");
const list = (value: unknown) => (Array.isArray(value) && value.length ? value.join(", ") : "없음");

const RULE_FORMAT: Record<keyof AgentConfigRules, (value: unknown) => string> = {
  minFits: unit("곳"), maxFits: unit("개"), lookupMinSignalScore: unit("점 이상"), graderDropsPoor: onOff,
  hnBudgetUsd: money, searchBudgetShare: percent, searchBudgetMaxUsd: money, searchMaxPeople: unit("명"),
  readSearchedPages: onOff, recentMemoryDays: unit("일"), recentContactDays: unit("일"), draftMaxAgeDays: unit("일"),
  queueDays: unit("일치"), followupReserveUsd: money, followupMaxLateDays: unit("일"), brakeBounceRate: percent,
  brakeComplaints: unit("건"),
};

const SEARCH_FORMAT: Record<keyof SignalTuning, (value: unknown) => string> = {
  lookFor: text, keepRule: text, minScore: unit("점"), minMatchScore: unit("점"), maxAgeDays: unit("일"),
  maxRounds: unit("번"), resultsPerSearch: unit("개"), layoffSearch: onOff,
};

/** Words the caller knows better (the screen's own place names and send days). */
export type ConfigWords = {
  source?: (id: string) => string;
  weekdays?: (days: readonly number[]) => string;
};

/** One line of a 설정 묶음 in words. `key` is stable across 설정 묶음 (what a change is matched on). */
export type AgentConfigEntry = {
  key: string; group: AgentConfigGroup; label: string; value: string;
  /** The raw value (lists: what was added or taken out). */
  raw: unknown;
};

/** Every line of a 설정 묶음, in the screen's order (찾는 곳 → 찾는 기준 → 보내기·비용 → 규칙 → 지침 → 모델·프로그램). */
export function agentConfigEntries(snapshot: AgentConfigSnapshot, words: ConfigWords = {}): AgentConfigEntry[] {
  const sourceWord = words.source ?? ((id: string) => id);
  const weekdaysWord = words.weekdays ?? ((days: readonly number[]) => days.join("·"));
  const settings = (snapshot.settings ?? {}) as Partial<AgentConfigSettings>;
  const entries: AgentConfigEntry[] = [];
  const add = (group: AgentConfigGroup, key: string, label: string, raw: unknown, format: (value: unknown) => string) => {
    entries.push({ key, group, label, raw, value: raw === undefined ? "—" : format(raw) });
  };
  // The places as two lists (on, off) in the screen's names: a change reads "켜진 곳: 더함 Threads · 뺌 velog".
  const places = Object.entries(settings.sources ?? {});
  const names = (on: boolean) => places.filter(([, value]) => value === on).map(([id]) => sourceWord(id)).sort((a, b) => a.localeCompare(b));
  if (settings.sources !== undefined) {
    add("sources", "sources.on", "켜진 곳", names(true), list);
    add("sources", "sources.off", "꺼진 곳", names(false), list);
  }
  add("sources", "settings.exploreShare", SIGNAL_TUNING_LABELS.exploreShare, settings.exploreShare, percent);
  add("sources", "settings.blockedDomains", SIGNAL_TUNING_LABELS.blockedDomains, settings.blockedDomains, list);
  for (const field of SIGNAL_TUNING_FIELDS) {
    add("search", `search.${field}`, SIGNAL_TUNING_LABELS[field], snapshot.search?.[field], SEARCH_FORMAT[field]);
  }
  add("sending", "settings.senderName", "보내는 사람 이름", settings.senderName, text);
  add("sending", "settings.senderEmail", "보내는 메일 주소", settings.senderEmail, text);
  add("sending", "settings.dailyMailCap", "하루 메일 수", settings.dailyMailCap, unit("통"));
  add("sending", "settings.dailyCostUsd", "하루 비용 상한", settings.dailyCostUsd, money);
  const hours = settings.sendWeekdays === undefined ? undefined
    : { days: settings.sendWeekdays, start: settings.sendStartHour, end: settings.sendEndHour };
  add("sending", "settings.sendHours", "보내는 요일·시간(한국 시간)", hours,
    (value) => { const item = value as { days: number[]; start: number; end: number }; return `${weekdaysWord(item.days)} ${item.start}~${item.end}시`; });
  add("sending", "settings.followupDays", "후속 메시지", settings.followupDays, unit("일 뒤"));
  add("sending", "settings.quietDaysAfterEnd", "끝난 뒤 쉬는 기간", settings.quietDaysAfterEnd, unit("일"));
  const rules = (snapshot.rules ?? {}) as Partial<AgentConfigRules>;
  for (const field of Object.keys(RULE_LABEL) as Array<keyof AgentConfigRules>) {
    add("rules", `rules.${field}`, RULE_LABEL[field], rules[field], RULE_FORMAT[field]);
  }
  const prompts = snapshot.prompts ?? {};
  const promptNames = [...AGENT_PROMPT_NAMES, ...Object.keys(prompts).filter((name) => !(AGENT_PROMPT_NAMES as readonly string[]).includes(name))];
  for (const name of promptNames) {
    const version = (prompts as Record<string, string | undefined>)[name];
    if (version === undefined) continue;
    add("prompts", `prompts.${name}`, PROMPT_LABEL[name as AgentPromptName] ?? name, version, (value) => `#${String(value).slice(0, 6)}`);
  }
  add("models", "models.agent", "AI 모델", snapshot.models?.agent, text);
  add("models", "models.matcher", "공고 고르기 AI 모델", snapshot.models?.matcher, text);
  return entries;
}

/** One difference between two 설정 묶음, as one line ("최소 점수: 50점 → 60점"). */
export type AgentConfigChange = { key: string; group: AgentConfigGroup; label: string; before: string; after: string; text: string };

/**
 * What changed from `before` to `after`, in the screen's order: a list says what was added and taken out, an
 * instruction says it changed (its words are in the code, not here), the rest "before → after". Nothing for the first.
 */
export function agentConfigChanges(before: AgentConfigSnapshot | null, after: AgentConfigSnapshot, words: ConfigWords = {}): AgentConfigChange[] {
  if (!before) return [];
  const old = new Map(agentConfigEntries(before, words).map((entry) => [entry.key, entry]));
  const next = agentConfigEntries(after, words);
  const keys = [...next.map((entry) => entry.key), ...[...old.keys()].filter((key) => !next.some((entry) => entry.key === key))];
  const changes: AgentConfigChange[] = [];
  for (const key of keys) {
    const a = old.get(key);
    const b = next.find((entry) => entry.key === key);
    if (canonicalJson(a?.raw ?? null) === canonicalJson(b?.raw ?? null)) continue;
    const entry = (b ?? a) as AgentConfigEntry;
    const beforeText = a?.value ?? "—";
    const afterText = b?.value ?? "—";
    let line = `${entry.label}: ${beforeText} → ${afterText}`;
    if (Array.isArray(a?.raw) || Array.isArray(b?.raw)) {
      const was = new Set((Array.isArray(a?.raw) ? a?.raw : []) as unknown[]);
      const now = new Set((Array.isArray(b?.raw) ? b?.raw : []) as unknown[]);
      const added = [...now].filter((item) => !was.has(item));
      const removed = [...was].filter((item) => !now.has(item));
      line = `${entry.label}: ${[added.length ? `더함 ${added.join(", ")}` : "", removed.length ? `뺌 ${removed.join(", ")}` : ""].filter(Boolean).join(" · ")}`;
    } else if (entry.group === "prompts") {
      line = `${entry.label}: 바뀜 (${beforeText} → ${afterText})`;
    }
    changes.push({ key, group: entry.group, label: entry.label, before: beforeText, after: afterText, text: line });
  }
  return changes;
}
