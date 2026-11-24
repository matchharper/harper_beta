/**
 * Gmail's spam rate for our sending domain, from Google Postmaster Tools (API v2, domainStats.query, metric
 * SPAM_RATE). Shown on /ops next to the recorded spam reports (Shaun 11/22): Gmail never reports a complaint one by
 * one, so the recorded count misses Gmail recipients (81% of ours), and this daily rate is the only Gmail number.
 *
 * Google gives a day only when enough mail went to Gmail that day ("up to the order of hundreds"), usually a day or
 * two late; a missing day is "no number", never 0%. The rate covers every mail signed for the domain (Harper's own
 * service mail too), not only the agent's. Pure here; the call is postmaster.server.ts.
 *
 * /ops 수치 · 후보 (Shaun 11/23 13:02): the 합계 row shows the panel's period as one rate, Google's own over the whole
 * range (OVERALL: it weighs each day by its mail; an average of daily rates would not), and each 날짜 row that day's
 * rate. Gmail judges each day apart (over 0.3% a day loses mitigation, 7 days in a row under it to regain it, Google's
 * sender FAQ), so the 합계 line turns red when any one day reached 0.1%, whatever the period's rate.
 */

export const POSTMASTER_SCOPE = "https://www.googleapis.com/auth/postmaster.traffic.readonly";
export const POSTMASTER_API = "https://gmailpostmastertools.googleapis.com/v2";
/** Days asked for when no period is given, ending yesterday (UTC). */
export const POSTMASTER_DAYS = 14;
/** Pages of 200 days read at most (a period is at most 365 days). */
export const POSTMASTER_MAX_PAGES = 2;
/** Google's sender guideline: keep it under 0.1%, never reach 0.3%. At or over this it shows in red. */
export const SPAM_RATE_ALERT = 0.001;

export type GmailSpamDay = { day: string; rate: number };

/** The days asked for, YYYY-MM-DD both included, and how /ops names them ("최근 30일"). */
export type GmailSpamPeriod = { from: string; to: string; label: string };

export type GmailSpam =
  /**
   * Numbers came: the days Google gave, oldest first (none: connected, but no day had enough Gmail mail). With a
   * period, `period.rate` is Google's rate over the whole range (null: Google gave none, or that read failed).
   */
  | { status: "ok"; domain: string; days: GmailSpamDay[]; period?: GmailSpamPeriod & { rate: number | null } }
  /** A setup step is missing (which one is in `reason`). */
  | { status: "setup"; domain: string; reason: string }
  /** Set up, but this read failed (timeout, Google error). */
  | { status: "error"; domain: string; reason: string };

type GoogleDate = { year: number; month: number; day: number };

const googleDate = (at: Date): GoogleDate => ({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() });
const DAY_MS = 86_400_000;
const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);
const yesterdayOf = (now: Date) => dayStart(new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10));

/**
 * The days to ask Google for: the period's, its end kept at yesterday (UTC; Google has no number for today), or the
 * last POSTMASTER_DAYS days ending yesterday. Null when nothing is left (a period of today only).
 */
export function spamRateRange(now: Date, period?: Pick<GmailSpamPeriod, "from" | "to"> | null): { start: Date; end: Date } | null {
  const yesterday = yesterdayOf(now);
  if (!period) return { start: new Date(yesterday.getTime() - (POSTMASTER_DAYS - 1) * DAY_MS), end: yesterday };
  const end = dayStart(period.to) < yesterday ? dayStart(period.to) : yesterday;
  const start = dayStart(period.from);
  return start <= end ? { start, end } : null;
}

/**
 * The domainStats:query body: SPAM_RATE over `range` (spamRateRange), per day (DAILY) or as one rate for the whole
 * range (OVERALL). `pageToken` continues a DAILY read longer than one page.
 */
export function spamRateQuery(range: { start: Date; end: Date }, opts: { granularity?: "DAILY" | "OVERALL"; pageToken?: string | null } = {}) {
  return {
    metricDefinitions: [{ name: "spam", baseMetric: { standardMetric: "SPAM_RATE" } }],
    timeQuery: { dateRanges: { dateRanges: [{ start: googleDate(range.start), end: googleDate(range.end) }] } },
    aggregationGranularity: opts.granularity ?? "DAILY",
    pageSize: 200,
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
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

/** The one rate of an OVERALL response (null: Google gave none). */
export function parseOverallSpamRate(response: unknown): number | null {
  const stats = ((response as { domainStats?: DomainStat[] } | null)?.domainStats ?? []);
  for (const stat of stats) {
    if (stat.metric && stat.metric !== "spam") continue;
    const raw = stat.value?.doubleValue ?? stat.value?.floatValue ?? stat.value?.intValue;
    const rate = Number(raw);
    if (raw === undefined || raw === null || raw === "" || !Number.isFinite(rate)) continue;
    return rate;
  }
  return null;
}

/** The next page of a DAILY response (null: none). */
export function nextPageToken(response: unknown): string | null {
  const token = (response as { nextPageToken?: unknown } | null)?.nextPageToken;
  return typeof token === "string" && token ? token : null;
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

/** One domainStats:query call (postmaster.server.ts sends it with the Workspace user's token). */
export type SpamPost = (body: unknown) => Promise<{ ok: true; body: unknown } | { ok: false; status: number; body: unknown }>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown error"));

/**
 * The reads for one domain: the days (DAILY, up to POSTMASTER_MAX_PAGES pages) and, with a period, Google's rate over
 * the whole period (OVERALL) side by side. Never throws; a failed OVERALL read leaves the period's rate empty.
 */
export async function readSpam(post: SpamPost, domain: string, period: GmailSpamPeriod | null, now: Date): Promise<GmailSpam> {
  const range = spamRateRange(now, period);
  if (!range) return { status: "ok", domain, days: [], ...(period ? { period: { ...period, rate: null } } : {}) };
  const overall = period
    ? post(spamRateQuery(range, { granularity: "OVERALL" }))
      .then((result) => (result.ok ? parseOverallSpamRate(result.body) : null))
      .catch((error) => {
        console.warn("[gtm-agent] postmaster overall read failed", errorText(error).slice(0, 300));
        return null;
      })
    : null;
  try {
    const days: GmailSpamDay[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < POSTMASTER_MAX_PAGES; page += 1) {
      const result = await post(spamRateQuery(range, { pageToken }));
      if (!result.ok) {
        const step = setupStepMissing(result.status, result.body);
        if (step) return { status: "setup", domain, reason: step };
        return { status: "error", domain, reason: `Postmaster ${result.status}: ${JSON.stringify(result.body).slice(0, 300)}` };
      }
      days.push(...parseSpamRates(result.body));
      pageToken = nextPageToken(result.body);
      if (!pageToken) break;
    }
    const unique = [...new Map(days.map((item) => [item.day, item])).values()].sort((a, b) => a.day.localeCompare(b.day));
    return { status: "ok", domain, days: unique, ...(period ? { period: { ...period, rate: await overall } } : {}) };
  } catch (error) {
    console.warn("[gtm-agent] postmaster read failed", errorText(error).slice(0, 300));
    return { status: "error", domain, reason: errorText(error).slice(0, 300) };
  }
}

type SpamLine = { text: string; title: string; alert: boolean };

const WHAT = "Gmail 받은편지함에 들어간 우리 도메인 메일 중 스팸 신고 비율이에요. 보낸 날 기준이고 하퍼 서비스 메일도 포함돼요.";

/**
 * The 합계 row's line under the recorded counts, its hover text, and whether it is red: the period's rate (red when
 * the period or any one day in it reached 0.1%); without a period rate, the newest day as before.
 */
export function gmailSpamLine(spam: GmailSpam | null | undefined): SpamLine | null {
  if (!spam) return null;
  if (spam.status === "setup") return { text: "Gmail 스팸 연결 전", title: spam.reason, alert: false };
  if (spam.status === "error") return { text: "Gmail 스팸 못 읽음", title: spam.reason, alert: false };
  const latest = spam.days.at(-1);
  const period = spam.period;
  if (!latest && period?.rate == null) {
    return {
      text: "Gmail 스팸 숫자 없음",
      title: `Postmaster Tools에 연결됐지만 ${period?.label ?? `최근 ${POSTMASTER_DAYS}일`} Google이 준 숫자가 없어요. Gmail로 간 메일이 적은 날은 숫자가 나오지 않아요 (0%라는 뜻은 아니에요).`,
      alert: false,
    };
  }
  const lastWeek = spam.days.length ? ` 최근 7일: ${spam.days.slice(-7).map((item) => `${monthDay(item.day)} ${spamPercent(item.rate)}`).join(" · ")}` : "";
  const worst = spam.days.reduce<GmailSpamDay | null>((top, item) => (!top || item.rate > top.rate ? item : top), null);
  const dayOver = Boolean(worst && worst.rate >= SPAM_RATE_ALERT);
  if (period && period.rate != null) {
    return {
      text: `Gmail 스팸 ${spamPercent(period.rate)} · ${period.label}`,
      title: `${period.label}을 합친 값이에요. Gmail은 하루씩 따로 판단해서, 하루라도 0.1%를 넘으면 빨간색이 돼요. ` +
        `${worst ? `가장 높았던 날: ${monthDay(worst.day)} ${spamPercent(worst.rate)}. ` : ""}${WHAT}${lastWeek}`,
      alert: dayOver || period.rate >= SPAM_RATE_ALERT,
    };
  }
  // No rate for the whole period (Google gave none, or that read failed): the newest day, still red when any day of
  // the period reached 0.1%, and then the tooltip names that day.
  const day = latest!;
  const worstNote = dayOver && worst && worst.day !== day.day
    ? ` 기간 중 가장 높았던 날: ${monthDay(worst.day)} ${spamPercent(worst.rate)} (0.1%를 넘어서 빨간색이에요).` : "";
  return {
    text: `Gmail 스팸 ${spamPercent(day.rate)} · ${monthDay(day.day)}`,
    title: `${monthDay(day.day)} 하루 값이에요 (누적 아님).${worstNote} ${WHAT}${lastWeek}`,
    alert: dayOver,
  };
}

/**
 * A folded row of quiet days (no run, no one found): the days in it whose rate reached 0.1%, or null. Gmail's rate
 * counts Harper's own service mail too, so such a day can turn 합계 red with no agent activity; this names it there.
 */
export function gmailSpamQuietLine(spam: GmailSpam | null | undefined, oldest: string, newest: string): SpamLine | null {
  if (spam?.status !== "ok") return null;
  const over = spam.days.filter((item) => item.day >= oldest && item.day <= newest && item.rate >= SPAM_RATE_ALERT);
  if (!over.length) return null;
  const days = over.map((item) => `${monthDay(item.day)} ${spamPercent(item.rate)}`).join(" · ");
  return { text: `Gmail 스팸 0.1% 넘은 날: ${days}`, title: `이 기간의 하루 값이에요. ${WHAT}`, alert: true };
}

/**
 * A 날짜 row's line: that day's rate, or null when Google gave none for it (a missing day is not 0%, so nothing is
 * shown). The row's other numbers count the people found that day; this one the mail sent that day.
 */
export function gmailSpamDayLine(spam: GmailSpam | null | undefined, day: string): SpamLine | null {
  if (spam?.status !== "ok") return null;
  const found = spam.days.find((item) => item.day === day);
  if (!found) return null;
  return {
    text: `Gmail 스팸 ${spamPercent(found.rate)}`,
    title: `${monthDay(day)} 하루 값이에요. ${WHAT} 이 줄의 다른 숫자는 이날 찾은 사람 기준이라, 세는 메일이 달라요.`,
    alert: found.rate >= SPAM_RATE_ALERT,
  };
}
