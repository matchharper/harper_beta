import type { OfficialJobListItem } from "@/lib/officialJobs";

export const OFFICIAL_JOBS_PAGE_SIZE = 21;

export type OfficialJobsPage = {
  jobs: OfficialJobListItem[];
  nextOffset: number | null;
};

// Look ahead by one visible row. Advance through source rows, including hidden
// roles, so visibility filtering cannot truncate or repeat a page.
export async function readVisibleOfficialJobsPage<T extends { id: string }>(
  offset: number,
  readBatch: (offset: number, size: number) => Promise<T[]>,
  filterVisible: (rows: T[]) => Promise<T[]>
): Promise<{ rows: T[]; nextOffset: number | null }> {
  const size = OFFICIAL_JOBS_PAGE_SIZE + 1;
  const found: { row: T; nextOffset: number }[] = [];
  let cursor = offset;
  while (found.length < size) {
    const batch = await readBatch(cursor, size);
    const visible = new Map(
      (await filterVisible(batch)).map((row) => [row.id, row])
    );
    for (const [index, row] of batch.entries()) {
      const publicRow = visible.get(row.id);
      if (publicRow)
        found.push({ row: publicRow, nextOffset: cursor + index + 1 });
      if (found.length === size) break;
    }
    if (batch.length < size) break;
    cursor += batch.length;
  }
  return {
    rows: found.slice(0, OFFICIAL_JOBS_PAGE_SIZE).map(({ row }) => row),
    nextOffset:
      found.length > OFFICIAL_JOBS_PAGE_SIZE
        ? found[OFFICIAL_JOBS_PAGE_SIZE - 1].nextOffset
        : null,
  };
}
