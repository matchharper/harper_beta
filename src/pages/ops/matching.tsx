import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import OpsShell from "@/components/ops/OpsShell";
import { MatchingHarperReviewBoard } from "@/components/ops/matching/MatchingHarperReviewBoard";
import { MatchingTalentBrowser } from "@/components/ops/matching/MatchingTalentBrowser";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Select as UiSelect } from "@/components/ui/select";
import {
  useOpsMatchingCompanies,
  useOpsMatchingRoles,
} from "@/hooks/ops/useOpsMatching";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type OpsMatchingStageTabId,
  type OpsMatchingUrlState,
  useOpsMatchingStore,
} from "@/store/useOpsMatchingStore";
import { Building2, LoaderCircle } from "lucide-react";
import type { ParsedUrlQuery } from "querystring";

const MATCHING_STAGE_TABS = [
  { count: null, id: "all", label: "All" },
  { count: 0, id: "harper_review", label: "Harper Review" },
  { count: 0, id: "active", label: "Active" },
  { count: 0, id: "offered", label: "Offered" },
  { count: 0, id: "archived", label: "Archived" },
] as const satisfies readonly {
  count: number | null;
  id: OpsMatchingStageTabId;
  label: string;
}[];

function firstQueryValue(value: ParsedUrlQuery[string]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseTagsParam(value: ParsedUrlQuery[string]) {
  return firstQueryValue(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseMatchingTab(
  value: ParsedUrlQuery[string]
): OpsMatchingStageTabId {
  const normalized = firstQueryValue(value);
  if (
    normalized === "active" ||
    normalized === "all" ||
    normalized === "harper_review" ||
    normalized === "offered" ||
    normalized === "archived"
  ) {
    return normalized;
  }
  return "all";
}

function parseMatchingUrlState(query: ParsedUrlQuery) {
  const relevantKeys = [
    "allFrom",
    "allTags",
    "allTo",
    "company",
    "reviewFrom",
    "reviewTags",
    "reviewTo",
    "role",
    "tab",
  ];
  const hasUrlState = relevantKeys.some((key) => key in query);

  return {
    hasUrlState,
    state: {
      activeTab: parseMatchingTab(query.tab),
      allCreatedFrom: firstQueryValue(query.allFrom),
      allCreatedTo: firstQueryValue(query.allTo),
      allTagFilters: parseTagsParam(query.allTags),
      reviewRecommendedFrom: firstQueryValue(query.reviewFrom),
      reviewRecommendedTo: firstQueryValue(query.reviewTo),
      reviewTagFilters: parseTagsParam(query.reviewTags),
      selectedCompanyId: firstQueryValue(query.company),
      selectedRoleId: firstQueryValue(query.role),
    } satisfies OpsMatchingUrlState,
  };
}

function buildMatchingUrlQuery(state: OpsMatchingUrlState) {
  const query: Record<string, string> = {
    tab: state.activeTab,
  };
  if (state.selectedCompanyId) query.company = state.selectedCompanyId;
  if (state.selectedRoleId) query.role = state.selectedRoleId;
  if (state.allCreatedFrom) query.allFrom = state.allCreatedFrom;
  if (state.allCreatedTo) query.allTo = state.allCreatedTo;
  if (state.allTagFilters.length > 0) {
    query.allTags = state.allTagFilters.join(",");
  }
  if (state.reviewRecommendedFrom) {
    query.reviewFrom = state.reviewRecommendedFrom;
  }
  if (state.reviewRecommendedTo) query.reviewTo = state.reviewRecommendedTo;
  if (state.reviewTagFilters.length > 0) {
    query.reviewTags = state.reviewTagFilters.join(",");
  }
  return query;
}

function EmptyStagePanel({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-16 text-center">
      <div className="text-sm font-medium text-neutral-primary">{label}</div>
      <div className="mt-2 text-sm text-neutral-muted">
        이 단계는 아직 비어 있습니다.
      </div>
    </div>
  );
}

export default function OpsMatchingPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const hasInitializedUrlStateRef = useRef(false);
  const activeTab = useOpsMatchingStore((state) => state.activeTab);
  const allCreatedFrom = useOpsMatchingStore((state) => state.allCreatedFrom);
  const allCreatedTo = useOpsMatchingStore((state) => state.allCreatedTo);
  const allTagFilters = useOpsMatchingStore((state) => state.allTagFilters);
  const hasHydrated = useOpsMatchingStore((state) => state.hasHydrated);
  const reviewRecommendedFrom = useOpsMatchingStore(
    (state) => state.reviewRecommendedFrom
  );
  const reviewRecommendedTo = useOpsMatchingStore(
    (state) => state.reviewRecommendedTo
  );
  const reviewTagFilters = useOpsMatchingStore(
    (state) => state.reviewTagFilters
  );
  const selectedCompanyId = useOpsMatchingStore(
    (state) => state.selectedCompanyId
  );
  const selectedRoleId = useOpsMatchingStore((state) => state.selectedRoleId);
  const setActiveTab = useOpsMatchingStore((state) => state.setActiveTab);
  const setAllCreatedDateRange = useOpsMatchingStore(
    (state) => state.setAllCreatedDateRange
  );
  const setAllTagFilters = useOpsMatchingStore(
    (state) => state.setAllTagFilters
  );
  const setReviewRecommendedDateRange = useOpsMatchingStore(
    (state) => state.setReviewRecommendedDateRange
  );
  const setReviewTagFilters = useOpsMatchingStore(
    (state) => state.setReviewTagFilters
  );
  const setSelectedCompanyId = useOpsMatchingStore(
    (state) => state.setSelectedCompanyId
  );
  const setSelectedRoleId = useOpsMatchingStore(
    (state) => state.setSelectedRoleId
  );
  const setStateFromUrl = useOpsMatchingStore((state) => state.setStateFromUrl);
  const companiesQuery = useOpsMatchingCompanies({
    enabled: canFetchInternal,
  });
  const companies = useMemo(
    () => companiesQuery.data?.items ?? [],
    [companiesQuery.data?.items]
  );
  const selectedCompanyExists = companies.some(
    (company) => company.companyWorkspaceId === selectedCompanyId
  );
  const effectiveCompanyId = selectedCompanyExists
    ? selectedCompanyId
    : companies[0]?.companyWorkspaceId || "";
  const rolesQuery = useOpsMatchingRoles({
    companyWorkspaceId: effectiveCompanyId,
    enabled: canFetchInternal && Boolean(effectiveCompanyId),
  });
  const roles = useMemo(
    () => rolesQuery.data?.items ?? [],
    [rolesQuery.data?.items]
  );
  const effectiveRole = useMemo(() => {
    if (
      selectedRoleId &&
      roles.some((role) => role.roleId === selectedRoleId)
    ) {
      const selected = roles.find((role) => role.roleId === selectedRoleId);
      if (selected) return selected;
    }
    return roles[0] ?? null;
  }, [roles, selectedRoleId]);
  const currentUrlState = useMemo(
    () =>
      ({
        activeTab,
        allCreatedFrom,
        allCreatedTo,
        allTagFilters,
        reviewRecommendedFrom,
        reviewRecommendedTo,
        reviewTagFilters,
        selectedCompanyId,
        selectedRoleId,
      }) satisfies OpsMatchingUrlState,
    [
      activeTab,
      allCreatedFrom,
      allCreatedTo,
      allTagFilters,
      reviewRecommendedFrom,
      reviewRecommendedTo,
      reviewTagFilters,
      selectedCompanyId,
      selectedRoleId,
    ]
  );
  const replaceUrlState = useCallback(
    (patch: Partial<OpsMatchingUrlState>) => {
      if (!router.isReady) return;
      const next = {
        ...currentUrlState,
        ...patch,
      } satisfies OpsMatchingUrlState;
      void router.replace(
        {
          pathname: router.pathname,
          query: buildMatchingUrlQuery(next),
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [currentUrlState, router]
  );

  useEffect(() => {
    if (!router.isReady || !hasHydrated || hasInitializedUrlStateRef.current) {
      return;
    }

    const parsed = parseMatchingUrlState(router.query);
    if (parsed.hasUrlState) {
      setStateFromUrl(parsed.state);
    } else {
      replaceUrlState({});
    }
    hasInitializedUrlStateRef.current = true;
  }, [
    hasHydrated,
    replaceUrlState,
    router.isReady,
    router.query,
    setStateFromUrl,
  ]);

  useEffect(() => {
    if (
      !hasInitializedUrlStateRef.current ||
      companiesQuery.isLoading ||
      !effectiveCompanyId ||
      selectedCompanyId === effectiveCompanyId
    ) {
      return;
    }

    setSelectedCompanyId(effectiveCompanyId);
    setSelectedRoleId("");
    replaceUrlState({
      selectedCompanyId: effectiveCompanyId,
      selectedRoleId: "",
    });
  }, [
    companiesQuery.isLoading,
    effectiveCompanyId,
    replaceUrlState,
    selectedCompanyId,
    setSelectedCompanyId,
    setSelectedRoleId,
  ]);

  useEffect(() => {
    if (
      !hasInitializedUrlStateRef.current ||
      rolesQuery.isLoading ||
      !effectiveRole ||
      selectedRoleId === effectiveRole.roleId
    ) {
      return;
    }

    setSelectedRoleId(effectiveRole.roleId);
    replaceUrlState({
      selectedRoleId: effectiveRole.roleId,
    });
  }, [
    effectiveRole,
    replaceUrlState,
    rolesQuery.isLoading,
    selectedRoleId,
    setSelectedRoleId,
  ]);

  const handleTabChange = (tab: OpsMatchingStageTabId) => {
    setActiveTab(tab);
    replaceUrlState({ activeTab: tab });
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedRoleId("");
    setActiveTab("all");
    replaceUrlState({
      activeTab: "all",
      selectedCompanyId: companyId,
      selectedRoleId: "",
    });
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    setActiveTab("all");
    replaceUrlState({
      activeTab: "all",
      selectedRoleId: roleId,
    });
  };

  const handleAllCreatedDateRangeChange = (from: string, to: string) => {
    setAllCreatedDateRange(from, to);
    replaceUrlState({
      allCreatedFrom: from,
      allCreatedTo: to,
    });
  };

  const handleAllTagFiltersChange = (tags: string[]) => {
    setAllTagFilters(tags);
    replaceUrlState({ allTagFilters: tags });
  };

  const handleReviewRecommendedDateRangeChange = (from: string, to: string) => {
    setReviewRecommendedDateRange(from, to);
    replaceUrlState({
      reviewRecommendedFrom: from,
      reviewRecommendedTo: to,
    });
  };

  const handleReviewTagFiltersChange = (tags: string[]) => {
    setReviewTagFilters(tags);
    replaceUrlState({ reviewTagFilters: tags });
  };

  return (
    <>
      <Head>
        <title>Matching | Harper Ops</title>
      </Head>

      <OpsShell
        compactHeader
        title="Matching"
        navActions={
          <section className="p-0">
            <div className="flex flex-row gap-3">
              <label className="block">
                <UiSelect
                  value={effectiveCompanyId}
                  onChange={(event) => {
                    handleCompanyChange(event.target.value);
                  }}
                  disabled={companiesQuery.isLoading || companies.length === 0}
                  className="mt-2"
                >
                  {companies.length === 0 ? (
                    <option value="">회사 없음</option>
                  ) : (
                    companies.map((company) => (
                      <option
                        key={company.companyWorkspaceId}
                        value={company.companyWorkspaceId}
                      >
                        회사: {company.companyName}
                      </option>
                    ))
                  )}
                </UiSelect>
              </label>

              <label className="block">
                <UiSelect
                  value={effectiveRole?.roleId ?? ""}
                  onChange={(event) => {
                    handleRoleChange(event.target.value);
                  }}
                  disabled={rolesQuery.isLoading || roles.length === 0}
                  className="mt-2"
                >
                  {roles.length === 0 ? (
                    <option value="">Role 없음</option>
                  ) : (
                    roles.map((role) => (
                      <option key={role.roleId} value={role.roleId}>
                        Role: {role.roleName}
                      </option>
                    ))
                  )}
                </UiSelect>
              </label>
            </div>

            {companiesQuery.isLoading || rolesQuery.isLoading ? (
              <div className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-muted">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                선택지를 불러오는 중...
              </div>
            ) : null}
            {companiesQuery.error || rolesQuery.error ? (
              <div className={cx(opsTheme.errorNotice, "mt-3")}>
                {companiesQuery.error instanceof Error
                  ? companiesQuery.error.message
                  : rolesQuery.error instanceof Error
                    ? rolesQuery.error.message
                    : "Matching 선택지를 불러오지 못했습니다."}
              </div>
            ) : null}
          </section>
        }
      >
        <div className="space-y-4">
          {effectiveRole ? (
            <>
              <section className="flex flex-row gap-2">
                {MATCHING_STAGE_TABS.map((tab) => (
                  <BareButton
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={cx(
                      "flex min-h-16 min-w-48 items-center justify-between rounded-md border-2 px-4 py-3 text-left",
                      activeTab === tab.id
                        ? "border-primary text-primary"
                        : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-primary hover:text-primary"
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{tab.label}</span>
                      {tab.count !== null && (
                        <span className={cx("text-xs")}>
                          {tab.count} applications
                        </span>
                      )}
                    </div>
                  </BareButton>
                ))}
              </section>

              {activeTab === "all" ? (
                <MatchingTalentBrowser
                  key={effectiveRole.roleId}
                  canFetchInternal={canFetchInternal}
                  createdFrom={allCreatedFrom}
                  createdTo={allCreatedTo}
                  onCreatedDateRangeChange={handleAllCreatedDateRangeChange}
                  onTagFiltersChange={handleAllTagFiltersChange}
                  role={effectiveRole}
                  tagFilters={allTagFilters}
                />
              ) : activeTab === "harper_review" ? (
                <MatchingHarperReviewBoard
                  key={effectiveRole.roleId}
                  canFetchInternal={canFetchInternal}
                  onRecommendedDateRangeChange={
                    handleReviewRecommendedDateRangeChange
                  }
                  onTagFiltersChange={handleReviewTagFiltersChange}
                  recommendedFrom={reviewRecommendedFrom}
                  recommendedTo={reviewRecommendedTo}
                  role={effectiveRole}
                  tagFilters={reviewTagFilters}
                />
              ) : (
                <EmptyStagePanel
                  label={
                    MATCHING_STAGE_TABS.find((tab) => tab.id === activeTab)
                      ?.label ?? "Stage"
                  }
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-16 text-center">
              <Building2 className="h-8 w-8 text-neutral-soft" />
              <div className="mt-3 text-sm text-neutral-muted">
                먼저 회사와 role을 선택하세요.
              </div>
            </div>
          )}
        </div>
      </OpsShell>
    </>
  );
}
