import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AdminAccessGuard from "@/components/admin/AdminAccessGuard";
import AdminMetricsNavigation from "@/components/admin/AdminMetricsNavigation";
import AdminMetricsExcludedEmails from "@/components/admin/metrics/AdminMetricsExcludedEmails";
import AdminMetricsTab from "@/components/admin/metrics/AdminMetricsTab";
import { useAdminMetricsStore } from "@/components/admin/metrics/useAdminMetricsStore";
import AdminBlogMetricsTab from "@/components/admin/tabs/AdminBlogMetricsTab";
import AdminBookmarkFoldersTab from "@/components/admin/tabs/AdminBookmarkFoldersTab";
import AdminUserAnalyticsTab from "@/components/admin/tabs/AdminUserAnalyticsTab";
import type {
  AdminBookmarkFolder,
  AdminBookmarkFolderItem,
  AdminBookmarkUser,
  AdminTab,
  AdminUserAnalyticsProfile,
  AdminUserAnalyticsSummary,
  AdminUserAnalyticsUser,
  BlogMetricRow,
} from "@/components/admin/types";
import { showToast } from "@/components/toast/toast";
import { BareButton } from "@/components/ui/button";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";
import {
  BLOG_CONVERSION_EVENT_PREFIX,
  BLOG_VIEW_EVENT_PREFIX,
} from "@/lib/blogMetrics";
import { supabase } from "@/lib/supabase";

const BLOG_METRIC_FETCH_BATCH_SIZE = 1000;

const SEARCH_ADMIN_TABS: AdminTab[] = [
  "metrics",
  "blogMetrics",
  "bookmarkFolders",
  "userAnalytics",
];

const SEARCH_ADMIN_TAB_META: Record<
  AdminTab,
  {
    label: string;
    title: string;
    subtitle: string;
  }
> = {
  metrics: {
    label: "Product Metrics",
    title: "Search Product Metrics",
    subtitle: "search 제품의 기간별 핵심 지표 차트입니다.",
  },
  blogMetrics: {
    label: "Blog Metrics",
    title: "Blog Metrics",
    subtitle: "blog slug 기준 조회와 전환을 집계합니다.",
  },
  bookmarkFolders: {
    label: "Bookmark Folders",
    title: "Bookmark Folders",
    subtitle: "유저별 북마크 폴더와 저장 후보를 조회합니다.",
  },
  userAnalytics: {
    label: "User Analytics",
    title: "User Analytics",
    subtitle: "company_users 기준 검색, 프로필, 링크 클릭 지표를 조회합니다.",
  },
};

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeSearchAdminTab(value: string | string[] | undefined) {
  const normalized = readQueryValue(value).trim();
  return SEARCH_ADMIN_TABS.includes(normalized as AdminTab)
    ? (normalized as AdminTab)
    : "metrics";
}

function extractSlugFromEventType(type: string, prefix: string) {
  if (!type.startsWith(prefix)) return null;
  const slug = type.slice(prefix.length).trim();
  return slug.length > 0 ? slug : null;
}

type AdminIndexContentProps = {
  canAccessAdminData: true;
};

const AdminIndexContent = ({ canAccessAdminData }: AdminIndexContentProps) => {
  const router = useRouter();
  const activeTab = normalizeSearchAdminTab(router.query.tab);
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
  const [metricsRefreshToken, setMetricsRefreshToken] = useState(0);
  const [isExcludedEmailsModalOpen, setIsExcludedEmailsModalOpen] =
    useState(false);
  const { excludedEmails, setExcludedEmails, resetExcludedEmails } =
    useAdminMetricsStore();

  useEffect(() => {
    if (!router.isReady) return;

    const rawSection = readQueryValue(router.query.section).trim();
    const rawTab = readQueryValue(router.query.tab).trim();
    const isCanonical =
      (rawSection === "" || rawSection === "search") &&
      SEARCH_ADMIN_TABS.includes(rawTab as AdminTab);

    if (isCanonical || (rawSection === "" && rawTab === "")) return;

    void router.replace(
      {
        pathname: "/admin",
        query: {
          section: "search",
          tab: activeTab,
        },
      },
      undefined,
      { shallow: true }
    );
  }, [activeTab, router]);

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

      if (rows.length < BLOG_METRIC_FETCH_BATCH_SIZE) break;
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
          conversionCount: 0,
          slug,
          viewCount: 0,
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
          conversionCount: 0,
          slug,
          viewCount: 0,
        };
        prev.conversionCount += 1;
        counter.set(slug, prev);
      }

      setBlogMetricRows(
        Array.from(counter.values()).sort((a, b) => {
          if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
          if (b.conversionCount !== a.conversionCount) {
            return b.conversionCount - a.conversionCount;
          }
          return a.slug.localeCompare(b.slug);
        })
      );
      setBlogMetricsLoaded(true);
    } catch (e: any) {
      setBlogMetricsError(e?.message ?? "Failed to load blog metrics");
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
      const json: any = await res.json();
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
      const json: any = await res.json();
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
          folderId: String(folderId),
          userId,
        });
        const res = await fetch(`/api/admin/bookmark-folders?${params}`, {
          headers: {
            "x-admin-password": ADMIN_PAGE_PASSWORD,
          },
        });
        const json: any = await res.json();
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
      const json: any = await res.json();
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
        if (effectiveStartDate) params.set("startDate", effectiveStartDate);
        if (effectiveEndDate) params.set("endDate", effectiveEndDate);

        const res = await fetch(`/api/admin/user-analytics?${params}`, {
          headers: {
            "x-admin-password": ADMIN_PAGE_PASSWORD,
          },
        });
        const json: any = await res.json();
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
            linkClickCount:
              summary?.linkClickCount ?? user.linkClickCount ?? 0,
            profileViewCount:
              summary?.profileViewCount ?? user.profileViewCount ?? 0,
            searchCount: summary?.searchCount ?? user.searchCount ?? 0,
            userId: String(
              (json.user as { userId?: string })?.userId ?? user.userId
            ),
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
      endDate: "",
      startDate: "",
    });
  }, [fetchUserAnalyticsDetail, selectedAnalyticsUser]);

  useEffect(() => {
    if (!canAccessAdminData) return;
    if (activeTab !== "blogMetrics") return;
    if (blogMetricsLoaded || blogMetricsLoading || blogMetricsError) return;
    const timeoutId = window.setTimeout(() => {
      void fetchBlogMetrics();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeTab,
    blogMetricsError,
    blogMetricsLoaded,
    blogMetricsLoading,
    canAccessAdminData,
    fetchBlogMetrics,
  ]);

  const onRefresh = async () => {
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
    if (activeTab === "bookmarkFolders") {
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
      return;
    }

    setMetricsRefreshToken((current) => current + 1);
  };

  const saveExcludedEmails = useCallback(
    (value: string) => {
      const nextValue = normalizeExcludedEmails(value);
      setExcludedEmails(nextValue);
      setIsExcludedEmailsModalOpen(false);
      showToast({
        message: `Excluded emails saved (${nextValue.length})`,
        variant: "white",
      });
    },
    [setExcludedEmails]
  );

  const resetExcludedEmailSettings = useCallback(() => {
    resetExcludedEmails();
    setIsExcludedEmailsModalOpen(false);
    showToast({
      message: "Excluded emails reset to defaults",
      variant: "white",
    });
  }, [resetExcludedEmails]);

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
      totalConversions,
      totalPosts,
      totalViews,
    };
  }, [blogMetricRows]);

  const selectedBookmarkFolder = useMemo(
    () =>
      bookmarkFolders.find(
        (folder) => folder.id === selectedBookmarkFolderId
      ) ?? null,
    [bookmarkFolders, selectedBookmarkFolderId]
  );

  const isBlogMetricsTab = activeTab === "blogMetrics";
  const isBookmarkFoldersTab = activeTab === "bookmarkFolders";
  const isUserAnalyticsTab = activeTab === "userAnalytics";
  const isMetricsTab = activeTab === "metrics";
  const activeTabMeta = SEARCH_ADMIN_TAB_META[activeTab];
  const isLoading = isBlogMetricsTab
    ? blogMetricsLoading
    : isBookmarkFoldersTab
      ? bookmarkUsersLoading ||
        bookmarkFoldersLoading ||
        bookmarkFolderItemsLoading
      : isUserAnalyticsTab
        ? userAnalyticsUsersLoading || userAnalyticsDetailLoading
        : false;
  const pageError = isBlogMetricsTab ? blogMetricsError : null;

  return (
    <>
      <Head>
        <title>{activeTabMeta.title} | Harper Admin</title>
      </Head>

      <main className="min-h-screen bg-white text-black font-inter">
        <AdminMetricsNavigation
          activeSection="search"
          title={activeTabMeta.title}
          subtitle={activeTabMeta.subtitle}
          tabs={SEARCH_ADMIN_TABS.map((tab) => ({
            active: activeTab === tab,
            href: `/admin?section=search&tab=${tab}`,
            label: SEARCH_ADMIN_TAB_META[tab].label,
          }))}
          actions={
            <>
              <BareButton
                type="button"
                onClick={() => setIsExcludedEmailsModalOpen(true)}
                className="h-9 border border-black/15 px-3 text-[13px] hover:border-black/30 hover:bg-black/[0.03]"
              >
                Excluded emails ({excludedEmails.length})
              </BareButton>
              <BareButton
                type="button"
                onClick={() => void onRefresh()}
                className="h-9 border border-black/15 px-3 text-[13px] hover:border-black/30 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              >
                Refresh
              </BareButton>
            </>
          }
        />

        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-6">
          {isMetricsTab ? (
            <AdminMetricsTab
              enabled={canAccessAdminData && isMetricsTab}
              refreshToken={metricsRefreshToken}
            />
          ) : isBlogMetricsTab ? (
            <AdminBlogMetricsTab
              summary={blogMetricsSummary}
              rows={blogMetricRows}
              loading={blogMetricsLoading}
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
                void fetchBookmarkFolderItems(
                  selectedBookmarkUser.userId,
                  folder.id
                );
              }}
              items={bookmarkFolderItems}
              itemsLoading={bookmarkFolderItemsLoading}
              itemsError={bookmarkFolderItemsError}
              itemTotal={bookmarkFolderTotal}
              itemLimit={bookmarkFolderLimit}
            />
          ) : (
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
          )}
        </div>

        {isExcludedEmailsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8">
            <BareButton
              type="button"
              aria-label="Close excluded emails modal"
              className="absolute inset-0 bg-black/35"
              onClick={() => setIsExcludedEmailsModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-[640px] border border-black/15 bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[15px] font-semibold text-black">
                    Excluded emails
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-black/60">
                    Search Metrics와 Career Metrics가 같은 제외 이메일 목록을
                    공유합니다.
                  </div>
                </div>
                <BareButton
                  type="button"
                  onClick={() => setIsExcludedEmailsModalOpen(false)}
                  className="h-9 border border-black/15 px-3 text-[12px] text-black hover:border-black/30 hover:bg-black/[0.03]"
                >
                  Close
                </BareButton>
              </div>

              <AdminMetricsExcludedEmails
                excludedEmails={excludedEmails}
                onSave={saveExcludedEmails}
                onReset={resetExcludedEmailSettings}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
};

const AdminPage = () => (
  <AdminAccessGuard>
    {({ canAccessAdminData }) => (
      <AdminIndexContent canAccessAdminData={canAccessAdminData} />
    )}
  </AdminAccessGuard>
);

export default AdminPage;
