/**
 * #5: when the agent's mails go out (Shaun 11/17; defaults chosen with Ops). Pure, so the run and the tests use the
 * same rules.
 * - Only on the chosen Korea-time weekdays and hours (평일 9~21시 by default).
 * - 흘려 보내기: each 5-minute tick sends what is left of today's cap over the ticks left in today's open time, so the
 *   day's mails spread over the window instead of going out at once. With more ticks than mails left, a tick sends
 *   one by chance (mails ÷ ticks), so mails land at different minutes each day and still add up to the cap.
 * - Newest signal first (the post or application the person was found by), and anyone whose 24 hours after the signal
 *   would end before the next chance to send goes now, over the pace.
 */
import { withinSendHours } from "./people";

/** The dispatcher cron runs every 5 minutes (vercel.json /api/internal/gtm-agent/dispatch). */
export const SEND_TICK_MINUTES = 5;
/** A mail within this many hours of the signal counts as "신호 뒤 24시간 안에 보냄". */
export const SIGNAL_FRESH_HOURS = 24;
/** Korea-time weekdays, 0 = Sunday … 6 = Saturday: Monday to Friday by default. */
export const DEFAULT_SEND_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

const TICK_MS = SEND_TICK_MINUTES * 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

export type SendWindow = { startHour: number; endHour: number; weekdays: readonly number[] };

/** Whole weekdays 0-6, each once, in order (Monday-first order is the screen's business). */
export function cleanSendWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_SEND_WEEKDAYS];
  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

/** Korea-time weekday of a moment (0 = Sunday). */
export function kstWeekday(at: Date): number {
  return new Date(at.getTime() + KST_OFFSET_MS).getUTCDay();
}

/** Whether this moment's Korea-time day is one the mails go out on (any hour). */
export function sendDay(at: Date, window: Pick<SendWindow, "weekdays">): boolean {
  return window.weekdays.includes(kstWeekday(at));
}

/** Whether a mail may go out at this moment: a chosen Korea-time weekday, within the hours. */
export function sendWindowOpen(at: Date, window: SendWindow): boolean {
  return sendDay(at, window) && withinSendHours(at, window.startHour, window.endHour);
}

/** The next tick after `now` inside the window (the next chance to send); null when no weekday is chosen. */
export function nextOpenTick(now: Date, window: SendWindow): Date | null {
  for (let at = now.getTime() + TICK_MS, end = now.getTime() + 8 * DAY_MS; at <= end; at += TICK_MS) {
    if (sendWindowOpen(new Date(at), window)) return new Date(at);
  }
  return null;
}

/** The ticks left inside the window today (Korea time, until midnight when the day's cap starts over), this one included. */
export function remainingOpenTicks(now: Date, window: SendWindow): number {
  const midnight = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - KST_OFFSET_MS;
  let ticks = 0;
  for (let at = now.getTime(); at < midnight; at += TICK_MS) if (sendWindowOpen(new Date(at), window)) ticks += 1;
  return ticks;
}

/**
 * How many mails this tick may send: today's cap left ÷ ticks left (rounded up) while there are more mails than ticks;
 * else one with the chance mails ÷ ticks (a skipped tick when ahead of pace), which still adds up to the cap by the
 * end of the window. 0 when the cap is used up or the window is closed.
 */
export function paceForTick(args: { quotaLeft: number; ticksLeft: number; random?: () => number }): number {
  const quota = Math.max(0, Math.floor(args.quotaLeft));
  if (!quota || args.ticksLeft <= 0) return 0;
  if (quota >= args.ticksLeft) return Math.ceil(quota / args.ticksLeft);
  return (args.random ?? Math.random)() < quota / args.ticksLeft ? 1 : 0;
}

/** Hours from the signal to the mail (0 at least); null when either time is unknown. */
export function hoursFromSignal(signalAt: string | null | undefined, sentAt: string | null | undefined): number | null {
  const signal = Date.parse(String(signalAt ?? ""));
  const sent = Date.parse(String(sentAt ?? ""));
  if (!Number.isFinite(signal) || !Number.isFinite(sent)) return null;
  return Math.max(0, (sent - signal) / HOUR_MS);
}

/**
 * 24시간 규칙: the 24 hours after the person's signal are not over yet, but would be before the next chance to send
 * (the next tick inside the window): send now, whatever the pace says.
 */
export function dueBeforeNextChance(signalAt: string | null | undefined, now: Date, nextOpen: Date | null): boolean {
  const signal = Date.parse(String(signalAt ?? ""));
  if (!Number.isFinite(signal)) return false;
  const deadline = signal + SIGNAL_FRESH_HOURS * HOUR_MS;
  return deadline > now.getTime() && (nextOpen === null || deadline <= nextOpen.getTime());
}

type Waiting = { signalAt: string | null; updatedAt: string };

/** Newest signal first, no signal last, then the one waiting longest. */
export function bySignalFirst(a: Waiting, b: Waiting): number {
  const signalA = a.signalAt ? Date.parse(a.signalAt) : Number.NaN;
  const signalB = b.signalAt ? Date.parse(b.signalAt) : Number.NaN;
  const hasA = Number.isFinite(signalA);
  const hasB = Number.isFinite(signalB);
  if (hasA !== hasB) return hasA ? -1 : 1;
  if (hasA && signalA !== signalB) return signalB - signalA;
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
}

/**
 * This tick's mails, in order: everyone due by the 24-hour rule (at most `dueMax`), then the newest signals until the
 * tick's `pace` is used (the due ones count toward it; at most `max` in all unless more are due).
 */
export function planSends<T extends Waiting>(people: readonly T[], args: {
  now: Date; nextOpen: Date | null; pace: number; max: number; dueMax: number;
}): Array<{ person: T; due: boolean }> {
  const ordered = [...people].sort(bySignalFirst);
  const due = ordered.filter((person) => dueBeforeNextChance(person.signalAt, args.now, args.nextOpen)).slice(0, Math.max(0, args.dueMax));
  const taken = new Set<T>(due);
  const paced = Math.max(0, Math.min(args.pace, args.max) - due.length);
  return [
    ...due.map((person) => ({ person, due: true })),
    ...ordered.filter((person) => !taken.has(person)).slice(0, paced).map((person) => ({ person, due: false })),
  ];
}

/** "5시간" / "3일": how long after the signal a mail went out, for the timeline. */
export function signalDelayLabel(hours: number): string {
  return hours < 48 ? `${Math.round(hours)}시간` : `${Math.round(hours / 24)}일`;
}
