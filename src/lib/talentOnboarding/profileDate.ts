/** Calendar dates for Postgres DATE columns. Partial periods use the same
 * start/end boundaries as profile ingestion; timestamps retain their written day. */
export function normalizeProfileDate(
  value: unknown,
  boundary: "start" | "end" = "start"
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new TypeError("Profile date must be a string.");
  const raw = value.normalize("NFKC").trim();
  if (!raw) return null;
  if (/^(present|current|currently|ongoing|now|to date|현재|현재까지|재직\s*중?|재학\s*중?|至今)$/i.test(raw)) {
    return null;
  }
  const text = raw.toLowerCase()
    .replace(/[‐‑–—−]/g, "-")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ").trim();
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  const parts = text.match(/^(\d{4})(?:\s*[-/.年년\s]\s*(\d{1,2})(?:\s*[-/.月월\s]\s*(\d{1,2}))?)?\s*[年년月월日일.]?$/);
  const timestamp = text.match(/^(\d{4})-(\d{2})-(\d{2})[t ]\d{2}:\d{2}/);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})?$/);
  const numeric = parts ?? timestamp ?? compact;
  if (numeric) {
    year = Number(numeric[1]);
    month = numeric[2] ? Number(numeric[2]) : undefined;
    day = numeric[3] ? Number(numeric[3]) : undefined;
  } else {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const tokens = text.replace(/[./-]/g, " ").split(/\s+/).filter(Boolean);
    const monthIndex = tokens.findIndex((token) => months.some((name) =>
      token === name || token === name.slice(0, 3) || (name === "september" && token === "sept")
    ));
    if (monthIndex >= 0 && (tokens.length === 2 || tokens.length === 3)) {
      const monthName = tokens[monthIndex];
      month = months.findIndex((name) => name === monthName || name.slice(0, 3) === monthName || (name === "september" && monthName === "sept")) + 1;
      const numbers = tokens.filter((_, index) => index !== monthIndex);
      const yearIndex = numbers.findIndex((token) => /^\d{4}$/.test(token));
      if (yearIndex >= 0 && numbers.every((token) => /^\d+$/.test(token))) {
        year = Number(numbers[yearIndex]);
        day = numbers.length === 2 ? Number(numbers[1 - yearIndex]) : undefined;
      }
    } else {
      const monthYear = text.match(/^(\d{1,2})\s*[/\.월-]\s*(\d{4})$/);
      const localDate = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (monthYear) {
        year = Number(monthYear[2]); month = Number(monthYear[1]);
      } else if (localDate) {
        const first = Number(localDate[1]), second = Number(localDate[2]);
        year = Number(localDate[3]);
        // Only resolve numeric day/month ordering when it is unambiguous.
        if (first > 12 || first === second) { day = first; month = second; }
        else if (second > 12) { day = second; month = first; }
        else year = undefined;
      }
    }
  }
  if (year === undefined || year < 1 || year > 9999) {
    throw new Error(`Cannot determine a calendar date from "${raw}". Use a year, year-month, or YYYY-MM-DD.`);
  }
  month ??= boundary === "start" ? 1 : 12;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  day ??= boundary === "start" ? 1 : days[month - 1];
  if (month < 1 || month > 12 || !day || day < 1 || day > days[month - 1]) {
    throw new Error(`Invalid calendar date: "${raw}".`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
