export const SEARCH_LANDING_LOG_ABTEST_TYPE = "search_landing_v1";
export const SEARCH_LANDING_LOCAL_ID_KEY = "harper_search_landing_id_v1";
export const SEARCH_LANDING_LAST_VISIT_AT_KEY =
  "harper_search_landing_last_visit_at";
export const SEARCH_LANDING_SESSION_GAP_MS = 30 * 60 * 1000;

export type SearchLandingLog = {
  id: number;
  local_id: string;
  type: string;
  created_at: string;
  abtest_type: string | null;
  is_mobile: boolean | null;
  country_lang: string | null;
};

export type SearchLandingUserGroup = {
  local_id: string;
  entryTime: string;
  logs: SearchLandingLog[];
};

export type SearchLandingFunnelSummary = {
  totalUsers: number;
  scrolledUsers: number;
  startClickedUsers: number;
  loggedInUsers: number;
};

const ENTRY_TYPES = new Set(["new_visit", "new_session"]);

export function createSearchLandingId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isSearchLandingStartLogType(type: string) {
  if (type === "click_start") return true;
  return type.startsWith("click_") && type.endsWith("_start");
}

export function groupSearchLandingLogsByUser(logItems: SearchLandingLog[]) {
  if (logItems.length === 0) return [] as SearchLandingUserGroup[];

  const byUser = new Map<string, SearchLandingLog[]>();

  for (const item of logItems) {
    const list = byUser.get(item.local_id) ?? [];
    list.push(item);
    byUser.set(item.local_id, list);
  }

  const groups: SearchLandingUserGroup[] = [];

  for (const [local_id, list] of Array.from(byUser.entries())) {
    const entryCandidates = list.filter((log) => ENTRY_TYPES.has(log.type));
    const entryTimeSource =
      entryCandidates.length > 0
        ? entryCandidates
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        : list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[
            0
          ];

    groups.push({
      local_id,
      entryTime: entryTimeSource?.created_at ?? "",
      logs: list
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    });
  }

  return groups.sort((a, b) => b.entryTime.localeCompare(a.entryTime));
}

export function summarizeSearchLandingFunnel(logItems: SearchLandingLog[]) {
  const groups = groupSearchLandingLogsByUser(logItems);

  const summary: SearchLandingFunnelSummary = {
    totalUsers: groups.length,
    scrolledUsers: groups.filter((group) =>
      group.logs.some((log) => log.type === "first_scroll_down")
    ).length,
    startClickedUsers: groups.filter((group) =>
      group.logs.some((log) => isSearchLandingStartLogType(log.type))
    ).length,
    loggedInUsers: groups.filter((group) =>
      group.logs.some((log) => log.type.startsWith("login_email:"))
    ).length,
  };

  return summary;
}
