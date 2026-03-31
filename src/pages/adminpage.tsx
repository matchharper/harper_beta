import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";
import { Loading } from "@/components/ui/loading";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import {
  BLOG_CONVERSION_EVENT_PREFIX,
  BLOG_VIEW_EVENT_PREFIX,
} from "@/lib/blogMetrics";
import {
  TALENT_NETWORK_ABTEST_TYPE_A,
  TALENT_NETWORK_ABTEST_TYPE_B,
  TALENT_NETWORK_ANALYTICS_ABTEST_TYPES,
  TALENT_NETWORK_CLICK_EVENT_PREFIX,
  TALENT_NETWORK_LEGACY_ABTEST_TYPE,
  TALENT_NETWORK_ONBOARDING_STEPS,
  TALENT_NETWORK_SUBMIT_COMPLETED_EVENT,
  getTalentNetworkVariantLabel,
} from "@/lib/talentNetwork";

type LandingLog = {
  id: string;
  local_id: string;
  type: string;
  abtest_type: string | null;
  created_at: string;
  is_mobile: boolean | null;
  country_lang: string | null;
};

type GroupedLogs = {
  local_id: string;
  entryTime: string;
  country_lang: string;
  abtest_type: string;
  logs: LandingLog[];
};

type AbtestSummary = {
  abtestType: string;
  totalUsers: number;
  scrolledUsers: number;
  startClickedUsers: number;
  pricingClickedUsers: number;
  loggedInUsers: number;
};

type SectionProgressSummary = {
  abtestType: string;
  totalUsers: number;
  sections: Array<{
    sectionName: string;
    userCount: number;
  }>;
};

type TalentNetworkFunnelSummary = {
  totalUsers: number;
  onboardingStartUsers: number;
  submittedUsers: number;
  steps: Array<{
    step: number;
    label: string;
    userCount: number;
  }>;
};

type TalentNetworkButtonSummary = {
  eventType: string;
  totalClicks: number;
  uniqueUsers: number;
  variantBreakdown: Array<{
    abtestType: string;
    label: string;
    totalClicks: number;
    uniqueUsers: number;
  }>;
};

type TalentNetworkVariantFunnelSummary = TalentNetworkFunnelSummary & {
  abtestType: string;
  label: string;
};
type WaitlistCompany = {
  additional: string | null;
  company: string | null;
  company_link: string | null;
  created_at: string;
  email: string;
  is_mobile: boolean | null;
  is_submit: boolean;
  main: string | null;
  name: string | null;
  needs: string[] | null;
  role: string | null;
  size: string | null;
};

type BlogMetricRow = {
  slug: string;
  viewCount: number;
  conversionCount: number;
};

type AdminBookmarkUser = {
  userId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  folderCount: number;
  bookmarkCount: number;
};

type AdminBookmarkFolder = {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

type AdminBookmarkFolderItem = {
  folderItemId: number;
  candidId: string;
  name: string | null;
  headline: string | null;
  memo: string;
  memoUpdatedAt: string | null;
  linkedinUrl: string | null;
  profileHref: string;
  createdAt: string | null;
};

type AdminUserAnalyticsUser = {
  userId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  searchCount: number;
  profileViewCount: number;
  linkClickCount: number;
};

type AdminUserAnalyticsSummary = {
  searchCount: number;
  runCount: number;
  pageViewCount: number;
  profileViewCount: number;
  linkClickCount: number;
  uniqueProfilesViewed: number;
  chatMessageCount: number;
  markedCandidateCount: number;
  bookmarkedCandidateCount: number;
  memoCount: number;
  pageViewsPerSearch: number;
  profileViewsPerSearch: number;
};

type AdminUserAnalyticsProfile = {
  candidId: string;
  name: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  profileHref: string;
  profileViewCount: number;
  totalLinkClickCount: number;
  linkClicks: Array<{
    host: string;
    count: number;
  }>;
};

type AdminTab =
  | "landingLogs"
  | "networkAnalytics"
  | "waitlistCompany"
  | "blogMetrics"
  | "bookmarkFolders"
  | "userAnalytics";

const PAGE_SIZE = 50;
const BLOG_METRIC_FETCH_BATCH_SIZE = 1000;

const ENTRY_TYPES = new Set(["new_visit", "new_session"]);
const EXCLUDED_TYPE_KEYWORD = "index";
const SECTION_VIEW_EVENT_PREFIX = "view_section_";

function isStartClickLogType(type: string) {
  if (type === "click_start") return true;
  return type.startsWith("click_") && type.endsWith("_start");
}

function isPricingClickLogType(type: string) {
  return type.startsWith("click_pricing_");
}

function isExcludedLandingLogType(type: string) {
  return type.toLowerCase().includes(EXCLUDED_TYPE_KEYWORD);
}

function extractSectionNameFromType(type: string) {
  if (!type.startsWith(SECTION_VIEW_EVENT_PREFIX)) return null;
  const sectionName = type.slice(SECTION_VIEW_EVENT_PREFIX.length).trim();
  return sectionName.length > 0 ? sectionName : null;
}

function formatSectionName(sectionName: string) {
  return sectionName.replace(/_/g, " ");
}

function formatTalentNetworkEventName(type: string) {
  return type
    .replace(/^talent_network_/, "")
    .replace(/:/g, " / ")
    .replace(/_/g, " ");
}
function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function formatKST(iso?: string) {
  if (!iso) return "";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TALENT_NETWORK_VARIANT_SORT_ORDER: Record<string, number> = {
  [TALENT_NETWORK_ABTEST_TYPE_A]: 0,
  [TALENT_NETWORK_ABTEST_TYPE_B]: 1,
  [TALENT_NETWORK_LEGACY_ABTEST_TYPE]: 2,
  unknown: 3,
};

function compareTalentNetworkVariantType(a: string, b: string) {
  const aOrder = TALENT_NETWORK_VARIANT_SORT_ORDER[a] ?? 99;
  const bOrder = TALENT_NETWORK_VARIANT_SORT_ORDER[b] ?? 99;

  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
}

function buildTalentNetworkFunnelSummary(
  groups: GroupedLogs[]
): TalentNetworkFunnelSummary | null {
  if (groups.length === 0) return null;

  const steps = TALENT_NETWORK_ONBOARDING_STEPS.map((item) => ({
    step: item.step,
    label: item.label,
    userCount: groups.filter((group) =>
      group.logs.some((log) => log.type === item.eventType)
    ).length,
  }));

  return {
    totalUsers: groups.length,
    onboardingStartUsers: steps[0]?.userCount ?? 0,
    submittedUsers: groups.filter((group) =>
      group.logs.some(
        (log) => log.type === TALENT_NETWORK_SUBMIT_COMPLETED_EVENT
      )
    ).length,
    steps,
  };
}

function getTalentNetworkVariantDescription(abtestType: string) {
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_A) {
    return "Our value hidden";
  }
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_B) {
    return "Our value shown";
  }
  if (abtestType === TALENT_NETWORK_LEGACY_ABTEST_TYPE) {
    return "Before A/B test";
  }
  return "";
}

function extractSlugFromEventType(type: string, prefix: string) {
  if (!type.startsWith(prefix)) return null;
  const slug = type.slice(prefix.length).trim();
  return slug.length > 0 ? slug : null;
}

function groupLandingLogsByUser(logItems: LandingLog[]) {
  if (logItems.length === 0) return [] as GroupedLogs[];

  const byUser = new Map<string, LandingLog[]>();
  for (const item of logItems) {
    if (isExcludedLandingLogType(item.type)) continue;
    const list = byUser.get(item.local_id) ?? [];
    list.push(item);
    byUser.set(item.local_id, list);
  }

  const groups: GroupedLogs[] = [];
  for (const [local_id, list] of Array.from(byUser.entries())) {
    const entryCandidates = list.filter((l) => ENTRY_TYPES.has(l.type));
    const entryTimeSource =
      entryCandidates.length > 0
        ? entryCandidates
            .slice()
            .sort((a: LandingLog, b: LandingLog) =>
              b.created_at.localeCompare(a.created_at)
            )[0]
        : list
            .slice()
            .sort((a: LandingLog, b: LandingLog) =>
              b.created_at.localeCompare(a.created_at)
            )[0];

    const entryTime = entryTimeSource?.created_at ?? "";
    const abtestType =
      entryTimeSource?.abtest_type ??
      list.find((log) => !!log.abtest_type)?.abtest_type ??
      "unknown";

    const orderedLogs = list
      .slice()
      .sort((a: LandingLog, b: LandingLog) =>
        a.created_at.localeCompare(b.created_at)
      );

    groups.push({
      local_id,
      entryTime,
      abtest_type: abtestType,
      logs: orderedLogs,
      country_lang: list[0]?.country_lang ?? "",
    });
  }

  return groups.sort((a, b) => b.entryTime.localeCompare(a.entryTime));
}

const AdminPage = () => {
  const [password, setPassword] = useState("");
  const [isPassed, setIsPassed] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("landingLogs");

  const [logs, setLogs] = useState<LandingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const [waitlistRows, setWaitlistRows] = useState<WaitlistCompany[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistLoaded, setWaitlistLoaded] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [networkAnalyticsLogs, setNetworkAnalyticsLogs] = useState<
    LandingLog[]
  >([]);
  const [networkAnalyticsLoading, setNetworkAnalyticsLoading] = useState(false);
  const [networkAnalyticsLoaded, setNetworkAnalyticsLoaded] = useState(false);
  const [networkAnalyticsError, setNetworkAnalyticsError] = useState<
    string | null
  >(null);
  const [blogMetricRows, setBlogMetricRows] = useState<BlogMetricRow[]>([]);
  const [blogMetricsLoading, setBlogMetricsLoading] = useState(false);
  const [blogMetricsLoaded, setBlogMetricsLoaded] = useState(false);
  const [blogMetricsError, setBlogMetricsError] = useState<string | null>(null);
  const [bookmarkSearch, setBookmarkSearch] = useState("");
  const [bookmarkUsers, setBookmarkUsers] = useState<AdminBookmarkUser[]>([]);
  const [bookmarkUsersLoading, setBookmarkUsersLoading] = useState(false);
  const [bookmarkUsersError, setBookmarkUsersError] = useState<string | null>(
    null
  );
  const [selectedBookmarkUser, setSelectedBookmarkUser] =
    useState<AdminBookmarkUser | null>(null);
  const [bookmarkFolders, setBookmarkFolders] = useState<AdminBookmarkFolder[]>(
    []
  );
  const [bookmarkFoldersLoading, setBookmarkFoldersLoading] = useState(false);
  const [bookmarkFoldersError, setBookmarkFoldersError] = useState<
    string | null
  >(null);
  const [selectedBookmarkFolderId, setSelectedBookmarkFolderId] = useState<
    number | null
  >(null);
  const [bookmarkFolderItems, setBookmarkFolderItems] = useState<
    AdminBookmarkFolderItem[]
  >([]);
  const [bookmarkFolderItemsLoading, setBookmarkFolderItemsLoading] =
    useState(false);
  const [bookmarkFolderItemsError, setBookmarkFolderItemsError] = useState<
    string | null
  >(null);
  const [bookmarkFolderTotal, setBookmarkFolderTotal] = useState(0);
  const [bookmarkFolderLimit, setBookmarkFolderLimit] = useState(200);
  const [userAnalyticsSearch, setUserAnalyticsSearch] = useState("");
  const [userAnalyticsUsers, setUserAnalyticsUsers] = useState<
    AdminUserAnalyticsUser[]
  >([]);
  const [userAnalyticsUsersLoading, setUserAnalyticsUsersLoading] =
    useState(false);
  const [userAnalyticsUsersError, setUserAnalyticsUsersError] = useState<
    string | null
  >(null);
  const [selectedAnalyticsUser, setSelectedAnalyticsUser] =
    useState<AdminUserAnalyticsUser | null>(null);
  const [userAnalyticsSummary, setUserAnalyticsSummary] =
    useState<AdminUserAnalyticsSummary | null>(null);
  const [userAnalyticsProfiles, setUserAnalyticsProfiles] = useState<
    AdminUserAnalyticsProfile[]
  >([]);
  const [userAnalyticsStartDate, setUserAnalyticsStartDate] = useState("");
  const [userAnalyticsEndDate, setUserAnalyticsEndDate] = useState("");
  const [userAnalyticsDetailLoading, setUserAnalyticsDetailLoading] =
    useState(false);
  const [userAnalyticsDetailError, setUserAnalyticsDetailError] = useState<
    string | null
  >(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedPassword = localStorage.getItem("admin_password");
    if (savedPassword === ADMIN_PAGE_PASSWORD) {
      setIsPassed(true);
    }
  }, []);

  const fetchPage = useCallback(
    async ({ reset }: { reset: boolean }) => {
      if (!reset && (!hasMore || loadingMore)) return;

      if (reset) {
        setLoading(true);
        setError(null);
        setLogs([]);
        setCursor(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
        setError(null);
      }

      try {
        let q = supabase
          .from("landing_logs")
          .select(
            "id,local_id,type,abtest_type,created_at,is_mobile,country_lang"
          )
          .order("created_at", { ascending: false })
          .not("country_lang", "ilike", `%US_en%`)
          .neq("local_id", "a22bb523-42cd-4d39-9667-c527c40941d3")
          .neq("local_id", "a4d4df1a-aa6d-401e-a34a-00d426630fe2")
          .neq("local_id", "ce032ed7-8836-44e5-8605-64e80f5fe234")
          .neq("local_id", "625e7ae5-2914-4f11-b433-7860ee2b8807")
          .neq("local_id", "3c148031-8505-42a6-8389-581dc5416ac6")
          .neq("local_id", "0bb22721-2449-463a-8e95-15f5b92b891a")
          .neq("local_id", "625e7ae5-2914-4f11-b433-7860ee2b8807")
          .neq("local_id", "c894cae6-cc5f-4780-93d4-09f351ab2c4e")
          .limit(PAGE_SIZE);

        const cur = reset ? null : cursor;
        if (cur) q = q.lt("created_at", cur);

        const { data, error } = await q;
        if (error) throw error;

        const page = (data ?? []) as any[];

        setLogs((prev) => {
          if (reset) return page;
          const seen = new Set(prev.map((x) => x.id));
          const merged = [...prev];
          for (const item of page) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });

        const last = page[page.length - 1];
        setCursor(last?.created_at ?? cur);

        if (page.length < PAGE_SIZE) setHasMore(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, hasMore, loadingMore]
  );

  useEffect(() => {
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWaitlistCompanies = useCallback(async () => {
    setWaitlistLoading(true);
    setWaitlistError(null);
    try {
      const { data, error } = await supabase
        .from("harper_waitlist_company")
        .select(
          "created_at,email,name,company,company_link,role,size,needs,main,additional,is_submit,is_mobile"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      setWaitlistRows((data ?? []) as WaitlistCompany[]);
      setWaitlistLoaded(true);
    } catch (e: any) {
      setWaitlistError(e?.message ?? "Failed to load");
    } finally {
      setWaitlistLoading(false);
    }
  }, []);

  const fetchNetworkAnalyticsLogs = useCallback(async () => {
    setNetworkAnalyticsLoading(true);
    setNetworkAnalyticsError(null);

    try {
      let from = 0;
      const allLogs: LandingLog[] = [];

      while (true) {
        const to = from + BLOG_METRIC_FETCH_BATCH_SIZE - 1;

        const { data, error } = await supabase
          .from("landing_logs")
          .select(
            "id,local_id,type,abtest_type,created_at,is_mobile,country_lang"
          )
          .in("abtest_type", [...TALENT_NETWORK_ANALYTICS_ABTEST_TYPES])
          .not("country_lang", "ilike", `%US_en%`)
          .order("id", { ascending: true })
          .range(from, to);

        if (error) throw error;

        const rows = (
          (data ?? []) as Array<{
            id: number | string | null;
            local_id: string | null;
            type: string | null;
            abtest_type: string | null;
            created_at: string;
            is_mobile: boolean | null;
            country_lang: string | null;
          }>
        ).flatMap((row) => {
          if (
            row.id === null ||
            typeof row.local_id !== "string" ||
            typeof row.type !== "string"
          ) {
            return [];
          }

          return [
            {
              id: String(row.id),
              local_id: row.local_id,
              type: row.type,
              abtest_type: row.abtest_type,
              created_at: row.created_at,
              is_mobile: row.is_mobile,
              country_lang: row.country_lang,
            } satisfies LandingLog,
          ];
        });
        allLogs.push(...rows);

        if (rows.length < BLOG_METRIC_FETCH_BATCH_SIZE) {
          break;
        }

        from += BLOG_METRIC_FETCH_BATCH_SIZE;
      }

      setNetworkAnalyticsLogs(allLogs);
      setNetworkAnalyticsLoaded(true);
    } catch (e: any) {
      setNetworkAnalyticsError(
        e?.message ?? "Failed to load network analytics"
      );
    } finally {
      setNetworkAnalyticsLoading(false);
    }
  }, []);

  const fetchEventTypesByPrefix = useCallback(async (prefix: string) => {
    let from = 0;
    const allTypes: string[] = [];

    while (true) {
      const to = from + BLOG_METRIC_FETCH_BATCH_SIZE - 1;

      const { data, error } = await supabase
        .from("landing_logs")
        .select("type")
        .like("type", `${prefix}%`)
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = (data ?? []) as Array<{ type: string | null }>;
      for (const row of rows) {
        if (typeof row.type === "string" && row.type.length > 0) {
          allTypes.push(row.type);
        }
      }

      if (rows.length < BLOG_METRIC_FETCH_BATCH_SIZE) {
        break;
      }

      from += BLOG_METRIC_FETCH_BATCH_SIZE;
    }

    return allTypes;
  }, []);

  const fetchBlogMetrics = useCallback(async () => {
    setBlogMetricsLoading(true);
    setBlogMetricsError(null);

    try {
      const [viewTypes, conversionTypes] = await Promise.all([
        fetchEventTypesByPrefix(BLOG_VIEW_EVENT_PREFIX),
        fetchEventTypesByPrefix(BLOG_CONVERSION_EVENT_PREFIX),
      ]);

      const counter = new Map<string, BlogMetricRow>();

      for (const type of viewTypes) {
        const slug = extractSlugFromEventType(type, BLOG_VIEW_EVENT_PREFIX);
        if (!slug) continue;

        const prev = counter.get(slug) ?? {
          slug,
          viewCount: 0,
          conversionCount: 0,
        };
        prev.viewCount += 1;
        counter.set(slug, prev);
      }

      for (const type of conversionTypes) {
        const slug = extractSlugFromEventType(
          type,
          BLOG_CONVERSION_EVENT_PREFIX
        );
        if (!slug) continue;

        const prev = counter.get(slug) ?? {
          slug,
          viewCount: 0,
          conversionCount: 0,
        };
        prev.conversionCount += 1;
        counter.set(slug, prev);
      }

      const rows = Array.from(counter.values()).sort((a, b) => {
        if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
        if (b.conversionCount !== a.conversionCount) {
          return b.conversionCount - a.conversionCount;
        }
        return a.slug.localeCompare(b.slug);
      });

      setBlogMetricRows(rows);
      setBlogMetricsLoaded(true);
    } catch (e: any) {
      setBlogMetricsError(e?.message ?? "Failed to load");
    } finally {
      setBlogMetricsLoading(false);
    }
  }, [fetchEventTypesByPrefix]);

  const fetchBookmarkUsers = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setBookmarkUsers([]);
      setBookmarkUsersError(null);
      setSelectedBookmarkUser(null);
      setBookmarkFolders([]);
      setBookmarkFoldersError(null);
      setSelectedBookmarkFolderId(null);
      setBookmarkFolderItems([]);
      setBookmarkFolderItemsError(null);
      setBookmarkFolderTotal(0);
      return;
    }

    setBookmarkUsersLoading(true);
    setBookmarkUsersError(null);
    setBookmarkFoldersError(null);
    setBookmarkFolderItemsError(null);

    try {
      const params = new URLSearchParams({ query: trimmed });
      const res = await fetch(`/api/admin/bookmark-folders?${params}`, {
        headers: {
          "x-admin-password": ADMIN_PAGE_PASSWORD,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load users");
      }

      setBookmarkUsers(
        Array.isArray(json?.users) ? (json.users as AdminBookmarkUser[]) : []
      );
      setSelectedBookmarkUser(null);
      setBookmarkFolders([]);
      setSelectedBookmarkFolderId(null);
      setBookmarkFolderItems([]);
      setBookmarkFolderTotal(0);
    } catch (e: any) {
      setBookmarkUsersError(e?.message ?? "Failed to load users");
    } finally {
      setBookmarkUsersLoading(false);
    }
  }, []);

  const fetchBookmarkFolders = useCallback(async (user: AdminBookmarkUser) => {
    setBookmarkFoldersLoading(true);
    setBookmarkFoldersError(null);
    setBookmarkFolderItemsError(null);
    setSelectedBookmarkUser(user);
    setSelectedBookmarkFolderId(null);
    setBookmarkFolderItems([]);
    setBookmarkFolderTotal(0);

    try {
      const params = new URLSearchParams({ userId: user.userId });
      const res = await fetch(`/api/admin/bookmark-folders?${params}`, {
        headers: {
          "x-admin-password": ADMIN_PAGE_PASSWORD,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load folders");
      }

      if (json?.user) {
        setSelectedBookmarkUser(json.user as AdminBookmarkUser);
      }
      setBookmarkFolders(
        Array.isArray(json?.folders)
          ? (json.folders as AdminBookmarkFolder[])
          : []
      );
    } catch (e: any) {
      setBookmarkFoldersError(e?.message ?? "Failed to load folders");
      setBookmarkFolders([]);
    } finally {
      setBookmarkFoldersLoading(false);
    }
  }, []);

  const fetchBookmarkFolderItems = useCallback(
    async (userId: string, folderId: number) => {
      setBookmarkFolderItemsLoading(true);
      setBookmarkFolderItemsError(null);
      setSelectedBookmarkFolderId(folderId);

      try {
        const params = new URLSearchParams({
          userId,
          folderId: String(folderId),
        });
        const res = await fetch(`/api/admin/bookmark-folders?${params}`, {
          headers: {
            "x-admin-password": ADMIN_PAGE_PASSWORD,
          },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load folder items");
        }

        setBookmarkFolderItems(
          Array.isArray(json?.items)
            ? (json.items as AdminBookmarkFolderItem[])
            : []
        );
        setBookmarkFolderTotal(Number(json?.total ?? 0));
        setBookmarkFolderLimit(Number(json?.limit ?? 200));
      } catch (e: any) {
        setBookmarkFolderItemsError(
          e?.message ?? "Failed to load folder items"
        );
        setBookmarkFolderItems([]);
        setBookmarkFolderTotal(0);
      } finally {
        setBookmarkFolderItemsLoading(false);
      }
    },
    []
  );

  const fetchUserAnalyticsUsers = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setUserAnalyticsUsers([]);
      setUserAnalyticsUsersError(null);
      setSelectedAnalyticsUser(null);
      setUserAnalyticsSummary(null);
      setUserAnalyticsProfiles([]);
      setUserAnalyticsDetailError(null);
      return;
    }

    setUserAnalyticsUsersLoading(true);
    setUserAnalyticsUsersError(null);
    setUserAnalyticsDetailError(null);
    setSelectedAnalyticsUser(null);
    setUserAnalyticsSummary(null);
    setUserAnalyticsProfiles([]);

    try {
      const params = new URLSearchParams({ query: trimmed });
      const res = await fetch(`/api/admin/user-analytics?${params}`, {
        headers: {
          "x-admin-password": ADMIN_PAGE_PASSWORD,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load users");
      }

      setUserAnalyticsUsers(
        Array.isArray(json?.users)
          ? (json.users as AdminUserAnalyticsUser[])
          : []
      );
    } catch (e: any) {
      setUserAnalyticsUsersError(e?.message ?? "Failed to load users");
    } finally {
      setUserAnalyticsUsersLoading(false);
    }
  }, []);

  const fetchUserAnalyticsDetail = useCallback(
    async (
      user: AdminUserAnalyticsUser,
      overrides?: {
        startDate?: string;
        endDate?: string;
      }
    ) => {
      setSelectedAnalyticsUser(user);
      setUserAnalyticsDetailLoading(true);
      setUserAnalyticsDetailError(null);
      setUserAnalyticsSummary(null);
      setUserAnalyticsProfiles([]);

      try {
        const effectiveStartDate =
          overrides?.startDate ?? userAnalyticsStartDate;
        const effectiveEndDate = overrides?.endDate ?? userAnalyticsEndDate;
        const params = new URLSearchParams({ userId: user.userId });
        if (effectiveStartDate) {
          params.set("startDate", effectiveStartDate);
        }
        if (effectiveEndDate) {
          params.set("endDate", effectiveEndDate);
        }
        const res = await fetch(`/api/admin/user-analytics?${params}`, {
          headers: {
            "x-admin-password": ADMIN_PAGE_PASSWORD,
          },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load analytics");
        }

        if (json?.user) {
          const summary = json?.summary as
            | AdminUserAnalyticsSummary
            | undefined;
          setSelectedAnalyticsUser({
            ...user,
            ...(json.user as Partial<AdminUserAnalyticsUser>),
            userId: String(
              (json.user as { userId?: string })?.userId ?? user.userId
            ),
            searchCount: summary?.searchCount ?? user.searchCount ?? 0,
            profileViewCount:
              summary?.profileViewCount ?? user.profileViewCount ?? 0,
            linkClickCount: summary?.linkClickCount ?? user.linkClickCount ?? 0,
          });
        }

        setUserAnalyticsSummary(
          json?.summary ? (json.summary as AdminUserAnalyticsSummary) : null
        );
        setUserAnalyticsProfiles(
          Array.isArray(json?.profiles)
            ? (json.profiles as AdminUserAnalyticsProfile[])
            : []
        );
      } catch (e: any) {
        setUserAnalyticsDetailError(e?.message ?? "Failed to load analytics");
        setUserAnalyticsSummary(null);
        setUserAnalyticsProfiles([]);
      } finally {
        setUserAnalyticsDetailLoading(false);
      }
    },
    [userAnalyticsEndDate, userAnalyticsStartDate]
  );

  const applyUserAnalyticsDateRange = useCallback(() => {
    if (!selectedAnalyticsUser) return;
    void fetchUserAnalyticsDetail(selectedAnalyticsUser);
  }, [fetchUserAnalyticsDetail, selectedAnalyticsUser]);

  const resetUserAnalyticsDateRange = useCallback(() => {
    setUserAnalyticsStartDate("");
    setUserAnalyticsEndDate("");

    if (!selectedAnalyticsUser) return;
    void fetchUserAnalyticsDetail(selectedAnalyticsUser, {
      startDate: "",
      endDate: "",
    });
  }, [fetchUserAnalyticsDetail, selectedAnalyticsUser]);

  useEffect(() => {
    if (activeTab !== "waitlistCompany") return;
    if (waitlistLoaded || waitlistLoading || waitlistError) return;
    fetchWaitlistCompanies();
  }, [
    activeTab,
    fetchWaitlistCompanies,
    waitlistLoaded,
    waitlistLoading,
    waitlistError,
  ]);

  useEffect(() => {
    if (activeTab !== "blogMetrics") return;
    if (blogMetricsLoaded || blogMetricsLoading || blogMetricsError) return;
    fetchBlogMetrics();
  }, [
    activeTab,
    blogMetricsLoaded,
    blogMetricsLoading,
    blogMetricsError,
    fetchBlogMetrics,
  ]);

  useEffect(() => {
    if (activeTab !== "landingLogs") return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) fetchPage({ reset: false });
      },
      { root: null, rootMargin: "600px 0px", threshold: 0 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [activeTab, fetchPage]);

  useEffect(() => {
    if (activeTab !== "networkAnalytics") return;
    if (
      networkAnalyticsLoaded ||
      networkAnalyticsLoading ||
      networkAnalyticsError
    )
      return;
    void fetchNetworkAnalyticsLogs();
  }, [
    activeTab,
    fetchNetworkAnalyticsLogs,
    networkAnalyticsError,
    networkAnalyticsLoaded,
    networkAnalyticsLoading,
  ]);

  const onRefresh = async () => {
    if (activeTab === "landingLogs") {
      await fetchPage({ reset: true });
      return;
    }
    if (activeTab === "networkAnalytics") {
      await fetchNetworkAnalyticsLogs();
      return;
    }
    if (activeTab === "waitlistCompany") {
      await fetchWaitlistCompanies();
      return;
    }
    if (activeTab === "blogMetrics") {
      await fetchBlogMetrics();
      return;
    }
    if (activeTab === "userAnalytics") {
      if (selectedAnalyticsUser) {
        await fetchUserAnalyticsDetail(selectedAnalyticsUser);
        return;
      }

      await fetchUserAnalyticsUsers(userAnalyticsSearch);
      return;
    }
    if (selectedBookmarkUser && selectedBookmarkFolderId) {
      await fetchBookmarkFolderItems(
        selectedBookmarkUser.userId,
        selectedBookmarkFolderId
      );
      return;
    }
    if (selectedBookmarkUser) {
      await fetchBookmarkFolders(selectedBookmarkUser);
      return;
    }

    await fetchBookmarkUsers(bookmarkSearch);
  };

  const onSubmit = async () => {
    if (password === ADMIN_PAGE_PASSWORD) {
      setIsPassed(true);
      localStorage.setItem("admin_password", password);
    } else {
      showToast({
        message: "Invalid password",
        variant: "white",
      });
    }
  };

  const grouped = useMemo<GroupedLogs[]>(
    () => groupLandingLogsByUser(logs),
    [logs]
  );
  const networkGrouped = useMemo<GroupedLogs[]>(
    () => groupLandingLogsByUser(networkAnalyticsLogs),
    [networkAnalyticsLogs]
  );
  const networkGroupsByVariant = useMemo(() => {
    const byVariant = new Map<string, GroupedLogs[]>();

    for (const group of networkGrouped) {
      const key = group.abtest_type || "unknown";
      const list = byVariant.get(key) ?? [];
      list.push(group);
      byVariant.set(key, list);
    }

    return byVariant;
  }, [networkGrouped]);

  const landingSummary = useMemo(() => {
    const totalUsers = grouped.length;
    const scrolledUsers = grouped.filter((group) =>
      group.logs.some((log) => log.type === "first_scroll_down")
    ).length;
    const startClickedUsers = grouped.filter((group) =>
      group.logs.some((log) => isStartClickLogType(log.type))
    ).length;
    const loggedInUsers = grouped.filter((group) =>
      group.logs.some((log) => log.type.startsWith("login_email:"))
    ).length;

    return {
      totalUsers,
      scrolledUsers,
      startClickedUsers,
      loggedInUsers,
    };
  }, [grouped]);

  const abtestSummary = useMemo<AbtestSummary[]>(() => {
    if (grouped.length === 0) return [];

    const byAbtest = new Map<string, GroupedLogs[]>();

    for (const group of grouped) {
      const key = group.abtest_type || "unknown";
      const list = byAbtest.get(key) ?? [];
      list.push(group);
      byAbtest.set(key, list);
    }

    const summary: AbtestSummary[] = [];
    for (const [abtestType, list] of Array.from(byAbtest.entries())) {
      const totalUsers = list.length;
      const scrolledUsers = list.filter((group) =>
        group.logs.some((log) => log.type === "first_scroll_down")
      ).length;
      const startClickedUsers = list.filter((group) =>
        group.logs.some((log) => isStartClickLogType(log.type))
      ).length;
      const pricingClickedUsers = list.filter((group) =>
        group.logs.some((log) => isPricingClickLogType(log.type))
      ).length;
      const loggedInUsers = list.filter((group) =>
        group.logs.some((log) => log.type.startsWith("login_email:"))
      ).length;

      summary.push({
        abtestType,
        totalUsers,
        scrolledUsers,
        startClickedUsers,
        pricingClickedUsers,
        loggedInUsers,
      });
    }

    return summary.sort((a, b) => b.totalUsers - a.totalUsers);
  }, [grouped]);

  const sectionProgressSummary = useMemo<SectionProgressSummary[]>(() => {
    if (grouped.length === 0) return [];

    const byAbtest = new Map<
      string,
      {
        totalUsers: number;
        sectionCounts: Map<string, number>;
      }
    >();

    for (const group of grouped) {
      const key = group.abtest_type || "unknown";
      const summary = byAbtest.get(key) ?? {
        totalUsers: 0,
        sectionCounts: new Map<string, number>(),
      };

      summary.totalUsers += 1;

      const seenSections = new Set<string>();
      for (const log of group.logs) {
        const sectionName = extractSectionNameFromType(log.type);
        if (sectionName) {
          seenSections.add(sectionName);
        }
      }

      for (const sectionName of Array.from(seenSections)) {
        summary.sectionCounts.set(
          sectionName,
          (summary.sectionCounts.get(sectionName) ?? 0) + 1
        );
      }

      byAbtest.set(key, summary);
    }

    return Array.from(byAbtest.entries())
      .map(([abtestType, summary]) => ({
        abtestType,
        totalUsers: summary.totalUsers,
        sections: Array.from(summary.sectionCounts.entries())
          .map(([sectionName, userCount]) => ({
            sectionName,
            userCount,
          }))
          .sort((a, b) => {
            if (b.userCount !== a.userCount) {
              return b.userCount - a.userCount;
            }
            return a.sectionName.localeCompare(b.sectionName);
          }),
      }))
      .filter((item) => item.sections.length > 0)
      .sort((a, b) => b.totalUsers - a.totalUsers);
  }, [grouped]);

  const talentNetworkFunnelSummary = useMemo<TalentNetworkFunnelSummary | null>(
    () => buildTalentNetworkFunnelSummary(networkGrouped),
    [networkGrouped]
  );

  const talentNetworkVariantSummaries = useMemo<
    TalentNetworkVariantFunnelSummary[]
  >(() => {
    const variantsToShow = [
      TALENT_NETWORK_ABTEST_TYPE_A,
      TALENT_NETWORK_ABTEST_TYPE_B,
      ...Array.from(networkGroupsByVariant.keys()).filter(
        (key) =>
          key !== TALENT_NETWORK_ABTEST_TYPE_A &&
          key !== TALENT_NETWORK_ABTEST_TYPE_B
      ),
    ];

    const uniqueVariants = Array.from(new Set(variantsToShow)).sort(
      compareTalentNetworkVariantType
    );

    return uniqueVariants.map((abtestType) => {
      const summary = buildTalentNetworkFunnelSummary(
        networkGroupsByVariant.get(abtestType) ?? []
      ) ?? {
        totalUsers: 0,
        onboardingStartUsers: 0,
        submittedUsers: 0,
        steps: TALENT_NETWORK_ONBOARDING_STEPS.map((item) => ({
          step: item.step,
          label: item.label,
          userCount: 0,
        })),
      };

      return {
        ...summary,
        abtestType,
        label: getTalentNetworkVariantLabel(abtestType),
      };
    });
  }, [networkGroupsByVariant]);

  const talentNetworkButtonSummary = useMemo<
    TalentNetworkButtonSummary[]
  >(() => {
    if (networkGrouped.length === 0) return [];

    const counter = new Map<
      string,
      {
        totalClicks: number;
        users: Set<string>;
        byVariant: Map<
          string,
          {
            totalClicks: number;
            users: Set<string>;
          }
        >;
      }
    >();

    for (const group of networkGrouped) {
      const variantKey = group.abtest_type || "unknown";

      for (const log of group.logs) {
        if (!log.type.startsWith(TALENT_NETWORK_CLICK_EVENT_PREFIX)) continue;

        const current = counter.get(log.type) ?? {
          totalClicks: 0,
          users: new Set<string>(),
          byVariant: new Map(),
        };
        current.totalClicks += 1;
        current.users.add(group.local_id);

        const currentVariant = current.byVariant.get(variantKey) ?? {
          totalClicks: 0,
          users: new Set<string>(),
        };
        currentVariant.totalClicks += 1;
        currentVariant.users.add(group.local_id);
        current.byVariant.set(variantKey, currentVariant);

        counter.set(log.type, current);
      }
    }

    return Array.from(counter.entries())
      .map(([eventType, summary]) => ({
        eventType,
        totalClicks: summary.totalClicks,
        uniqueUsers: summary.users.size,
        variantBreakdown: Array.from(summary.byVariant.entries())
          .map(([abtestType, variant]) => ({
            abtestType,
            label: getTalentNetworkVariantLabel(abtestType),
            totalClicks: variant.totalClicks,
            uniqueUsers: variant.users.size,
          }))
          .sort((a, b) =>
            compareTalentNetworkVariantType(a.abtestType, b.abtestType)
          ),
      }))
      .sort((a, b) => {
        if (b.uniqueUsers !== a.uniqueUsers) {
          return b.uniqueUsers - a.uniqueUsers;
        }
        if (b.totalClicks !== a.totalClicks) {
          return b.totalClicks - a.totalClicks;
        }
        return a.eventType.localeCompare(b.eventType);
      });
  }, [networkGrouped]);

  const blogMetricsSummary = useMemo(() => {
    const totalPosts = blogMetricRows.length;
    const totalViews = blogMetricRows.reduce(
      (acc, row) => acc + row.viewCount,
      0
    );
    const totalConversions = blogMetricRows.reduce(
      (acc, row) => acc + row.conversionCount,
      0
    );

    return {
      totalPosts,
      totalViews,
      totalConversions,
    };
  }, [blogMetricRows]);
  const talentNetworkVariantColumns = useMemo(
    () =>
      talentNetworkVariantSummaries.map((item) => ({
        abtestType: item.abtestType,
        label: item.label,
      })),
    [talentNetworkVariantSummaries]
  );
  const selectedBookmarkFolder = useMemo(
    () =>
      bookmarkFolders.find(
        (folder) => folder.id === selectedBookmarkFolderId
      ) ?? null,
    [bookmarkFolders, selectedBookmarkFolderId]
  );

  const isLandingTab = activeTab === "landingLogs";
  const isNetworkAnalyticsTab = activeTab === "networkAnalytics";
  const isWaitlistTab = activeTab === "waitlistCompany";
  const isBlogMetricsTab = activeTab === "blogMetrics";
  const isBookmarkFoldersTab = activeTab === "bookmarkFolders";
  const isUserAnalyticsTab = activeTab === "userAnalytics";

  const pageTitle = isLandingTab
    ? "Landing Logs Admin"
    : isNetworkAnalyticsTab
      ? "Network Analytics Admin"
      : isWaitlistTab
        ? "Waitlist Company Admin"
        : isBlogMetricsTab
          ? "Blog Metrics Admin"
          : isBookmarkFoldersTab
            ? "Bookmark Folder Admin"
            : "User Analytics Admin";
  const pageSubTitle = isLandingTab
    ? "local_id 기준 · 액션 타임라인"
    : isNetworkAnalyticsTab
      ? "Talent Network A/B test · funnel · button clicks"
      : isWaitlistTab
        ? "harper_waitlist_company 목록"
        : isBlogMetricsTab
          ? "blog slug 기준 조회/전환 집계"
          : isBookmarkFoldersTab
            ? "유저별 북마크 폴더와 저장 후보 조회"
            : "company_users 기준 검색/프로필/링크 클릭 지표 조회";
  const isLoading = isLandingTab
    ? loading || loadingMore
    : isNetworkAnalyticsTab
      ? networkAnalyticsLoading
      : isWaitlistTab
        ? waitlistLoading
        : isBlogMetricsTab
          ? blogMetricsLoading
          : isBookmarkFoldersTab
            ? bookmarkUsersLoading ||
              bookmarkFoldersLoading ||
              bookmarkFolderItemsLoading
            : userAnalyticsUsersLoading || userAnalyticsDetailLoading;
  const pageError = isLandingTab
    ? error
    : isNetworkAnalyticsTab
      ? networkAnalyticsError
      : isWaitlistTab
        ? waitlistError
        : isBlogMetricsTab
          ? blogMetricsError
          : isBookmarkFoldersTab
            ? null
            : null;

  if (!isPassed) {
    return (
      <div className="min-h-screen bg-white text-black font-inter">
        <div className="flex flex-col items-center justify-center h-screen">
          Who are you
          <input
            type="password"
            className="text-lg p-1 border-xgray300 border mt-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={onSubmit}
            className="bg-black text-white px-4 py-2 rounded-md mt-4"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black font-inter">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10">
        <div className="mx-auto max-w-[1100px] px-6 py-4 flex items-center gap-3">
          <div className="flex flex-col">
            <div className="text-[15px] font-semibold tracking-tight">
              {pageTitle}
            </div>
            <div className="text-[12px] text-black/55 leading-4">
              {pageSubTitle}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setActiveTab("landingLogs")}
                className={`h-8 px-3 text-[12px] border ${
                  isLandingTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                Landing Logs
              </button>
              <button
                onClick={() => setActiveTab("networkAnalytics")}
                className={`h-8 px-3 text-[12px] border ${
                  isNetworkAnalyticsTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                Network
              </button>
              <button
                onClick={() => setActiveTab("waitlistCompany")}
                className={`h-8 px-3 text-[12px] border ${
                  isWaitlistTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                Waitlist Company
              </button>
              <button
                onClick={() => setActiveTab("blogMetrics")}
                className={`h-8 px-3 text-[12px] border ${
                  isBlogMetricsTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                Blog Metrics
              </button>
              <button
                onClick={() => setActiveTab("bookmarkFolders")}
                className={`h-8 px-3 text-[12px] border ${
                  isBookmarkFoldersTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                Bookmark Folders
              </button>
              <button
                onClick={() => setActiveTab("userAnalytics")}
                className={`h-8 px-3 text-[12px] border ${
                  isUserAnalyticsTab
                    ? "border-black bg-black text-white"
                    : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                }`}
                style={{ borderRadius: 0 }}
              >
                User Analytics
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03] active:bg-black/[0.06]"
              style={{ borderRadius: 0 }}
              disabled={isLoading}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-6 w-full">
        {isLandingTab ? (
          <>
            <div
              className="mb-4 border border-black/10 p-4 text-[13px] text-black/80"
              style={{ borderRadius: 0 }}
            >
              <div className="font-semibold text-black mb-1">
                Loaded user summary
              </div>
              <div className="leading-6">
                전체 유저:{" "}
                <span className="text-black font-medium">
                  {landingSummary.totalUsers}
                </span>{" "}
                · 스크롤 다운:{" "}
                <span className="text-black font-medium">
                  {landingSummary.scrolledUsers}
                </span>{" "}
                (
                {formatPercent(
                  landingSummary.scrolledUsers,
                  landingSummary.totalUsers
                )}
                ) · click_*_start:{" "}
                <span className="text-black font-medium">
                  {landingSummary.startClickedUsers}
                </span>{" "}
                (
                {formatPercent(
                  landingSummary.startClickedUsers,
                  landingSummary.totalUsers
                )}
                ) · 로그인:{" "}
                <span className="text-black font-medium">
                  {landingSummary.loggedInUsers}
                </span>{" "}
                (
                {formatPercent(
                  landingSummary.loggedInUsers,
                  landingSummary.totalUsers
                )}
                )
              </div>
            </div>

            <div
              className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
              style={{ borderRadius: 0 }}
            >
              <div className="font-semibold text-black mb-2">
                AB Test summary (abtest_type)
              </div>
              {abtestSummary.length === 0 ? (
                <div className="text-black/55">No AB test data.</div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1.6fr_0.7fr_1fr_1fr_1fr_1fr] gap-2 font-semibold border-b border-black/10 pb-1">
                    <div>abtest_type</div>
                    <div className="text-right">Users</div>
                    <div className="text-right">Scroll</div>
                    <div className="text-right">Start</div>
                    <div className="text-right">Pricing</div>
                    <div className="text-right">Login</div>
                  </div>
                  {abtestSummary.map((item) => (
                    <div
                      key={item.abtestType}
                      className="grid grid-cols-[1.6fr_0.7fr_1fr_1fr_1fr_1fr] gap-2"
                    >
                      <div className="break-all">{item.abtestType}</div>
                      <div className="text-right">{item.totalUsers}</div>
                      <div className="text-right">
                        {item.scrolledUsers} (
                        {formatPercent(item.scrolledUsers, item.totalUsers)})
                      </div>
                      <div className="text-right">
                        {item.startClickedUsers} (
                        {formatPercent(item.startClickedUsers, item.totalUsers)}
                        )
                      </div>
                      <div className="text-right">
                        {item.pricingClickedUsers} (
                        {formatPercent(
                          item.pricingClickedUsers,
                          item.totalUsers
                        )}
                        )
                      </div>
                      <div className="text-right">
                        {item.loggedInUsers} (
                        {formatPercent(item.loggedInUsers, item.totalUsers)})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
              style={{ borderRadius: 0 }}
            >
              <div className="font-semibold text-black mb-2">
                Section reach summary (abtest_type)
              </div>
              {sectionProgressSummary.length === 0 ? (
                <div className="text-black/55">No section view data.</div>
              ) : (
                <div className="space-y-3">
                  {sectionProgressSummary.map((item) => (
                    <div
                      key={item.abtestType}
                      className="border-t border-black/10 pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="font-semibold text-black">
                        {item.abtestType}
                      </div>
                      <div className="mt-1 text-black/55">
                        Users: {item.totalUsers}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.sections.map((section) => (
                          <div
                            key={`${item.abtestType}-${section.sectionName}`}
                            className="border border-black/10 px-2 py-1"
                          >
                            <span className="font-medium text-black">
                              {formatSectionName(section.sectionName)}
                            </span>{" "}
                            · {section.userCount} (
                            {formatPercent(section.userCount, item.totalUsers)})
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 flex items-center justify-between w-full">
              <div className="text-[12px] text-black/55">
                Loaded logs: <span className="text-black">{logs.length}</span> ·
                Users: <span className="text-black">{grouped.length}</span>
              </div>

              {(loadingMore || loading) && (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="text-[12px] text-black/55"
                  inline={true}
                />
              )}
            </div>

            {pageError ? (
              <div
                className="border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
                style={{ borderRadius: 0 }}
              >
                <div>
                  <div className="font-semibold">Error</div>
                  <div className="text-black/70 mt-1">{pageError}</div>
                </div>
                <button
                  onClick={onRefresh}
                  className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                  style={{ borderRadius: 0 }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div
              className="border border-black/10 w-full"
              style={{ borderRadius: 0 }}
            >
              {loading ? (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="p-6 text-[13px] text-black/55"
                />
              ) : grouped.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="text-[14px] font-semibold">No logs</div>
                  <div className="text-[13px] text-black/55 mt-2">
                    No landing logs yet.
                  </div>
                </div>
              ) : (
                grouped.map((group) => (
                  <div
                    key={group.local_id}
                    className="border-t border-black/10 first:border-t-0 w-full"
                  >
                    <div className="px-5 py-4 w-full">
                      <div className="text-[14px] font-semibold">
                        local_id: {group.local_id} - {group.country_lang}
                      </div>
                      <div className="text-[12px] text-black/55 mt-1">
                        entry: {formatKST(group.entryTime)} · abtest:{" "}
                        {group.abtest_type}
                      </div>

                      <div className="mt-3 text-[13px] text-black/80 w-full space-y-1">
                        {group.logs.map((log) => (
                          <div key={log.id} className="flex gap-2 w-full">
                            <span className="text-black/50">•</span>
                            {ENTRY_TYPES.has(log.type) ? (
                              `${log.type} (${formatKST(log.created_at)})`
                            ) : (
                              <div className="flex flex-row w-full items-center justify-between">
                                <div>{log.type}</div>
                                <div>{formatKST(log.created_at)}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div ref={sentinelRef} className="h-10" />

            <div className="mt-4 text-[12px] text-black/45">
              {hasMore ? "Scroll to load more…" : "No more rows."}
            </div>
          </>
        ) : isNetworkAnalyticsTab ? (
          <>
            <div className="mb-4 flex items-center justify-between w-full">
              <div className="text-[12px] text-black/55">
                Loaded logs:{" "}
                <span className="text-black">
                  {networkAnalyticsLogs.length}
                </span>{" "}
                · Users:{" "}
                <span className="text-black">{networkGrouped.length}</span>
              </div>

              {networkAnalyticsLoading && (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="text-[12px] text-black/55"
                  inline={true}
                />
              )}
            </div>

            {pageError ? (
              <div
                className="mb-4 border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
                style={{ borderRadius: 0 }}
              >
                <div>
                  <div className="font-semibold">Error</div>
                  <div className="text-black/70 mt-1">{pageError}</div>
                </div>
                <button
                  onClick={onRefresh}
                  className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                  style={{ borderRadius: 0 }}
                >
                  Retry
                </button>
              </div>
            ) : !talentNetworkFunnelSummary ? (
              <div
                className="border border-black/10 p-8 text-center text-[13px] text-black/55"
                style={{ borderRadius: 0 }}
              >
                No Talent Network data.
              </div>
            ) : (
              <>
                <div
                  className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
                  style={{ borderRadius: 0 }}
                >
                  <div className="font-semibold text-black mb-2">
                    Talent Network overview
                  </div>
                  <div className="leading-6">
                    유입 유저:{" "}
                    <span className="font-medium text-black">
                      {talentNetworkFunnelSummary.totalUsers}
                    </span>{" "}
                    · 시작 화면 도달:{" "}
                    <span className="font-medium text-black">
                      {talentNetworkFunnelSummary.onboardingStartUsers}
                    </span>{" "}
                    (
                    {formatPercent(
                      talentNetworkFunnelSummary.onboardingStartUsers,
                      talentNetworkFunnelSummary.totalUsers
                    )}
                    ) · 제출 완료:{" "}
                    <span className="font-medium text-black">
                      {talentNetworkFunnelSummary.submittedUsers}
                    </span>{" "}
                    (
                    {formatPercent(
                      talentNetworkFunnelSummary.submittedUsers,
                      talentNetworkFunnelSummary.totalUsers
                    )}
                    )
                  </div>
                </div>

                <div
                  className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
                  style={{ borderRadius: 0 }}
                >
                  <div className="font-semibold text-black mb-2">
                    A/B variant comparison
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left">
                      <thead>
                        <tr className="border-b border-black/10 text-black">
                          <th className="py-2 pr-3 font-semibold">Variant</th>
                          <th className="py-2 pr-3 font-semibold">UI</th>
                          <th className="py-2 pr-3 text-right font-semibold">
                            Users
                          </th>
                          <th className="py-2 pr-3 text-right font-semibold">
                            Start
                          </th>
                          <th className="py-2 pr-3 text-right font-semibold">
                            Submit
                          </th>
                          <th className="py-2 text-right font-semibold">
                            Submit / Start
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {talentNetworkVariantSummaries.map((item) => (
                          <tr
                            key={item.abtestType}
                            className="border-b border-black/5 align-top last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-medium text-black">
                              {item.label}
                              <div className="text-[11px] font-normal text-black/45">
                                {item.abtestType}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-black/65">
                              {getTalentNetworkVariantDescription(
                                item.abtestType
                              ) || "-"}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {item.totalUsers}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {item.onboardingStartUsers} (
                              {formatPercent(
                                item.onboardingStartUsers,
                                item.totalUsers
                              )}
                              )
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {item.submittedUsers} (
                              {formatPercent(
                                item.submittedUsers,
                                item.totalUsers
                              )}
                              )
                            </td>
                            <td className="py-2 text-right">
                              {formatPercent(
                                item.submittedUsers,
                                item.onboardingStartUsers
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
                  style={{ borderRadius: 0 }}
                >
                  <div className="font-semibold text-black mb-2">
                    Onboarding step comparison
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left">
                      <thead>
                        <tr className="border-b border-black/10 text-black">
                          <th className="py-2 pr-3 font-semibold">Step</th>
                          {talentNetworkVariantColumns.map((variant) => (
                            <th
                              key={variant.abtestType}
                              className="py-2 pr-3 text-right font-semibold"
                            >
                              {variant.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TALENT_NETWORK_ONBOARDING_STEPS.map((step) => (
                          <tr
                            key={step.step}
                            className="border-b border-black/5 last:border-b-0"
                          >
                            <td className="py-2 pr-3">
                              <span className="font-medium text-black">
                                Step {step.step}
                              </span>{" "}
                              {step.label}
                            </td>
                            {talentNetworkVariantColumns.map((variant) => {
                              const summary =
                                talentNetworkVariantSummaries.find(
                                  (item) =>
                                    item.abtestType === variant.abtestType
                                );
                              const stepSummary = summary?.steps.find(
                                (item) => item.step === step.step
                              );

                              return (
                                <td
                                  key={`${step.step}-${variant.abtestType}`}
                                  className="py-2 pr-3 text-right"
                                >
                                  {stepSummary?.userCount ?? 0} (
                                  {formatPercent(
                                    stepSummary?.userCount ?? 0,
                                    summary?.totalUsers ?? 0
                                  )}
                                  )
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  className="mb-4 border border-black/10 p-4 text-[12px] text-black/80"
                  style={{ borderRadius: 0 }}
                >
                  <div className="font-semibold text-black mb-2">
                    Button clicks by variant
                  </div>
                  {talentNetworkButtonSummary.length === 0 ? (
                    <div className="text-black/55">No button click data.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left">
                        <thead>
                          <tr className="border-b border-black/10 text-black">
                            <th className="py-2 pr-3 font-semibold">Event</th>
                            <th className="py-2 pr-3 text-right font-semibold">
                              Total Users
                            </th>
                            <th className="py-2 pr-3 text-right font-semibold">
                              Total Clicks
                            </th>
                            {talentNetworkVariantColumns.map((variant) => (
                              <th
                                key={variant.abtestType}
                                className="py-2 pr-3 text-right font-semibold"
                              >
                                {variant.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {talentNetworkButtonSummary.map((item) => (
                            <tr
                              key={item.eventType}
                              className="border-b border-black/5 align-top last:border-b-0"
                            >
                              <td className="py-2 pr-3">
                                <div className="break-all">
                                  <div className="text-black">
                                    {formatTalentNetworkEventName(
                                      item.eventType
                                    )}
                                  </div>
                                  <div className="text-[11px] text-black/45">
                                    {item.eventType}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {item.uniqueUsers}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                {item.totalClicks}
                              </td>
                              {talentNetworkVariantColumns.map((variant) => {
                                const breakdown = item.variantBreakdown.find(
                                  (entry) =>
                                    entry.abtestType === variant.abtestType
                                );

                                return (
                                  <td
                                    key={`${item.eventType}-${variant.abtestType}`}
                                    className="py-2 pr-3 text-right"
                                  >
                                    {breakdown
                                      ? `${breakdown.uniqueUsers} / ${breakdown.totalClicks}`
                                      : "0 / 0"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : isWaitlistTab ? (
          <>
            <div className="mb-4 flex items-center justify-between w-full">
              <div className="text-[12px] text-black/55">
                Rows: <span className="text-black">{waitlistRows.length}</span>
              </div>

              {waitlistLoading && (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="text-[12px] text-black/55"
                  inline={true}
                />
              )}
            </div>

            {pageError ? (
              <div
                className="border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
                style={{ borderRadius: 0 }}
              >
                <div>
                  <div className="font-semibold">Error</div>
                  <div className="text-black/70 mt-1">{pageError}</div>
                </div>
                <button
                  onClick={onRefresh}
                  className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                  style={{ borderRadius: 0 }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div
              className="border border-black/10 w-full"
              style={{ borderRadius: 0 }}
            >
              {waitlistLoading ? (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="p-6 text-[13px] text-black/55"
                />
              ) : waitlistRows.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="text-[14px] font-semibold">No rows</div>
                  <div className="text-[13px] text-black/55 mt-2">
                    No company waitlist data yet.
                  </div>
                </div>
              ) : (
                waitlistRows.map((row) => (
                  <div
                    key={`${row.email}-${row.created_at}`}
                    className="border-t border-black/10 first:border-t-0 w-full"
                  >
                    <div className="px-5 py-4 w-full">
                      <div className="flex flex-row items-start justify-between gap-4">
                        <div className="text-[14px] font-semibold break-all">
                          {row.email}
                        </div>
                        <div className="text-[12px] text-black/55 whitespace-nowrap">
                          {formatKST(row.created_at)}
                        </div>
                      </div>

                      <div className="mt-3 text-[13px] text-black/80 w-full space-y-1">
                        <div>Name: {row.name ?? "-"}</div>
                        <div className="break-all">
                          Company: {row.company ?? "-"}
                          {row.company_link ? (
                            <>
                              {" "}
                              (
                              <a
                                href={row.company_link}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                link
                              </a>
                              )
                            </>
                          ) : null}
                        </div>
                        <div>
                          Role / Size: {row.role ?? "-"} / {row.size ?? "-"}
                        </div>
                        <div>Needs: {row.needs?.join(", ") || "-"}</div>
                        <div>Main: {row.main ?? "-"}</div>
                        <div>Additional: {row.additional ?? "-"}</div>
                        <div>
                          Submit: {row.is_submit ? "Y" : "N"} · Beta Agree: ·
                          Mobile:{" "}
                          {row.is_mobile === null
                            ? "-"
                            : row.is_mobile
                              ? "Y"
                              : "N"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : isBookmarkFoldersTab ? (
          <>
            <div className="mb-4 rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4 text-[#4d3a24]">
              <div className="text-[14px] font-semibold">User lookup</div>
              <div className="mt-1 text-[12px] leading-5 text-[#7a664b]">
                이름이나 이메일로 유저를 찾고, 해당 유저의 북마크 폴더와 저장된
                후보를 확인합니다.
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={bookmarkSearch}
                  onChange={(event) => setBookmarkSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void fetchBookmarkUsers(bookmarkSearch);
                    }
                  }}
                  placeholder="이름 또는 이메일"
                  className="h-11 flex-1 rounded-[14px] border border-[#d8c7aa] bg-[#fffaf1] px-4 text-[14px] text-[#3f301f] outline-none placeholder:text-[#9e8b6d]"
                />
                <button
                  onClick={() => {
                    void fetchBookmarkUsers(bookmarkSearch);
                  }}
                  className="h-11 rounded-[14px] border border-[#5d4931] bg-[#5d4931] px-4 text-[13px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
                >
                  Search
                </button>
              </div>
              {bookmarkUsersError ? (
                <div className="mt-3 text-[12px] text-[#8d3a24]">
                  {bookmarkUsersError}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_280px_minmax(0,1fr)]">
              <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[#4d3a24]">
                      Users
                    </div>
                    <div className="mt-1 text-[12px] text-[#7a664b]">
                      {bookmarkUsers.length}명
                    </div>
                  </div>
                  {bookmarkUsersLoading ? (
                    <Loading
                      size="sm"
                      inline={true}
                      className="text-[12px] text-[#7a664b]"
                    />
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {bookmarkUsers.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      {bookmarkSearch.trim()
                        ? "일치하는 유저가 없습니다."
                        : "이름이나 이메일을 입력해 유저를 찾아보세요."}
                    </div>
                  ) : (
                    bookmarkUsers.map((user) => {
                      const isSelected =
                        selectedBookmarkUser?.userId === user.userId;

                      return (
                        <button
                          key={user.userId}
                          type="button"
                          onClick={() => {
                            void fetchBookmarkFolders(user);
                          }}
                          className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-[#8e7554] bg-[#efe1c8]"
                              : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                          }`}
                        >
                          <div className="text-[13px] font-semibold text-[#3f301f]">
                            {user.name || "(이름 없음)"}
                          </div>
                          <div className="mt-1 break-all text-[12px] text-[#7a664b]">
                            {user.email || "-"}
                          </div>
                          <div className="mt-2 text-[11px] text-[#8d7a5d]">
                            폴더 {user.folderCount} · 북마크{" "}
                            {user.bookmarkCount}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[#4d3a24]">
                      Folders
                    </div>
                    <div className="mt-1 text-[12px] text-[#7a664b]">
                      {selectedBookmarkUser
                        ? `${selectedBookmarkUser.name || selectedBookmarkUser.email || "선택된 유저"}`
                        : "유저를 먼저 선택하세요"}
                    </div>
                  </div>
                  {bookmarkFoldersLoading ? (
                    <Loading
                      size="sm"
                      inline={true}
                      className="text-[12px] text-[#7a664b]"
                    />
                  ) : null}
                </div>

                {selectedBookmarkUser ? (
                  <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3 text-[12px] leading-5 text-[#6a563c]">
                    <div>{selectedBookmarkUser.email || "-"}</div>
                    <div>
                      {selectedBookmarkUser.company || "회사 정보 없음"}
                    </div>
                  </div>
                ) : null}

                {bookmarkFoldersError ? (
                  <div className="mt-3 text-[12px] text-[#8d3a24]">
                    {bookmarkFoldersError}
                  </div>
                ) : null}

                <div className="mt-4 space-y-2">
                  {!selectedBookmarkUser ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      왼쪽에서 유저를 선택하면 폴더가 표시됩니다.
                    </div>
                  ) : bookmarkFolders.length === 0 &&
                    !bookmarkFoldersLoading ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      북마크 폴더가 없습니다.
                    </div>
                  ) : (
                    bookmarkFolders.map((folder) => {
                      const isSelected = selectedBookmarkFolderId === folder.id;

                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => {
                            if (!selectedBookmarkUser) return;
                            void fetchBookmarkFolderItems(
                              selectedBookmarkUser.userId,
                              folder.id
                            );
                          }}
                          className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-[#8e7554] bg-[#efe1c8]"
                              : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-[#3f301f]">
                                {folder.name}
                              </div>
                              <div className="mt-1 text-[11px] text-[#8d7a5d]">
                                {folder.isDefault ? "기본 폴더" : "커스텀 폴더"}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px] text-[#6a563c]">
                              {folder.itemCount}명
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[#4d3a24]">
                      Candidates
                    </div>
                    <div className="mt-1 text-[12px] text-[#7a664b]">
                      {selectedBookmarkFolder
                        ? `${selectedBookmarkFolder.name} · ${bookmarkFolderTotal}명`
                        : "폴더를 선택하면 후보 목록이 표시됩니다."}
                    </div>
                  </div>
                  {bookmarkFolderItemsLoading ? (
                    <Loading
                      size="sm"
                      inline={true}
                      className="text-[12px] text-[#7a664b]"
                    />
                  ) : null}
                </div>

                {selectedBookmarkFolder &&
                bookmarkFolderTotal > bookmarkFolderLimit ? (
                  <div className="mt-3 rounded-[14px] border border-[#dcccad] bg-[#fffaf1] px-3 py-2 text-[11px] text-[#7a664b]">
                    최근 {bookmarkFolderLimit}개만 표시합니다. 전체 저장 수는{" "}
                    {bookmarkFolderTotal}개입니다.
                  </div>
                ) : null}

                {bookmarkFolderItemsError ? (
                  <div className="mt-3 text-[12px] text-[#8d3a24]">
                    {bookmarkFolderItemsError}
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {!selectedBookmarkFolder ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      가운데에서 폴더를 선택하세요.
                    </div>
                  ) : bookmarkFolderItems.length === 0 &&
                    !bookmarkFolderItemsLoading ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      저장된 후보가 없습니다.
                    </div>
                  ) : (
                    bookmarkFolderItems.map((item) => (
                      <div
                        key={`${item.folderItemId}-${item.candidId}`}
                        className="rounded-[18px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-[15px] font-semibold text-[#3f301f]">
                              {item.name || "(이름 없음)"}
                            </div>
                            <div className="mt-1 text-[13px] leading-6 text-[#6a563c]">
                              {item.headline || "headline 없음"}
                            </div>
                            <div className="mt-2 text-[11px] text-[#8d7a5d]">
                              저장일 {formatKST(item.createdAt ?? undefined)}
                              {item.memoUpdatedAt
                                ? ` · 메모 수정 ${formatKST(item.memoUpdatedAt)}`
                                : ""}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <a
                              href={item.profileHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center rounded-[12px] border border-[#cfbb9a] bg-[#f4eadb] px-3 text-[12px] text-[#4d3a24] transition-colors hover:bg-[#eadcc7]"
                            >
                              Harper profile
                            </a>
                            {item.linkedinUrl ? (
                              <a
                                href={item.linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center rounded-[12px] border border-[#e0d0b6] bg-transparent px-3 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
                              >
                                LinkedIn
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3 text-[13px] leading-6 text-[#5b4932]">
                          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                            Memo
                          </div>
                          <div className="whitespace-pre-wrap break-words">
                            {item.memo || "유저가 남긴 메모 없음"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : isUserAnalyticsTab ? (
          <>
            <div className="mb-4 rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4 text-[#4d3a24]">
              <div className="text-[14px] font-semibold">User lookup</div>
              <div className="mt-1 text-[12px] leading-5 text-[#7a664b]">
                이름, 이메일, 회사명으로 유저를 찾고 채팅세션 수, 프로필 view,
                프로필 링크 클릭 지표를 확인합니다.
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={userAnalyticsSearch}
                  onChange={(event) =>
                    setUserAnalyticsSearch(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void fetchUserAnalyticsUsers(userAnalyticsSearch);
                    }
                  }}
                  placeholder="이름, 이메일 또는 회사명"
                  className="h-11 flex-1 rounded-[14px] border border-[#d8c7aa] bg-[#fffaf1] px-4 text-[14px] text-[#3f301f] outline-none placeholder:text-[#9e8b6d]"
                />
                <button
                  onClick={() => {
                    void fetchUserAnalyticsUsers(userAnalyticsSearch);
                  }}
                  className="h-11 rounded-[14px] border border-[#5d4931] bg-[#5d4931] px-4 text-[13px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
                >
                  Search
                </button>
              </div>
              {userAnalyticsUsersError ? (
                <div className="mt-3 text-[12px] text-[#8d3a24]">
                  {userAnalyticsUsersError}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[#4d3a24]">
                      Users
                    </div>
                    <div className="mt-1 text-[12px] text-[#7a664b]">
                      {userAnalyticsUsers.length}명
                    </div>
                  </div>
                  {userAnalyticsUsersLoading ? (
                    <Loading
                      size="sm"
                      inline={true}
                      className="text-[12px] text-[#7a664b]"
                    />
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  {userAnalyticsUsers.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      {userAnalyticsSearch.trim()
                        ? "일치하는 유저가 없습니다."
                        : "이름, 이메일 또는 회사명을 입력해 유저를 찾아보세요."}
                    </div>
                  ) : (
                    userAnalyticsUsers.map((user) => {
                      const isSelected =
                        selectedAnalyticsUser?.userId === user.userId;

                      return (
                        <button
                          key={user.userId}
                          type="button"
                          onClick={() => {
                            void fetchUserAnalyticsDetail(user);
                          }}
                          className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-[#8e7554] bg-[#efe1c8]"
                              : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                          }`}
                        >
                          <div className="text-[13px] font-semibold text-[#3f301f]">
                            {user.name || "(이름 없음)"}
                          </div>
                          <div className="mt-1 break-all text-[12px] text-[#7a664b]">
                            {user.email || "-"}
                          </div>
                          <div className="mt-2 text-[11px] text-[#8d7a5d]">
                            세션 {user.searchCount.toLocaleString("ko-KR")} ·
                            후보 {user.profileViewCount.toLocaleString("ko-KR")}{" "}
                            · 링크 {user.linkClickCount.toLocaleString("ko-KR")}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-[#4d3a24]">
                        Summary
                      </div>
                      <div className="mt-1 text-[12px] text-[#7a664b]">
                        {selectedAnalyticsUser
                          ? `${selectedAnalyticsUser.name || selectedAnalyticsUser.email || "선택된 유저"}`
                          : "유저를 먼저 선택하세요"}
                      </div>
                    </div>
                    {userAnalyticsDetailLoading ? (
                      <Loading
                        size="sm"
                        inline={true}
                        className="text-[12px] text-[#7a664b]"
                      />
                    ) : null}
                  </div>

                  {selectedAnalyticsUser ? (
                    <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3 text-[12px] leading-5 text-[#6a563c]">
                      <div>{selectedAnalyticsUser.email || "-"}</div>
                      <div>
                        {selectedAnalyticsUser.company || "회사 정보 없음"}
                      </div>
                    </div>
                  ) : null}

                  {selectedAnalyticsUser ? (
                    <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                        Date Range (KST)
                      </div>
                      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                        <input
                          type="date"
                          value={userAnalyticsStartDate}
                          onChange={(event) =>
                            setUserAnalyticsStartDate(event.target.value)
                          }
                          className="h-10 rounded-[12px] border border-[#d8c7aa] bg-[#fffaf1] px-3 text-[13px] text-[#3f301f] outline-none"
                        />
                        <div className="px-1 text-[12px] text-[#8d7a5d]">~</div>
                        <input
                          type="date"
                          value={userAnalyticsEndDate}
                          onChange={(event) =>
                            setUserAnalyticsEndDate(event.target.value)
                          }
                          className="h-10 rounded-[12px] border border-[#d8c7aa] bg-[#fffaf1] px-3 text-[13px] text-[#3f301f] outline-none"
                        />
                        <button
                          type="button"
                          onClick={applyUserAnalyticsDateRange}
                          className="h-10 rounded-[12px] border border-[#5d4931] bg-[#5d4931] px-4 text-[12px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
                        >
                          적용
                        </button>
                        <button
                          type="button"
                          onClick={resetUserAnalyticsDateRange}
                          className="h-10 rounded-[12px] border border-[#dcccad] bg-transparent px-4 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
                        >
                          전체
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {userAnalyticsDetailError ? (
                    <div className="mt-3 text-[12px] text-[#8d3a24]">
                      {userAnalyticsDetailError}
                    </div>
                  ) : null}

                  {!selectedAnalyticsUser ? (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-10 text-center text-[12px] leading-5 text-[#8d7a5d]">
                      왼쪽에서 유저를 선택하면 검색/프로필 지표가 표시됩니다.
                    </div>
                  ) : userAnalyticsSummary ? (
                    <>
                      <div className="mt-4">
                        <div className="text-[12px] font-semibold text-[#6a563c]">
                          기간별 지표
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              채팅세션 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.searchCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              검색 횟수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.runCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              채팅 자체의 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.chatMessageCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              페이지 조회수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.pageViewCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              프로필 본 후보자 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.uniqueProfilesViewed.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              링크 클릭 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.linkClickCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              페이지 / 세션
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {formatDecimal(
                                userAnalyticsSummary.pageViewsPerSearch
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              후보자 수 / 세션
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {formatDecimal(
                                userAnalyticsSummary.profileViewsPerSearch
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[12px] font-semibold text-[#6a563c]">
                          누적 지표
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              마크 준 사람 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.markedCandidateCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              폴더에 넣은 사람 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.bookmarkedCandidateCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                          <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              메모 남긴 수
                            </div>
                            <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">
                              {userAnalyticsSummary.memoCount.toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-[#4d3a24]">
                        Profiles
                      </div>
                      <div className="mt-1 text-[12px] text-[#7a664b]">
                        {selectedAnalyticsUser
                          ? `프로필 view 또는 링크 클릭이 있었던 후보 ${userAnalyticsProfiles.length}명`
                          : "유저를 선택하면 프로필별 상세가 표시됩니다."}
                      </div>
                    </div>
                    {userAnalyticsDetailLoading ? (
                      <Loading
                        size="sm"
                        inline={true}
                        className="text-[12px] text-[#7a664b]"
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    {!selectedAnalyticsUser ? (
                      <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                        왼쪽에서 유저를 선택하세요.
                      </div>
                    ) : userAnalyticsProfiles.length === 0 &&
                      !userAnalyticsDetailLoading ? (
                      <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                        프로필 view 또는 링크 클릭 데이터가 없습니다.
                      </div>
                    ) : (
                      userAnalyticsProfiles.map((profile) => (
                        <div
                          key={profile.candidId}
                          className="rounded-[18px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-[15px] font-semibold text-[#3f301f]">
                                {profile.name || "(이름 없음)"}
                              </div>
                              <div className="mt-1 text-[13px] leading-6 text-[#6a563c]">
                                {profile.headline || profile.candidId}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <a
                                href={profile.profileHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center rounded-[12px] border border-[#cfbb9a] bg-[#f4eadb] px-3 text-[12px] text-[#4d3a24] transition-colors hover:bg-[#eadcc7]"
                              >
                                Harper profile
                              </a>
                              {profile.linkedinUrl ? (
                                <a
                                  href={profile.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-9 items-center rounded-[12px] border border-[#e0d0b6] bg-transparent px-3 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
                                >
                                  LinkedIn
                                </a>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                                Profile Views
                              </div>
                              <div className="mt-2 text-[20px] font-semibold text-[#3f301f]">
                                {profile.profileViewCount.toLocaleString(
                                  "ko-KR"
                                )}
                              </div>
                            </div>
                            <div className="rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                                Link Clicks
                              </div>
                              <div className="mt-2 text-[20px] font-semibold text-[#3f301f]">
                                {profile.totalLinkClickCount.toLocaleString(
                                  "ko-KR"
                                )}
                              </div>
                            </div>
                            <div className="rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                                Link Hosts
                              </div>
                              <div className="mt-2 text-[20px] font-semibold text-[#3f301f]">
                                {profile.linkClicks.length.toLocaleString(
                                  "ko-KR"
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3 text-[13px] leading-6 text-[#5b4932]">
                            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                              Link Click Breakdown
                            </div>
                            {profile.linkClicks.length === 0 ? (
                              <div className="text-[#8d7a5d]">
                                링크 클릭 데이터가 없습니다.
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {profile.linkClicks.map((item) => (
                                  <div
                                    key={`${profile.candidId}-${item.host}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-[#dcccad] bg-[#fffaf1] px-3 py-1 text-[12px] text-[#6a563c]"
                                  >
                                    <span>{item.host}</span>
                                    <span className="font-semibold text-[#3f301f]">
                                      {item.count.toLocaleString("ko-KR")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              className="mb-4 border border-black/10 p-4 text-[13px] text-black/80"
              style={{ borderRadius: 0 }}
            >
              <div className="font-semibold text-black mb-1">Blog summary</div>
              <div className="leading-6">
                글 수:{" "}
                <span className="text-black font-medium">
                  {blogMetricsSummary.totalPosts}
                </span>{" "}
                · 조회수 합계:{" "}
                <span className="text-black font-medium">
                  {blogMetricsSummary.totalViews}
                </span>{" "}
                · 전환수 합계:{" "}
                <span className="text-black font-medium">
                  {blogMetricsSummary.totalConversions}
                </span>
              </div>
            </div>

            {pageError ? (
              <div
                className="border border-black/15 bg-black/[0.02] p-4 text-[13px] flex items-start justify-between gap-4"
                style={{ borderRadius: 0 }}
              >
                <div>
                  <div className="font-semibold">Error</div>
                  <div className="text-black/70 mt-1">{pageError}</div>
                </div>
                <button
                  onClick={onRefresh}
                  className="h-9 px-3 text-[13px] border border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                  style={{ borderRadius: 0 }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div
              className="border border-black/10 w-full"
              style={{ borderRadius: 0 }}
            >
              {blogMetricsLoading ? (
                <Loading
                  size="sm"
                  label="Loading…"
                  className="p-6 text-[13px] text-black/55"
                />
              ) : blogMetricRows.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="text-[14px] font-semibold">No rows</div>
                  <div className="text-[13px] text-black/55 mt-2">
                    No blog metric logs yet.
                  </div>
                </div>
              ) : (
                <div className="w-full">
                  <div className="grid grid-cols-[1.8fr_0.9fr_0.9fr] gap-2 px-5 py-3 border-b border-black/10 text-[12px] font-semibold text-black/80">
                    <div>Slug</div>
                    <div className="text-right">Views</div>
                    <div className="text-right">Conversions</div>
                  </div>
                  {blogMetricRows.map((row) => (
                    <div
                      key={row.slug}
                      className="grid grid-cols-[1.8fr_0.9fr_0.9fr] gap-2 px-5 py-3 border-t border-black/10 first:border-t-0 text-[13px]"
                    >
                      <div className="break-all">{row.slug}</div>
                      <div className="text-right">{row.viewCount}</div>
                      <div className="text-right">{row.conversionCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
