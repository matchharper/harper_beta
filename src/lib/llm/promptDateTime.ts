/** Model evidence only. Storage, cursors, revisions and authored prose stay exact. */
export const PROMPT_TIME_ZONE = 'Asia/Seoul';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROMPT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const instant = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Minute precision, never host-local time; date-only/previous projections retain precision. */
export function formatLlmDateTime(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(text)) return text;
  if (!(value instanceof Date) && !instant.test(text)) return '-';
  const date = value instanceof Date ? value : new Date(text);
  if (!Number.isFinite(date.getTime())) return '-';
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

const DAY_MS = 86_400_000;

/**
 * How long before `now` a dated event happened, beside its absolute date, so the
 * model does not have to work out the year itself. Months up to two years, so an
 * event 23 months back is never rounded to "1 year ago". Future dates get nothing.
 */
export function formatLlmElapsed(value: unknown, now: Date = new Date()): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const date = value instanceof Date ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00+09:00`)
    : instant.test(text) ? new Date(text) : null;
  if (!date || !Number.isFinite(date.getTime())) return '';
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (days < 0) return '';
  if (days === 0) return 'today';
  if (days < 14) return days === 1 ? '1 day ago' : `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.min(23, Math.max(2, Math.round(days / 30.44)))} months ago`;
  const years = Math.floor(days / 365.25);
  return `${years} years ago`;
}

/** A year-only fact (a founding year) against the calendar year of `now`, as people say it: this year, last year, N years ago. */
export function formatLlmYearsAgo(year: unknown, now: Date = new Date()): string {
  const value = typeof year === 'number' || (typeof year === 'string' && /^\d{4}$/.test(year.trim())) ? Number(year) : NaN;
  const current = Number(formatLlmDateTime(now).slice(0, 4));
  if (!Number.isInteger(value) || value < 1000 || !Number.isInteger(current) || value > current) return '';
  const years = current - value;
  return years === 0 ? 'this year' : years === 1 ? 'last year' : `${years} years ago`;
}

/** Profile dates can have only year/month precision; never invent a day. */
export function formatLlmPartialDate(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}(?:-\d{2})?$/.test(value.trim())) return value.trim();
  return formatLlmDateTime(value);
}

/** Only structured timestamp metadata; never search/replace timestamps inside source text. */
export function projectLlmDateTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectLlmDateTimes);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/^(?:expected|cursor|revision|version)/i.test(key) || /(?:Cursor|Revision|Version|Id|Url)$/.test(key)) return [key, item];
    const timestampField = /(?:At|Date|Time|Since|Until|Cutoff)$/.test(key)
      || /(?:^|_)(?:at|date|time|since|until|cutoff)$/.test(key)
      || ['asOf', 'windowStart', 'windowEnd'].includes(key);
    return [key, timestampField && (item instanceof Date || (typeof item === 'string' && instant.test(item.trim())))
      ? formatLlmDateTime(item) : projectLlmDateTimes(item)];
  }));
}

export function stringifyLlmDateTimes(value: unknown): string {
  return JSON.stringify(projectLlmDateTimes(value));
}
