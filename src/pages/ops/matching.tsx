import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OpsShell from "@/components/ops/OpsShell";
import { MatchingFitRecordBrowser } from "@/components/ops/matching/MatchingFitRecordBrowser";
import { MatchingHarperReviewBoard } from "@/components/ops/matching/MatchingHarperReviewBoard";
import { MatchingTalentBrowser } from "@/components/ops/matching/MatchingTalentBrowser";
import { RoleCreateModal } from "@/components/ops/opportunities/modals";
import {
  EMPTY_ROLE_DRAFT,
  type RoleDraft,
  roleToDraft,
} from "@/components/ops/opportunities/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import {
  useOpsOpportunityRoles as useOpsOpportunityRoleRecords,
  useSaveOpsOpportunityRole,
} from "@/hooks/ops/useOpsOpportunities";
import { BareButton } from "@/components/ui/button";
import {
  Select as UiSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabBoxes } from "@/components/ui/tab-boxes";
import {
  useOpsMatchingCompanies,
  useOpsMatchingRoles,
} from "@/hooks/ops/useOpsMatching";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type OpsMatchingStageTabId,
  type OpsMatchingUrlState,
  type OpsMatchingViewMode,
  useOpsMatchingStore,
} from "@/store/useOpsMatchingStore";
import { Building2, ListFilter, LoaderCircle, Pencil } from "lucide-react";
import type { ParsedUrlQuery } from "querystring";

const MATCHING_STAGE_TABS = [
  { count: 0, id: "harper_review", label: "Pipeline" },
  { count: null, id: "all", label: "All(보지 않아도 됨)" },
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
  if (normalized === "all" || normalized === "harper_review") {
    return normalized;
  }
  return "all";
}

function parseMatchingViewMode(
  value: ParsedUrlQuery[string]
): OpsMatchingViewMode {
  const normalized = firstQueryValue(value);
  if (normalized === "all_fits" || normalized === "allFits") {
    return "all_fits";
  }
  return "role";
}

function parseBooleanQueryParam(value: ParsedUrlQuery[string]) {
  const normalized = firstQueryValue(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseMatchingUrlState(query: ParsedUrlQuery) {
  const relevantKeys = [
    "allExcludeRecommended",
    "allFrom",
    "allHumanLabels",
    "allLlmLabels",
    "allTo",
    "company",
    "reviewFrom",
    "reviewTo",
    "role",
    "tab",
    "talent",
    "view",
  ];
  const hasUrlState = relevantKeys.some((key) => key in query);

  return {
    hasUrlState,
    state: {
      activeTab: parseMatchingTab(query.tab),
      allCreatedFrom: firstQueryValue(query.allFrom),
      allCreatedTo: firstQueryValue(query.allTo),
      allExcludeRecommended: parseBooleanQueryParam(
        query.allExcludeRecommended
      ),
      allHumanLabelFilters: parseTagsParam(query.allHumanLabels),
      allLlmLabelFilters: parseTagsParam(query.allLlmLabels),
      reviewRecommendedFrom: firstQueryValue(query.reviewFrom),
      reviewRecommendedTo: firstQueryValue(query.reviewTo),
      selectedCompanyId: firstQueryValue(query.company),
      selectedRoleId: firstQueryValue(query.role),
      viewMode: parseMatchingViewMode(query.view),
    } satisfies OpsMatchingUrlState,
  };
}

type MatchingUrlQueryState = OpsMatchingUrlState & {
  selectedTalentId?: string;
};

function buildMatchingUrlQuery(state: MatchingUrlQueryState) {
  const query: Record<string, string> = {
    tab: state.activeTab,
  };
  if (state.viewMode === "all_fits") query.view = "all_fits";
  if (state.selectedCompanyId) query.company = state.selectedCompanyId;
  if (state.selectedRoleId) query.role = state.selectedRoleId;
  if (state.allCreatedFrom) query.allFrom = state.allCreatedFrom;
  if (state.allCreatedTo) query.allTo = state.allCreatedTo;
  if (state.allExcludeRecommended) query.allExcludeRecommended = "1";
  if (state.allLlmLabelFilters.length > 0) {
    query.allLlmLabels = state.allLlmLabelFilters.join(",");
  }
  if (state.allHumanLabelFilters.length > 0) {
    query.allHumanLabels = state.allHumanLabelFilters.join(",");
  }
  if (state.reviewRecommendedFrom) {
    query.reviewFrom = state.reviewRecommendedFrom;
  }
  if (state.reviewRecommendedTo) query.reviewTo = state.reviewRecommendedTo;
  if (state.selectedTalentId) query.talent = state.selectedTalentId;
  return query;
}

function InlineToggleIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      className={cx(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition",
        checked
          ? "border-positive bg-positive"
          : "border-neutral-1000-a10 bg-bg-floating"
      )}
      aria-hidden
    >
      <span
        className={cx(
          "h-3 w-3 rounded-full bg-neutral-00 shadow-sm transition-transform",
          checked ? "translate-x-3.5" : "translate-x-0.5 bg-neutral-400"
        )}
      />
    </span>
  );
}

function toggleButtonClass(checked: boolean) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    checked
      ? "border-positive/30 bg-positive-faded text-positive hover:bg-positive-faded"
      : "border-transparent bg-bg-weak text-neutral-primary shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_70%,transparent)] hover:bg-bg-weak"
  );
}

export default function OpsMatchingPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const hasInitializedUrlStateRef = useRef(false);
  const [isRoleEditModalOpen, setIsRoleEditModalOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(EMPTY_ROLE_DRAFT);
  const activeTab = useOpsMatchingStore((state) => state.activeTab);
  const allCreatedFrom = useOpsMatchingStore((state) => state.allCreatedFrom);
  const allCreatedTo = useOpsMatchingStore((state) => state.allCreatedTo);
  const allExcludeRecommended = useOpsMatchingStore(
    (state) => state.allExcludeRecommended
  );
  const allHumanLabelFilters = useOpsMatchingStore(
    (state) => state.allHumanLabelFilters
  );
  const allLlmLabelFilters = useOpsMatchingStore(
    (state) => state.allLlmLabelFilters
  );
  const hasHydrated = useOpsMatchingStore((state) => state.hasHydrated);
  const reviewRecommendedFrom = useOpsMatchingStore(
    (state) => state.reviewRecommendedFrom
  );
  const reviewRecommendedTo = useOpsMatchingStore(
    (state) => state.reviewRecommendedTo
  );
  const selectedCompanyId = useOpsMatchingStore(
    (state) => state.selectedCompanyId
  );
  const selectedRoleId = useOpsMatchingStore((state) => state.selectedRoleId);
  const viewMode = useOpsMatchingStore((state) => state.viewMode);
  const selectedTalentId = router.isReady
    ? firstQueryValue(router.query.talent)
    : "";
  const setActiveTab = useOpsMatchingStore((state) => state.setActiveTab);
  const setAllCreatedDateRange = useOpsMatchingStore(
    (state) => state.setAllCreatedDateRange
  );
  const setAllExcludeRecommended = useOpsMatchingStore(
    (state) => state.setAllExcludeRecommended
  );
  const setAllHumanLabelFilters = useOpsMatchingStore(
    (state) => state.setAllHumanLabelFilters
  );
  const setAllLlmLabelFilters = useOpsMatchingStore(
    (state) => state.setAllLlmLabelFilters
  );
  const setReviewRecommendedDateRange = useOpsMatchingStore(
    (state) => state.setReviewRecommendedDateRange
  );
  const setSelectedCompanyId = useOpsMatchingStore(
    (state) => state.setSelectedCompanyId
  );
  const setSelectedRoleId = useOpsMatchingStore(
    (state) => state.setSelectedRoleId
  );
  const setStateFromUrl = useOpsMatchingStore((state) => state.setStateFromUrl);
  const setViewMode = useOpsMatchingStore((state) => state.setViewMode);
  const companiesQuery = useOpsMatchingCompanies({
    enabled: canFetchInternal,
  });
  const companies = useMemo(
    () => companiesQuery.data?.items ?? [],
    [companiesQuery.data?.items]
  );
  const companySelectItems = useMemo(
    () =>
      companies.map((company) => ({
        label: `회사: ${company.companyName}`,
        value: company.companyWorkspaceId,
      })),
    [companies]
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
  const roleSelectItems = useMemo(
    () =>
      roles.map((role) => ({
        label: `Role: ${role.roleName}`,
        value: role.roleId,
      })),
    [roles]
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
  const roleRecordQuery = useOpsOpportunityRoleRecords({
    enabled: canFetchInternal && Boolean(effectiveCompanyId && effectiveRole),
    internalOnly: true,
    limit: 1,
    roleId: effectiveRole?.roleId ?? "",
    sourceType: "internal",
    workspaceId: effectiveCompanyId,
  });
  const saveRole = useSaveOpsOpportunityRole();
  const selectedRoleRecord = useMemo(() => {
    const roleId = effectiveRole?.roleId ?? "";
    if (!roleId) return null;
    return (
      roleRecordQuery.data?.pages
        .flatMap((page) => page.items)
        .find((role) => role.roleId === roleId) ?? null
    );
  }, [effectiveRole?.roleId, roleRecordQuery.data?.pages]);
  const currentUrlState = useMemo(
    () =>
      ({
        activeTab,
        allCreatedFrom,
        allCreatedTo,
        allExcludeRecommended,
        allHumanLabelFilters,
        allLlmLabelFilters,
        reviewRecommendedFrom,
        reviewRecommendedTo,
        selectedCompanyId,
        selectedRoleId,
        selectedTalentId,
        viewMode,
      }) satisfies MatchingUrlQueryState,
    [
      activeTab,
      allCreatedFrom,
      allCreatedTo,
      allExcludeRecommended,
      allHumanLabelFilters,
      allLlmLabelFilters,
      reviewRecommendedFrom,
      reviewRecommendedTo,
      selectedCompanyId,
      selectedRoleId,
      selectedTalentId,
      viewMode,
    ]
  );
  const replaceUrlState = useCallback(
    (patch: Partial<MatchingUrlQueryState>) => {
      if (!router.isReady) return;
      const next = {
        ...currentUrlState,
        ...patch,
      } satisfies MatchingUrlQueryState;
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
  const pushUrlState = useCallback(
    (patch: Partial<MatchingUrlQueryState>) => {
      if (!router.isReady) return;
      const next = {
        ...currentUrlState,
        ...patch,
      } satisfies MatchingUrlQueryState;
      void router.push(
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
    setViewMode("role");
    replaceUrlState({ activeTab: tab, selectedTalentId: "", viewMode: "role" });
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedRoleId("");
    setActiveTab("all");
    setViewMode("role");
    replaceUrlState({
      activeTab: "all",
      selectedCompanyId: companyId,
      selectedRoleId: "",
      selectedTalentId: "",
      viewMode: "role",
    });
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    setViewMode("role");
    replaceUrlState({
      selectedRoleId: roleId,
      selectedTalentId: "",
      viewMode: "role",
    });
  };

  const handleAllFitsClick = () => {
    if (viewMode === "all_fits") {
      setViewMode("role");
      replaceUrlState({ selectedTalentId: "", viewMode: "role" });
      return;
    }
    setActiveTab("all");
    setViewMode("all_fits");
    replaceUrlState({
      activeTab: "all",
      selectedTalentId: "",
      viewMode: "all_fits",
    });
  };

  const handleReviewTalentSelect = (talentId: string) => {
    pushUrlState({
      activeTab: "harper_review",
      selectedTalentId: talentId,
      viewMode: "role",
    });
  };

  const handleReviewTalentClose = () => {
    replaceUrlState({ selectedTalentId: "" });
  };

  const handleRoleEditClick = async () => {
    if (!effectiveRole) {
      showToast({
        message: "수정할 role을 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }

    let role = selectedRoleRecord;
    if (!role) {
      const refreshed = await roleRecordQuery.refetch();
      role =
        refreshed.data?.pages
          .flatMap((page) => page.items)
          .find((item) => item.roleId === effectiveRole.roleId) ?? null;
    }

    if (!role) {
      showToast({
        message: "role 정보를 불러오지 못했습니다.",
        variant: "white",
      });
      return;
    }

    setRoleDraft(roleToDraft(role));
    setIsRoleEditModalOpen(true);
  };

  const closeRoleEditModal = () => {
    if (saveRole.isPending) return;
    setIsRoleEditModalOpen(false);
    setRoleDraft(roleToDraft(selectedRoleRecord));
  };

  const handleRoleSave = async () => {
    if (!effectiveRole) return;

    try {
      await saveRole.mutateAsync({
        ...roleDraft,
        companyWorkspaceId: effectiveRole.companyWorkspaceId,
        roleId: effectiveRole.roleId,
      });
      await Promise.all([
        companiesQuery.refetch(),
        rolesQuery.refetch(),
        roleRecordQuery.refetch(),
      ]);
      setIsRoleEditModalOpen(false);
      showToast({
        message: "role이 수정되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "role 수정에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleAllCreatedDateRangeChange = (from: string, to: string) => {
    setAllCreatedDateRange(from, to);
    replaceUrlState({
      allCreatedFrom: from,
      allCreatedTo: to,
    });
  };

  const handleAllExcludeRecommendedChange = (excludeRecommended: boolean) => {
    setAllExcludeRecommended(excludeRecommended);
    replaceUrlState({ allExcludeRecommended: excludeRecommended });
  };

  const handleAllLlmLabelFiltersChange = (labels: string[]) => {
    setAllLlmLabelFilters(labels);
    replaceUrlState({ allLlmLabelFilters: labels });
  };

  const handleAllHumanLabelFiltersChange = (labels: string[]) => {
    setAllHumanLabelFilters(labels);
    replaceUrlState({ allHumanLabelFilters: labels });
  };

  const handleReviewRecommendedDateRangeChange = (from: string, to: string) => {
    setReviewRecommendedDateRange(from, to);
    replaceUrlState({
      reviewRecommendedFrom: from,
      reviewRecommendedTo: to,
    });
  };

  return (
    <>
      <Head>
        <title>Main | Harper Ops</title>
      </Head>

      <OpsShell
        compactHeader
        title="Main"
        navActions={
          <section className="p-0">
            <div className="flex flex-row gap-3">
              <label className="block">
                <UiSelect
                  items={companySelectItems}
                  value={effectiveCompanyId}
                  onValueChange={(value) => {
                    handleCompanyChange(value ?? "");
                  }}
                  disabled={companiesQuery.isLoading || companies.length === 0}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="회사 없음" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    className="w-80 max-w-[calc(100vw-2rem)] transition-none"
                  >
                    <SelectGroup>
                      {companies.map((company) => (
                        <SelectItem
                          key={company.companyWorkspaceId}
                          value={company.companyWorkspaceId}
                        >
                          회사: {company.companyName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </UiSelect>
              </label>

              <label className="block">
                <UiSelect
                  items={roleSelectItems}
                  value={effectiveRole?.roleId ?? ""}
                  onValueChange={(value) => {
                    handleRoleChange(value ?? "");
                  }}
                  disabled={rolesQuery.isLoading || roles.length === 0}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Role 없음" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    className="w-[28rem] max-w-[calc(100vw-2rem)] transition-none"
                  >
                    <SelectGroup>
                      {roles.map((role) => (
                        <SelectItem key={role.roleId} value={role.roleId}>
                          Role: {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </UiSelect>
              </label>

              <BareButton
                type="button"
                aria-pressed={viewMode === "all_fits"}
                onClick={handleAllFitsClick}
                className={cx(
                  toggleButtonClass(viewMode === "all_fits"),
                  "mt-2 h-11 shrink-0 px-3 text-xs"
                )}
              >
                <InlineToggleIndicator checked={viewMode === "all_fits"} />
                <ListFilter className="h-3.5 w-3.5" />
                전체보기
              </BareButton>
              <BareButton
                type="button"
                onClick={() => void handleRoleEditClick()}
                disabled={!effectiveRole || roleRecordQuery.isLoading}
                className={cx(
                  opsTheme.buttonSecondary,
                  "mt-2 h-11 shrink-0 px-3 text-xs"
                )}
              >
                {roleRecordQuery.isLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
                수정하기
              </BareButton>
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
          {viewMode === "all_fits" ? (
            <MatchingFitRecordBrowser
              canFetchInternal={canFetchInternal}
              humanLabelFilters={allHumanLabelFilters}
              llmLabelFilters={allLlmLabelFilters}
              onHumanLabelFiltersChange={handleAllHumanLabelFiltersChange}
              onLlmLabelFiltersChange={handleAllLlmLabelFiltersChange}
            />
          ) : effectiveRole ? (
            <>
              <TabBoxes
                activeValue={activeTab}
                items={MATCHING_STAGE_TABS.map((tab) => ({
                  label: tab.label,
                  value: tab.id,
                }))}
                getItemClassName={(item) =>
                  item.value === "all" ? "ml-auto" : ""
                }
                listClassName="min-w-full justify-between"
                onValueChange={handleTabChange}
                size="md"
              />

              {activeTab === "all" ? (
                <MatchingTalentBrowser
                  key={effectiveRole.roleId}
                  canFetchInternal={canFetchInternal}
                  createdFrom={allCreatedFrom}
                  createdTo={allCreatedTo}
                  excludeRecommended={allExcludeRecommended}
                  humanLabelFilters={allHumanLabelFilters}
                  llmLabelFilters={allLlmLabelFilters}
                  onCreatedDateRangeChange={handleAllCreatedDateRangeChange}
                  onExcludeRecommendedChange={handleAllExcludeRecommendedChange}
                  onHumanLabelFiltersChange={handleAllHumanLabelFiltersChange}
                  onLlmLabelFiltersChange={handleAllLlmLabelFiltersChange}
                  role={effectiveRole}
                />
              ) : activeTab === "harper_review" ? (
                <MatchingHarperReviewBoard
                  key={effectiveRole.roleId}
                  canFetchInternal={canFetchInternal}
                  onRecommendedDateRangeChange={
                    handleReviewRecommendedDateRangeChange
                  }
                  recommendedFrom={reviewRecommendedFrom}
                  recommendedTo={reviewRecommendedTo}
                  role={effectiveRole}
                  selectedTalentId={selectedTalentId}
                  onSelectedTalentChange={handleReviewTalentSelect}
                  onSelectedTalentClose={handleReviewTalentClose}
                />
              ) : null}
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
      <RoleCreateModal
        open={isRoleEditModalOpen}
        draft={roleDraft}
        mode="edit"
        onChange={setRoleDraft}
        onClose={closeRoleEditModal}
        onSubmit={() => void handleRoleSave()}
        pending={saveRole.isPending}
        workspaceName={selectedRoleRecord?.companyName ?? null}
      />
    </>
  );
}
