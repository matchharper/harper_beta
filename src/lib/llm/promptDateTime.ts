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
