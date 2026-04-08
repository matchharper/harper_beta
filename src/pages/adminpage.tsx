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
import AdminMetricsTab from "@/components/admin/metrics/AdminMetricsTab";
import AdminBlogMetricsTab from "@/components/admin/tabs/AdminBlogMetricsTab";
import AdminBookmarkFoldersTab from "@/components/admin/tabs/AdminBookmarkFoldersTab";
import AdminLandingLogsTab from "@/components/admin/tabs/AdminLandingLogsTab";
import AdminNetworkAnalyticsTab from "@/components/admin/tabs/AdminNetworkAnalyticsTab";
import AdminUserAnalyticsTab from "@/components/admin/tabs/AdminUserAnalyticsTab";
import AdminWaitlistCompanyTab from "@/components/admin/tabs/AdminWaitlistCompanyTab";
import type {
  AbtestSummary,
  AdminBookmarkFolder,
  AdminBookmarkFolderItem,
  AdminBookmarkUser,
  AdminTab,
  AdminUserAnalyticsProfile,
  AdminUserAnalyticsSummary,
  AdminUserAnalyticsUser,
  BlogMetricRow,
  GroupedLogs,
  LandingLog,
  SectionProgressSummary,
  TalentNetworkButtonSummary,
  TalentNetworkFunnelSummary,
  TalentNetworkVariantFunnelSummary,
  WaitlistCompany,
} from "@/components/admin/types";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import {
  BLOG_CONVERSION_EVENT_PREFIX,
  BLOG_VIEW_EVENT_PREFIX,
} from "@/lib/blogMetrics";
import {
  TALENT_NETWORK_ABTEST_TYPE_A,
  TALENT_NETWORK_ABTEST_TYPE_B,
  TALENT_NETWORK_ABTEST_TYPE_A_V1,
  TALENT_NETWORK_ABTEST_TYPE_B_V1,
  TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT,
  TALENT_NETWORK_ANALYTICS_ABTEST_TYPES,
  TALENT_NETWORK_CLICK_EVENT_PREFIX,
  TALENT_NETWORK_LEGACY_ABTEST_TYPE,
  TALENT_NETWORK_ONBOARDING_STEPS,
  TALENT_NETWORK_SUBMIT_COMPLETED_EVENT,
  getTalentNetworkVariantLabel,
} from "@/lib/talentNetwork";

const PAGE_SIZE = 50;
const BLOG_METRIC_FETCH_BATCH_SIZE = 1000;

const ADMIN_TAB_META: Record<
  AdminTab,
  {
    label: string;
    title: string;
    subtitle: string;
  }
> = {
  landingLogs: {
    label: "Landing Logs",
    title: "Landing Logs Admin",
    subtitle: "local_id 기준 · 액션 타임라인",
  },
  networkAnalytics: {
    label: "Network",
    title: "Network Analytics Admin",
    subtitle: "Talent Network A/B test · funnel · button clicks",
  },
  waitlistCompany: {
    label: "Waitlist Company",
    title: "Waitlist Company Admin",
    subtitle: "harper_waitlist_company 목록",
  },
  blogMetrics: {
    label: "Blog Metrics",
    title: "Blog Metrics Admin",
    subtitle: "blog slug 기준 조회/전환 집계",
  },
  bookmarkFolders: {
    label: "Bookmark Folders",
    title: "Bookmark Folder Admin",
    subtitle: "유저별 북마크 폴더와 저장 후보 조회",
  },
  userAnalytics: {
    label: "User Analytics",
    title: "User Analytics Admin",
    subtitle: "company_users 기준 검색/프로필/링크 클릭 지표 조회",
  },
  metrics: {
    label: "Metrics",
    title: "Metrics Admin",
    subtitle: "기간별 제품 지표 차트",
  },
};

const ADMIN_TAB_ORDER: AdminTab[] = [
  "landingLogs",
  "networkAnalytics",
  "waitlistCompany",
  "blogMetrics",
  "bookmarkFolders",
  "userAnalytics",
  "metrics",
];

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

const TALENT_NETWORK_VARIANT_SORT_ORDER: Record<string, number> = {
  [TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT]: 0,
  [TALENT_NETWORK_ABTEST_TYPE_A]: 1,
  [TALENT_NETWORK_ABTEST_TYPE_B]: 2,
  [TALENT_NETWORK_ABTEST_TYPE_A_V1]: 3,
  [TALENT_NETWORK_ABTEST_TYPE_B_V1]: 4,
  [TALENT_NETWORK_LEGACY_ABTEST_TYPE]: 5,
  unknown: 6,
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
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT) {
    return "v1 B rolled out to 100%";
  }
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_A) {
    return "v2 test A";
  }
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_B) {
    return "v2 test B";
  }
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_A_V1) {
    return "v1 test A";
  }
  if (abtestType === TALENT_NETWORK_ABTEST_TYPE_B_V1) {
    return "v1 test B";
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
  const { user, loading: authLoading, init } = useAuthStore();
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
  const [searchLandingRefreshToken, setSearchLandingRefreshToken] = useState(0);
  const [metricsRefreshToken, setMetricsRefreshToken] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isInternalAdmin = isInternalEmail(user?.email);
  const canAccessAdminData = !authLoading && isInternalAdmin && isPassed;

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (authLoading) return;
    if (!isInternalAdmin) {
      setIsPassed(false);
      return;
    }

    const savedPassword = localStorage.getItem("admin_password");
    setIsPassed(savedPassword === ADMIN_PAGE_PASSWORD);
  }, [authLoading, isInternalAdmin]);

  const fetchPage = useCallback(
    async ({ reset }: { reset: boolean }) => {
      if (!canAccessAdminData) return;
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
    [canAccessAdminData, cursor, hasMore, loadingMore]
  );

  useEffect(() => {
    if (!canAccessAdminData) return;
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdminData]);

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
    if (!canAccessAdminData) return;
    if (activeTab !== "waitlistCompany") return;
    if (waitlistLoaded || waitlistLoading || waitlistError) return;
    fetchWaitlistCompanies();
  }, [
    activeTab,
    canAccessAdminData,
    fetchWaitlistCompanies,
    waitlistLoaded,
    waitlistLoading,
    waitlistError,
  ]);

  useEffect(() => {
    if (!canAccessAdminData) return;
    if (activeTab !== "blogMetrics") return;
    if (blogMetricsLoaded || blogMetricsLoading || blogMetricsError) return;
    fetchBlogMetrics();
  }, [
    activeTab,
    canAccessAdminData,
    blogMetricsLoaded,
    blogMetricsLoading,
    blogMetricsError,
    fetchBlogMetrics,
  ]);

  useEffect(() => {
    if (!canAccessAdminData) return;
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
  }, [activeTab, canAccessAdminData, fetchPage]);

  useEffect(() => {
    if (!canAccessAdminData) return;
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
    canAccessAdminData,
    fetchNetworkAnalyticsLogs,
    networkAnalyticsError,
    networkAnalyticsLoaded,
    networkAnalyticsLoading,
  ]);

  const onRefresh = async () => {
    if (activeTab === "landingLogs") {
      await fetchPage({ reset: true });
      setSearchLandingRefreshToken((current) => current + 1);
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
    if (activeTab === "metrics") {
      setMetricsRefreshToken((current) => current + 1);
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
    if (!isInternalAdmin) {
      showToast({
        message: "matchharper.com 계정으로 로그인한 사용자만 접근할 수 있습니다.",
        variant: "white",
      });
      return;
    }

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
    const uniqueVariants = Array.from(networkGroupsByVariant.keys()).sort(
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
  const isMetricsTab = activeTab === "metrics";
  const activeTabMeta = ADMIN_TAB_META[activeTab];
  const pageTitle = activeTabMeta.title;
  const pageSubTitle = activeTabMeta.subtitle;
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
            : isUserAnalyticsTab
              ? userAnalyticsUsersLoading || userAnalyticsDetailLoading
              : false;
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white text-black font-inter">
        <div className="flex h-screen items-center justify-center">
          <Loading label="Checking admin access..." size="lg" />
        </div>
      </div>
    );
  }

  if (!isInternalAdmin) {
    return (
      <div className="min-h-screen bg-white text-black font-inter">
        <div className="flex h-screen items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="text-lg font-semibold">Admin Access Restricted</div>
            <div className="mt-3 text-sm leading-6 text-black/65">
              `/adminpage` is only available to signed-in users with a
              `matchharper.com` email.
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              {ADMIN_TAB_ORDER.map((tabKey) => {
                const isActive = activeTab === tabKey;

                return (
                  <button
                    key={tabKey}
                    onClick={() => setActiveTab(tabKey)}
                    className={`h-8 px-3 text-[12px] border ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-black/15 hover:border-black/30 hover:bg-black/[0.03]"
                    }`}
                    style={{ borderRadius: 0 }}
                  >
                    {ADMIN_TAB_META[tabKey].label}
                  </button>
                );
              })}
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
          <AdminLandingLogsTab
            canAccessAdminData={canAccessAdminData}
            searchLandingRefreshToken={searchLandingRefreshToken}
            landingSummary={landingSummary}
            abtestSummary={abtestSummary}
            sectionProgressSummary={sectionProgressSummary}
            logs={logs}
            grouped={grouped}
            loading={loading}
            loadingMore={loadingMore}
            error={pageError}
            hasMore={hasMore}
            sentinelRef={sentinelRef}
            onRefresh={onRefresh}
          />
        ) : isNetworkAnalyticsTab ? (
          <AdminNetworkAnalyticsTab
            logs={networkAnalyticsLogs}
            grouped={networkGrouped}
            loading={networkAnalyticsLoading}
            error={pageError}
            funnelSummary={talentNetworkFunnelSummary}
            variantSummaries={talentNetworkVariantSummaries}
            variantColumns={talentNetworkVariantColumns}
            buttonSummary={talentNetworkButtonSummary}
            getVariantDescription={getTalentNetworkVariantDescription}
            onRefresh={onRefresh}
          />
        ) : isWaitlistTab ? (
          <AdminWaitlistCompanyTab
            rows={waitlistRows}
            loading={waitlistLoading}
            error={pageError}
            onRefresh={onRefresh}
          />
        ) : isBookmarkFoldersTab ? (
          <AdminBookmarkFoldersTab
            search={bookmarkSearch}
            onSearchChange={setBookmarkSearch}
            onSearchSubmit={() => {
              void fetchBookmarkUsers(bookmarkSearch);
            }}
            users={bookmarkUsers}
            usersLoading={bookmarkUsersLoading}
            usersError={bookmarkUsersError}
            selectedUser={selectedBookmarkUser}
            onSelectUser={(user) => {
              void fetchBookmarkFolders(user);
            }}
            folders={bookmarkFolders}
            foldersLoading={bookmarkFoldersLoading}
            foldersError={bookmarkFoldersError}
            selectedFolderId={selectedBookmarkFolderId}
            selectedFolder={selectedBookmarkFolder}
            onSelectFolder={(folder) => {
              if (!selectedBookmarkUser) return;
              void fetchBookmarkFolderItems(selectedBookmarkUser.userId, folder.id);
            }}
            items={bookmarkFolderItems}
            itemsLoading={bookmarkFolderItemsLoading}
            itemsError={bookmarkFolderItemsError}
            itemTotal={bookmarkFolderTotal}
            itemLimit={bookmarkFolderLimit}
          />
        ) : isBlogMetricsTab ? (
          <AdminBlogMetricsTab
            summary={blogMetricsSummary}
            rows={blogMetricRows}
            loading={blogMetricsLoading}
            error={pageError}
            onRefresh={onRefresh}
          />
        ) : isUserAnalyticsTab ? (
          <AdminUserAnalyticsTab
            search={userAnalyticsSearch}
            onSearchChange={setUserAnalyticsSearch}
            onSearchSubmit={() => {
              void fetchUserAnalyticsUsers(userAnalyticsSearch);
            }}
            users={userAnalyticsUsers}
            usersLoading={userAnalyticsUsersLoading}
            usersError={userAnalyticsUsersError}
            selectedUser={selectedAnalyticsUser}
            onSelectUser={(user) => {
              void fetchUserAnalyticsDetail(user);
            }}
            summary={userAnalyticsSummary}
            profiles={userAnalyticsProfiles}
            detailLoading={userAnalyticsDetailLoading}
            detailError={userAnalyticsDetailError}
            startDate={userAnalyticsStartDate}
            endDate={userAnalyticsEndDate}
            onStartDateChange={setUserAnalyticsStartDate}
            onEndDateChange={setUserAnalyticsEndDate}
            onApplyDateRange={applyUserAnalyticsDateRange}
            onResetDateRange={resetUserAnalyticsDateRange}
          />
        ) : (
          <AdminMetricsTab
            enabled={canAccessAdminData && isMetricsTab}
            refreshToken={metricsRefreshToken}
          />
        )}
      </div>
    </div>
  );
};

export default AdminPage;
