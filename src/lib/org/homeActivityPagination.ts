import {
  orgHomeActivityGroups,
  orgHomeActivityTitle,
  type OrgHomeActivity,
  type OrgHomeActivityFilter,
} from "./homeActivity";

export type ActivityPosition = { createdAt: string; id: string };
export type ActivityEvent = Omit<
  OrgHomeActivity,
  "talentName" | "roleName" | "recommendationId"
>;
export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_SCAN_SIZE = 100;

/** Preserve Postgres microseconds, normalize offsets before sorting/cursor comparisons. */
export function activityTimestamp(value: string) {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
}

export function compareActivity(a: ActivityPosition, b: ActivityPosition) {
  const left = activityTimestamp(a.createdAt);
  const right = activityTimestamp(b.createdAt);
  return left === right
    ? a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0
    : left > right
      ? -1
      : 1;
}

export function matchesActivity(
  item: OrgHomeActivity,
  search: string,
  kind: OrgHomeActivityFilter,
  locale: "ko" | "en"
) {
  return (
    (kind === "all" || orgHomeActivityGroups[item.kind] === kind) &&
    (!search ||
      [
        item.talentName,
        item.roleName,
        item.text,
        orgHomeActivityTitle(item, locale),
      ]
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)))
  );
}

/** Filtering and permission projection happen before emitting a page. Bounded scans
 * may return an empty continuation page; they never claim the whole search is empty. */
export async function readActivityPage(args: {
  after: ActivityPosition | null;
  load: (
    after: ActivityPosition | null
  ) => Promise<{ events: ActivityEvent[]; hasMore: boolean }>;
  project: (events: ActivityEvent[]) => Promise<Map<string, OrgHomeActivity>>;
  search: string;
  kind: OrgHomeActivityFilter;
  locale: "ko" | "en";
  pageSize?: number;
  maxBatches?: number;
}) {
  const items: OrgHomeActivity[] = [];
  let after = args.after;
  for (let batch = 0; batch < (args.maxBatches ?? 5); batch++) {
    const { events, hasMore } = await args.load(after);
    if (!events.length) return { items, after: null };
    const projected = await args.project(events);
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      after = { createdAt: event.createdAt, id: event.id };
      const item = projected.get(event.id);
      if (item && matchesActivity(item, args.search, args.kind, args.locale))
        items.push(item);
      if (items.length === (args.pageSize ?? ACTIVITY_PAGE_SIZE)) {
        return {
          items,
          after: index < events.length - 1 || hasMore ? after : null,
        };
      }
    }
    if (!hasMore) return { items, after: null };
  }
  return { items, after };
}
