type Experience = {
  companyName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

function monthIndex(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? Number(match[1]) * 12 + month - 1 : null;
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
  const intervals = experiences.map((item) => ({
    start: monthIndex(item.startDate),
    end: item.endDate ? monthIndex(item.endDate) : current,
    company: item.companyName?.trim(),
  }));
  // Missing dates cannot safely establish either total duration or the latest move.
  if (
    !intervals.length ||
    intervals.some(
      (i) =>
        i.start === null ||
        i.end === null ||
        i.start > current ||
        i.end < i.start
    )
  ) {
    return { experienceMonths: null, lastMoveMonths: null };
  }
  const sorted = intervals
    .map((i) => ({ ...i, start: i.start!, end: Math.min(i.end!, current) }))
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let end = sorted[0].start;
  for (const item of sorted) {
    total += Math.max(0, item.end - Math.max(end, item.start));
    end = Math.max(end, item.end);
  }
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
  return { experienceMonths: total, lastMoveMonths: current - joined };
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
      ? `${years}년 ${remainder}개월`
      : `${years} yr, ${remainder} mo`;
  return ago ? `${value}${locale === "ko" ? " 전" : " ago"}` : value;
}
