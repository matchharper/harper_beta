/**
 * Gmail's spam rate for our sending domain, from Google Postmaster Tools (API v2, domainStats.query, metric
 * SPAM_RATE). Shown on /ops next to the recorded spam reports (Shaun 11/22): Gmail never reports a complaint one by
 * one, so the recorded count misses Gmail recipients (81% of ours), and this daily rate is the only Gmail number.
 *
 * Google gives a day only when enough mail went to Gmail that day ("up to the order of hundreds"), usually a day or
 * two late; a missing day is "no number", never 0%. The rate covers every mail signed for the domain (Harper's own
 * service mail too), not only the agent's. Pure here; the call is postmaster.server.ts.
 */

export const POSTMASTER_SCOPE = "https://www.googleapis.com/auth/postmaster.traffic.readonly";
export const POSTMASTER_API = "https://gmailpostmastertools.googleapis.com/v2";
/** Days asked for, ending yesterday (UTC). */
export const POSTMASTER_DAYS = 14;
/** Google's sender guideline: keep it under 0.1%, never reach 0.3%. At or over this it shows in red. */
export const SPAM_RATE_ALERT = 0.001;

export type GmailSpamDay = { day: string; rate: number };

export type GmailSpam =
  /** Numbers came: the days Google gave, oldest first (none: connected, but no day had enough Gmail mail). */
  | { status: "ok"; domain: string; days: GmailSpamDay[] }
  /** A setup step is missing (which one is in `reason`). */
  | { status: "setup"; domain: string; reason: string }
  /** Set up, but this read failed (timeout, Google error). */
  | { status: "error"; domain: string; reason: string };

type GoogleDate = { year: number; month: number; day: number };

const googleDate = (at: Date): GoogleDate => ({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() });

/** The domainStats:query body: SPAM_RATE per day over the last POSTMASTER_DAYS days, ending yesterday (UTC). */
export function spamRateQuery(now: Date) {
  const end = new Date(now.getTime() - 86_400_000);
  const start = new Date(end.getTime() - (POSTMASTER_DAYS - 1) * 86_400_000);
  return {
    metricDefinitions: [{ name: "spam", baseMetric: { standardMetric: "SPAM_RATE" } }],
    timeQuery: { dateRanges: { dateRanges: [{ start: googleDate(start), end: googleDate(end) }] } },
    aggregationGranularity: "DAILY",
    pageSize: 200,
  };
}

type StatValue = { doubleValue?: number | string; floatValue?: number | string; intValue?: number | string };
type DomainStat = { metric?: string; date?: Partial<GoogleDate>; value?: StatValue };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The days in a domainStats:query response, oldest first. The rate is a ratio (0.001 = 0.1%), as Postmaster's v1
 * API gave it; a day with no number is left out.
 */
export function parseSpamRates(response: unknown): GmailSpamDay[] {
  const stats = ((response as { domainStats?: DomainStat[] } | null)?.domainStats ?? []);
  const days = new Map<string, number>();
  for (const stat of stats) {
    if (stat.metric && stat.metric !== "spam") continue;
    const { year, month, day } = stat.date ?? {};
    const raw = stat.value?.doubleValue ?? stat.value?.floatValue ?? stat.value?.intValue;
    const rate = Number(raw);
    if (!year || !month || !day || raw === undefined || raw === null || raw === "" || !Number.isFinite(rate)) continue;
    days.set(`${year}-${pad(month)}-${pad(day)}`, rate);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rate]) => ({ day, rate }));
}

/** Google's error in words: which setup step is missing, or null when it is not a setup problem. */
export function setupStepMissing(status: number, body: unknown): string | null {
  const error = (body as { error?: { status?: string; message?: string; details?: Array<{ reason?: string }> } } | null)?.error;
  const message = error?.message ?? "";
  const reasons = (error?.details ?? []).map((detail) => detail.reason ?? "");
  if (reasons.includes("SERVICE_DISABLED") || /has not been used in project|is disabled/i.test(message)) {
    return "Google Cloud에서 Gmail Postmaster Tools API를 켜야 해요";
  }
  if (status === 404 || error?.status === "NOT_FOUND") return "Postmaster Tools에 도메인이 아직 등록되지 않았어요";
  if (status === 403 || error?.status === "PERMISSION_DENIED") {
    return "Postmaster Tools에서 도메인 확인(DNS)이 끝나지 않았거나, 이 계정에 도메인 권한이 없어요";
  }
  if (status === 401) return "Google 로그인이 거절됐어요";
  return null;
}

/** A token request refused because the admin console does not allow the scope for the service account. */
export function isScopeNotAllowed(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify((error as { response?: { data?: unknown } }).response?.data ?? "")}` : String(error);
  return /unauthorized_client|not authorized for any of the scopes/i.test(text);
}

export const SCOPE_NOT_ALLOWED =
  "Workspace 관리 콘솔의 도메인 전체 위임에 Postmaster 범위가 없어요";

/** The rate as /ops writes it: 0.0123% → "0.01%". */
export const spamPercent = (rate: number) => `${(rate * 100).toFixed(2)}%`;

const monthDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

/** What the 스팸 cell says under the recorded counts, its hover text, and whether it is over Google's line. */
export function gmailSpamLine(spam: GmailSpam | null | undefined): { text: string; title: string; alert: boolean } | null {
  if (!spam) return null;
  if (spam.status === "setup") return { text: "Gmail 스팸 연결 전", title: spam.reason, alert: false };
  if (spam.status === "error") return { text: "Gmail 스팸 못 읽음", title: spam.reason, alert: false };
  const latest = spam.days.at(-1);
  if (!latest) {
    return {
      text: "Gmail 스팸 숫자 없음",
      title: `Postmaster Tools에 연결됐지만 최근 ${POSTMASTER_DAYS}일 Google이 준 숫자가 없어요. Gmail로 간 메일이 적은 날은 숫자가 나오지 않아요 (0%라는 뜻은 아니에요).`,
      alert: false,
    };
  }
  return {
    text: `Gmail 스팸 ${spamPercent(latest.rate)} · ${monthDay(latest.day)}`,
    title: spam.days.slice(-7).map((item) => `${monthDay(item.day)} ${spamPercent(item.rate)}`).join(" · "),
    alert: latest.rate >= SPAM_RATE_ALERT,
  };
}
