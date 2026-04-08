type CandidateChronologyItem = {
  created_at?: string | null;
  end_date?: string | null;
  start_date?: string | null;
};

const ONGOING_DATE_MARKERS = new Set(["present", "current", "현재"]);

function toSortableEndDate(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return Number.POSITIVE_INFINITY;
  if (ONGOING_DATE_MARKERS.has(text.toLowerCase())) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function toSortableDate(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareDescending(left: number, right: number) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function sortCandidateItemsByLatest<T extends CandidateChronologyItem>(
  items: readonly T[]
) {
  return [...items].sort((left, right) => {
    const endDateComparison = compareDescending(
      toSortableEndDate(left.end_date),
      toSortableEndDate(right.end_date)
    );
    if (endDateComparison !== 0) return endDateComparison;

    const startDateComparison = compareDescending(
      toSortableDate(left.start_date),
      toSortableDate(right.start_date)
    );
    if (startDateComparison !== 0) return startDateComparison;

    return compareDescending(
      toSortableDate(left.created_at),
      toSortableDate(right.created_at)
    );
  });
}
