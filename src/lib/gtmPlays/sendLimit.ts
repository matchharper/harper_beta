/**
 * GTM plays daily send limit: one sender sends at most N GTM mails (all campaigns, #2/#3/#4) per day in Korea
 * time; mails to the team's own matchharper.com addresses are tests and are not counted. Pure math here; the
 * sender counts rows (mailSend.server.ts) and the Ops screen shows "오늘 12/50통".
 */

export const GTM_DAILY_SEND_LIMIT_DEFAULT = 50;

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** GTM_DAILY_SEND_LIMIT when it is a whole number from 0 up, else 50. */
export function gtmDailySendLimit(env: Record<string, string | undefined> = process.env) {
  const raw = env.GTM_DAILY_SEND_LIMIT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return GTM_DAILY_SEND_LIMIT_DEFAULT;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : GTM_DAILY_SEND_LIMIT_DEFAULT;
}

/** Today in Korea (no daylight saving): [00:00 KST, next 00:00 KST) as UTC ISO strings. */
export function kstDayWindow(now: Date = new Date()) {
  const start = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

export type GtmSendQuota = {
  /** Counted mails (sending or sent, not to matchharper.com) the sender made today, Korea time. */
  sentToday: number;
  limit: number;
  /** What can still go today (0 when the limit is used up). */
  left: number;
};

export function gtmSendQuota(sentToday: number, limit: number): GtmSendQuota {
  const sent = Math.max(0, Math.floor(sentToday));
  return { sentToday: sent, limit, left: Math.max(0, limit - sent) };
}

/** The sender has used up today's mails. */
export function gtmSendLimitReached(sentToday: number, limit: number) {
  return sentToday >= limit;
}

/** The message on a mail refused by the limit (also the row's error). */
export function gtmSendLimitMessage(limit: number) {
  return `오늘 보낼 수 있는 메일 수(${limit}통)를 다 썼어요`;
}

/**
 * Before sending a batch: how many of the counted mails would go and how many would be refused today.
 * `counted` excludes matchharper.com addresses (they always go).
 */
export function gtmBatchOverLimit(quota: Pick<GtmSendQuota, "left">, counted: number) {
  const willSend = Math.min(counted, quota.left);
  return { willSend, refused: Math.max(0, counted - willSend) };
}
