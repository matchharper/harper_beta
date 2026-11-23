/**
 * gtm agent channels (Shaun 11/23): a channel is where the person was found × why they wrote (the intent), and the intent
 * picks the offer the first mail makes. Pure: the run, the queue, /ops and the tests share it.
 *
 * One queue policy for finding, writing and sending ("기다리면 손해가 큰 사람부터, 보낼 수 있는 만큼만 써 둔다", 11/23):
 *   1 follow-ups → 2 the existing channels' dated people (posts, open-to-work profiles, layoffs; newest first) →
 *   3 the new channels' dated people (career-help and event posts, comments, GitHub) → 4 the applicant file →
 *   5 the purchased DB.
 * The new channels (3 and 5, "보충") each send at most their daily max (every mail of theirs, follow-ups included)
 * and only that many are written ahead. One brake rule, measured per channel (that channel turns off) and in total
 * (the agent turns off), as before.
 */

/** Why the person wrote, as the search's judge read it: job seeking, asking for career or résumé help, or for events. */
export type AgentIntent = "job" | "coaching" | "event";
export const AGENT_INTENTS: readonly AgentIntent[] = ["job", "coaching", "event"];

/**
 * What the first mail offers (gtm_agent_people.message_kind): posting = 2-3 fitting postings (the mail as before);
 * coaching = career help in Harper's chat, no posting; general = fitting postings and events together, for someone
 * with no stated intent (the purchased DB) or looking for events.
 */
export type AgentOffer = "posting" | "coaching" | "general";
export const AGENT_OFFERS: readonly AgentOffer[] = ["posting", "coaching", "general"];

/** Whether the person is the page's author or someone who commented on it (LinkedIn posts, HN threads). */
export type AgentFoundAs = "author" | "commenter";

/** The existing channels: no daily max of their own, the shared cap only. */
export const MAIN_CHANNELS = ["job", "layoff", "applicant"] as const;
/** The new channels (보충): each within its own daily max. */
export const FILL_CHANNELS = ["coaching_post", "event_post", "comment", "github", "db"] as const;

export type AgentMainChannel = (typeof MAIN_CHANNELS)[number];
export type AgentFillChannel = (typeof FILL_CHANNELS)[number];
export type AgentChannelKey = AgentMainChannel | AgentFillChannel;
export const AGENT_CHANNELS: readonly AgentChannelKey[] = [...MAIN_CHANNELS, ...FILL_CHANNELS];

export const CHANNEL_LABELS: Record<AgentChannelKey, string> = {
  job: "구직 글·프로필",
  layoff: "구조조정 회사",
  applicant: "지원자 파일",
  coaching_post: "LinkedIn 상담 글",
  event_post: "LinkedIn 이벤트 글",
  comment: "LinkedIn 댓글",
  github: "GitHub 구직 표시",
  db: "구매 DB",
};

export const INTENT_LABELS: Record<AgentIntent, string> = { job: "구직", coaching: "커리어·레쥬메 도움", event: "이벤트" };
export const OFFER_LABELS: Record<AgentOffer, string> = { posting: "공고", coaching: "상담", general: "일반" };

export type ChannelFacts = {
  source: string;
  method: string;
  intent?: AgentIntent | null;
  foundAs?: AgentFoundAs | null;
};

/** The person's channel, from where they were found, how, and why they wrote. */
export function channelOf(person: ChannelFacts): AgentChannelKey {
  if (person.method === "db") return "db";
  if (person.method === "applicant") return "applicant";
  if (person.method === "layoff_company") return "layoff";
  if (person.source === "github") return "github";
  // Comments on a LinkedIn post (a Hacker News thread's people stay as they were: that thread is a job-seeking list).
  if (person.foundAs === "commenter" && person.source === "linkedin") return "comment";
  if (person.intent === "coaching") return "coaching_post";
  if (person.intent === "event") return "event_post";
  return "job";
}

export function isFillChannel(channel: AgentChannelKey): channel is AgentFillChannel {
  return (FILL_CHANNELS as readonly string[]).includes(channel);
}

/** The offer the intent picks: the purchased DB has none (general), events go with postings (general). */
export function offerOf(person: Pick<ChannelFacts, "method" | "intent">): AgentOffer {
  if (person.method === "db") return "general";
  if (person.intent === "coaching") return "coaching";
  if (person.intent === "event") return "general";
  return "posting";
}

/** The stored offer (message_kind), with mails written before it existed read as posting mails. */
export function storedOffer(messageKind: string | null | undefined): AgentOffer {
  return messageKind === "coaching" || messageKind === "general" ? messageKind : "posting";
}

// ---------------------------------------------------------------------------------------------------------------
// The order (steps 2-5 of the policy; follow-ups are sent before any first mail)

/**
 * Where a waiting person stands: 0 an existing channel's dated person, 1 a new channel's dated person, 2 an existing
 * channel without a date (the applicant file), 3 a new channel without one (the DB). Lower goes first.
 */
export function queueRank(person: { channel: AgentChannelKey; signalAt: string | null }): number {
  const dated = Number.isFinite(Date.parse(String(person.signalAt ?? "")));
  return (dated ? 0 : 2) + (isFillChannel(person.channel) ? 1 : 0);
}

export type QueuedPerson = { channel: AgentChannelKey; signalAt: string | null; updatedAt: string };

/** The policy's order: by rank, then the newest signal, then the one waiting longest. */
export function byQueueOrder(a: QueuedPerson, b: QueuedPerson): number {
  const rank = queueRank(a) - queueRank(b);
  if (rank) return rank;
  const signalA = Date.parse(String(a.signalAt ?? ""));
  const signalB = Date.parse(String(b.signalAt ?? ""));
  if (Number.isFinite(signalA) && Number.isFinite(signalB) && signalA !== signalB) return signalB - signalA;
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
}

// ---------------------------------------------------------------------------------------------------------------
// Settings (gtm_agent_settings.channels)

/**
 * A channel's on/off and daily max (null: none, the shared cap only; the existing channels). Every channel has the
 * switch: the brake turns off the one whose own numbers went over (agent/tickRules.ts brakeReason, 11/23).
 */
export type ChannelSetting = { enabled: boolean; dailyMax: number | null };
export type ChannelSettings = Record<AgentChannelKey, ChannelSetting>;

export const CHANNEL_DAILY_MAX_DEFAULT = 20;
export const CHANNEL_DAILY_MAX_LIMITS = { min: 0, max: 100 } as const;

export function defaultChannelSettings(): ChannelSettings {
  return Object.fromEntries(AGENT_CHANNELS.map((key) => [
    key, { enabled: true, dailyMax: isFillChannel(key) ? CHANNEL_DAILY_MAX_DEFAULT : null },
  ])) as ChannelSettings;
}

export type ChannelSettingIssue = { channel: AgentChannelKey; message: string };

const asRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};

/**
 * Every channel's settings from what is saved, missing ones at the defaults, numbers clamped. Only the new channels
 * have a daily max (an existing channel's saved max is ignored).
 */
export function normalizeChannelSettings(input: unknown): { settings: ChannelSettings; issues: ChannelSettingIssue[] } {
  const record = asRecord(input);
  const settings = defaultChannelSettings();
  const issues: ChannelSettingIssue[] = [];
  for (const key of AGENT_CHANNELS) {
    const raw = asRecord(record[key]);
    const label = CHANNEL_LABELS[key];
    if (typeof raw.enabled === "boolean") settings[key].enabled = raw.enabled;
    else if (raw.enabled !== undefined && raw.enabled !== null) issues.push({ channel: key, message: `${label}: 켜기/끄기 값이 아니라서 기본값으로 둬요.` });
    if (!isFillChannel(key) || raw.dailyMax === undefined || raw.dailyMax === null || raw.dailyMax === "") continue;
    const value = typeof raw.dailyMax === "number" ? raw.dailyMax : Number(String(raw.dailyMax).trim());
    if (!Number.isFinite(value)) {
      issues.push({ channel: key, message: `${label} 하루 최대: 숫자가 아니라서 기본값으로 둬요 (${CHANNEL_DAILY_MAX_DEFAULT}).` });
      continue;
    }
    const { min, max } = CHANNEL_DAILY_MAX_LIMITS;
    const clamped = Math.min(max, Math.max(min, Math.round(value)));
    if (clamped !== Math.round(value)) issues.push({ channel: key, message: `${label} 하루 최대: ${min}~${max} 사이만 돼요 (${value} → ${clamped}).` });
    settings[key].dailyMax = clamped;
  }
  return { settings, issues };
}

/**
 * How many more a channel may take today: none while it is off, its daily max less `used` (its mails today; for
 * writing ahead, its mails today and the ones written and waiting), no limit (Infinity) without a daily max.
 */
export function channelRoomLeft(setting: ChannelSetting | undefined, used: number): number {
  if (!setting?.enabled) return 0;
  return setting.dailyMax === null ? Number.POSITIVE_INFINITY : Math.max(0, setting.dailyMax - Math.max(0, used));
}

/** The intents the search looks for: job seeking always; career help and events while their post channel is on. */
export function searchedIntents(settings: ChannelSettings): AgentIntent[] {
  return AGENT_INTENTS.filter((intent) =>
    intent === "job" || (intent === "coaching" ? settings.coaching_post.enabled : settings.event_post.enabled));
}
