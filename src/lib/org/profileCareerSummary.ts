type Experience = {
  companyName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type MonthRange = { min: number; max: number };

// Keep the allowed months until neighbouring employment dates have been read.
// Estimates are display-only; source dates are never rewritten.
function monthRange(value: string | null | undefined): MonthRange | null {
  const match = value?.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!match[2]) return { min: year * 12, max: year * 12 + 11 };
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  if (match[3]) {
    const day = Number(match[3]);
    if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
      return null;
  }
  const index = year * 12 + month - 1;
  return { min: index, max: index };
}

function unionMonths(intervals: { start: number; end: number }[]) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let end = -Infinity;
  for (const item of sorted) {
    total += Math.max(0, item.end - Math.max(end, item.start));
    end = Math.max(end, item.end);
  }
  return total;
}

type CareerInterval = {
  start: MonthRange;
  end: MonthRange;
  startKnown: boolean;
  endKnown: boolean;
  company?: string;
};

function estimateInterval(item: CareerInterval, history: CareerInterval[]) {
  const midpoint = (range: MonthRange) =>
    Math.round((range.min + range.max) / 2);
  const contains = (range: MonthRange, month: number) =>
    month >= range.min && month <= range.max;
  const exact = (range: MonthRange) => range.min === range.max;
  // Use only original, precise boundaries as anchors, so input order and
  // duplicate roles cannot cause estimated dates to propagate through history.
  // Compare against the unknown boundary's midpoint to distinguish likely
  // predecessors from successors when several roles share the same year.
  const previous = history
    .filter(
      (other) =>
        other !== item &&
        other.endKnown &&
        contains(item.start, other.end.min) &&
        other.start.max < midpoint(item.start) &&
        other.end.max <= item.end.max
    )
    .sort(
      (a, b) =>
        Number(Boolean(item.company && b.company === item.company)) -
          Number(Boolean(item.company && a.company === item.company)) ||
        b.end.min - a.end.min
    )[0];
  const next = history
    .filter(
      (other) =>
        other !== item &&
        other.startKnown &&
        contains(item.end, other.start.min) &&
        other.end.min > midpoint(item.end) &&
        other.start.min >= item.start.min
    )
    .sort(
      (a, b) =>
        Number(Boolean(item.company && b.company === item.company)) -
          Number(Boolean(item.company && a.company === item.company)) ||
        a.start.min - b.start.min
    )[0];

  const sameYear =
    Math.floor(item.start.min / 12) === Math.floor(item.end.max / 12);
  // Without anchors, use the middle of the available period. For two unknown
  // endpoints within one year, use its middle half (normally April–October),
  // rather than making the role zero months or a full year.
  const bothUnknown = !exact(item.start) && !exact(item.end);
  const width = item.end.max - item.start.min;
  const fallbackStart =
    sameYear && bothUnknown
      ? Math.min(item.start.max, item.start.min + Math.floor((width + 1) / 4))
      : midpoint(item.start);
  const fallbackEnd =
    sameYear && bothUnknown
      ? Math.min(
          item.end.max,
          item.start.min + Math.floor(((width + 1) * 3) / 4)
        )
      : midpoint(item.end);
  let start = exact(item.start)
    ? item.start.min
    : (previous?.end.min ?? fallbackStart);
  let end = exact(item.end) ? item.end.min : (next?.start.min ?? fallbackEnd);
  if (start > end) {
    // Conflicting neighbours may be concurrent work, not a career sequence.
    if (previous && next) {
      start = fallbackStart;
      end = fallbackEnd;
    } else if (previous && !exact(item.end)) {
      end = midpoint({ min: start, max: item.end.max });
    } else if (next && !exact(item.start)) {
      start = midpoint({ min: item.start.min, max: end });
    }
  }
  return { start, end, company: item.company };
}

export function getProfileCareerSummary(
  experiences: Experience[],
  now = new Date()
) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const current =
    Number(parts.find((p) => p.type === "year")?.value) * 12 +
    Number(parts.find((p) => p.type === "month")?.value) -
    1;
  const intervals = experiences.map((item) => {
    const start = monthRange(item.startDate);
    const end = item.endDate?.trim()
      ? monthRange(item.endDate)
      : { min: current, max: current };
    if (!start || !end || start.min > current || end.max < start.min)
      return null;
    const endMax = Math.min(end.max, current);
    return {
      start: { min: start.min, max: Math.min(start.max, endMax) },
      end: {
        min: Math.max(start.min, Math.min(end.min, current)),
        max: endMax,
      },
      startKnown: start.min === start.max,
      endKnown:
        Boolean(item.endDate?.trim()) &&
        end.min === end.max &&
        end.max <= current,
      company: item.companyName?.trim(),
    };
  });
  const known = intervals.filter((item) => item !== null);
  const estimated = known.map((item) => estimateInterval(item, known));
  const experienceMonths = known.length ? unionMonths(estimated) : null;

  // Total experience can remain useful even when the latest move cannot be
  // dated. Do not infer a move or same-company continuity from a year alone.
  const precise =
    known.length === experiences.length &&
    known.every((i) => i.start.min === i.start.max && i.end.min === i.end.max);
  const experienceEstimated = known.length > 0 && !precise;
  if (!known.length || !precise)
    return { experienceMonths, experienceEstimated, lastMoveMonths: null };
  const sorted = known
    .map((i) => ({ ...i, start: i.start.min, end: i.end.min }))
    .sort((a, b) => a.start - b.start);
  const latest = sorted[sorted.length - 1];
  let joined = latest.start;
  // Consecutive roles at the same named company share one joining date.
  if (latest.company) {
    for (let index = sorted.length - 2; index >= 0; index--) {
      const item = sorted[index];
      if (item.company === latest.company && item.end >= joined)
        joined = item.start;
    }
  }
  return {
    experienceMonths,
    experienceEstimated,
    lastMoveMonths: current - joined,
  };
}

export function formatProfileExperience(
  {
    experienceMonths,
    experienceEstimated,
  }: ReturnType<typeof getProfileCareerSummary>,
  locale: "ko" | "en"
) {
  const value = formatProfileDuration(experienceMonths, locale);
  return experienceMonths !== null && experienceEstimated
    ? `${locale === "ko" ? "약" : "Approx."} ${value}`
    : value;
}

export function formatProfileDuration(
  months: number | null,
  locale: "ko" | "en",
  ago = false
) {
  if (months === null) return "—";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const value =
    locale === "ko"
      ? `${years > 0 ? `${years}년 ` : ""}${remainder}개월`
      : `${years > 0 ? `${years} yr, ` : ""}${remainder} mo`;
  return ago ? `${value}${locale === "ko" ? " 전" : " ago"}` : value;
}
