/**
 * The day in Korea time that GTM mail counts use (the #5 agent's daily mail cap reads it). Pure math here.
 */

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** Today in Korea (no daylight saving): [00:00 KST, next 00:00 KST) as UTC ISO strings. */
export function kstDayWindow(now: Date = new Date()) {
  const start = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}
