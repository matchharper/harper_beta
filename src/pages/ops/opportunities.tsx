import OpsShell from "@/components/ops/OpsShell";
import CatalogView from "@/components/ops/opportunities/CatalogView";
import CompanyManagementView from "@/components/ops/opportunities/CompanyManagementView";
import {
  RoleCreateModal,
  WorkspaceCreateModal,
} from "@/components/ops/opportunities/modals";
import {
  type DraftMode,
  EMPTY_ROLE_DRAFT,
  EMPTY_WORKSPACE_DRAFT,
  getPageViewFromQuery,
  PAGE_VIEW_QUERY_KEY,
  type PageView,
  type RoleDraft,
  roleToDraft,
  type WorkspaceDraft,
  workspaceToDraft,
} from "@/components/ops/opportunities/shared";
import { ViewTabs } from "@/components/ops/opportunities/ViewTabs";
import { showToast } from "@/components/toast/toast";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useDeleteOpsOpportunityRole,
  useExtractOpsOpportunityWorkspace,
  useOpsOpportunityCompanies,
  useSaveOpsOpportunityRole,
  useSaveOpsOpportunityWorkspace,
  useSyncOpsOpportunityRoles,
  useUpdateOpsCompanyHumanQualityLabel,
} from "@/hooks/ops/useOpsOpportunities";
import { useOpsOpportunityCatalogController } from "@/hooks/ops/useOpsOpportunityCatalogController";
import {
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/ops/opportunityCompanyManagement";
import type {
  OpsCompanyQualityLabel,
  OpsCompanyManagementRecord,
  OpsOpportunityRoleRecord,
} from "@/lib/ops/opportunity";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import { LoaderCircle, RefreshCw } from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";

export default function OpsOpportunitiesPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [companyManagementCompanyName, setCompanyManagementCompanyName] =
    useState("");
  const [companyManagementLocation, setCompanyManagementLocation] =
    useState("");
  const [companyManagementInvestors, setCompanyManagementInvestors] =
    useState("");
  const [
    companyManagementEmployeeCountRange,
    setCompanyManagementEmployeeCountRange,
  ] = useState<OpsCompanyManagementEmployeeCountRangeFilter>("");
  const [companyManagementFoundedYearMin, setCompanyManagementFoundedYearMin] =
    useState("");
  const [companyManagementQualityLabel, setCompanyManagementQualityLabel] =
    useState<OpsCompanyManagementQualityLabelFilter>("");
  const [companyManagementReviewMode, setCompanyManagementReviewMode] =
    useState(false);
  const [
    companyManagementReviewUnlabeledFirst,
    setCompanyManagementReviewUnlabeledFirst,
  ] = useState(true);
  const [
    companyManagementHasCareerUrlOnly,
    setCompanyManagementHasCareerUrlOnly,
  ] = useState(false);
  const [companyManagementAppliedFilters, setCompanyManagementAppliedFilters] =
    useState({
      companyName: "",
      employeeCountRange: "" as OpsCompanyManagementEmployeeCountRangeFilter,
      foundedYearMin: "",
      hasCareerUrlOnly: false,
      investors: "",
      location: "",
      qualityLabel: "" as OpsCompanyManagementQualityLabelFilter,
    });
  const [workspaceDraftMode, setWorkspaceDraftMode] =
    useState<DraftMode>("edit");
  const [roleDraftMode, setRoleDraftMode] = useState<DraftMode>("edit");
  const [isWorkspaceCreateModalOpen, setIsWorkspaceCreateModalOpen] =
    useState(false);
  const [isRoleCreateModalOpen, setIsRoleCreateModalOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft>(
    EMPTY_WORKSPACE_DRAFT
  );
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(EMPTY_ROLE_DRAFT);

  const [updatingQualityLabelIds, setUpdatingQualityLabelIds] = useState(
    () => new Set<string>()
  );
  const currentViewQuery = router.query[PAGE_VIEW_QUERY_KEY];
  const view = router.isReady
    ? (getPageViewFromQuery(currentViewQuery) ?? "catalog")
    : "catalog";

  const setViewWithUrl = useCallback(
    (nextView: PageView) => {
      if (!router.isReady) return;
      if (getPageViewFromQuery(currentViewQuery) === nextView) {
        return;
      }

      void router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            [PAGE_VIEW_QUERY_KEY]: nextView,
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [currentViewQuery, router]
  );

  const catalog = useOpsOpportunityCatalogController({
    canFetchInternal,
    view,
  });
  const companyManagementQuery = useOpsOpportunityCompanies({
    companyName: companyManagementAppliedFilters.companyName,
    enabled: canFetchInternal && view === "company_management",
    employeeCountRange: companyManagementAppliedFilters.employeeCountRange,
    foundedYearMin: companyManagementAppliedFilters.foundedYearMin,
    hasCareerUrlOnly: companyManagementAppliedFilters.hasCareerUrlOnly,
    humanLabelMissingFirst:
      companyManagementReviewMode && companyManagementReviewUnlabeledFirst,
    investors: companyManagementAppliedFilters.investors,
    limit: OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
    llmQualityLabelFirst: companyManagementReviewMode,
    location: companyManagementAppliedFilters.location,
    qualityLabel: companyManagementAppliedFilters.qualityLabel,
  });
  const fetchNextCompanyManagementQueryPage =
    companyManagementQuery.fetchNextPage;
  const refetchCompanyManagement = companyManagementQuery.refetch;
  const extractWorkspace = useExtractOpsOpportunityWorkspace();
  const saveWorkspace = useSaveOpsOpportunityWorkspace();
  const syncRoles = useSyncOpsOpportunityRoles();
  const saveRole = useSaveOpsOpportunityRole();
  const deleteRole = useDeleteOpsOpportunityRole();
  const updateCompanyHumanQualityLabel = useUpdateOpsCompanyHumanQualityLabel();

  const selectedWorkspace = catalog.selectedWorkspace;
  const selectedWorkspaceId = catalog.selectedWorkspaceId;
  const selectedRole = catalog.selectedRole;
  const selectedRoleId = catalog.selectedRoleId;

  const companyManagementRows = useMemo(() => {
    const rows =
      companyManagementQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const rowByWorkspaceId = new Map<string, OpsCompanyManagementRecord>();
    for (const row of rows) {
      rowByWorkspaceId.set(row.companyWorkspaceId, row);
    }
    return Array.from(rowByWorkspaceId.values());
  }, [companyManagementQuery.data?.pages]);

  const handleWorkspaceSave = async () => {
    try {
      const response = await saveWorkspace.mutateAsync({
        ...workspaceDraft,
        workspaceId:
          workspaceDraftMode === "edit"
            ? selectedWorkspace?.companyWorkspaceId
            : null,
      });
      setWorkspaceDraftMode("edit");
      catalog.setSelectedWorkspaceId(response.workspace.companyWorkspaceId);
      if (isWorkspaceCreateModalOpen) {
        setIsWorkspaceCreateModalOpen(false);
      }
      showToast({
        message:
          workspaceDraftMode === "edit"
            ? "회사 정보가 수정되었습니다."
            : "회사가 추가되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "회사 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleWorkspaceExtract = async () => {
    const linkedinUrl = workspaceDraft.linkedinUrl.trim();
    if (!linkedinUrl) {
      showToast({
        message: "LinkedIn 회사 URL을 먼저 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    try {
      const response = await extractWorkspace.mutateAsync({
        linkedinUrl,
      });
      setWorkspaceDraft((current) => ({
        ...current,
        companyDescription:
          response.workspace.companyDescription || current.companyDescription,
        companyName: response.workspace.companyName || current.companyName,
        homepageUrl: response.workspace.homepageUrl || current.homepageUrl,
        linkedinUrl: response.workspace.linkedinUrl,
      }));
      showToast({
        message: "company_db에서 회사 정보를 채웠습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "회사 정보 추출에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleRoleSave = async () => {
    try {
      const response = await saveRole.mutateAsync({
        ...roleDraft,
        companyWorkspaceId: selectedWorkspaceId,
        roleId: roleDraftMode === "edit" ? selectedRole?.roleId : null,
      });
      setRoleDraftMode("edit");
      catalog.setSelectedRoleId(response.role.roleId);
      if (isRoleCreateModalOpen) {
        setIsRoleCreateModalOpen(false);
      }
      showToast({
        message:
          roleDraftMode === "edit"
            ? "기회가 수정되었습니다."
            : "기회가 추가되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "기회 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleRoleDelete = async () => {
    if (roleDraftMode !== "edit" || !selectedRole?.roleId) {
      showToast({
        message: "삭제할 기회를 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }

    const confirmed = window.confirm(
      `${selectedRole.name} 기회를 완전히 삭제할까요?\n\n추천, 매칭, fit, progress 등 연결 데이터도 함께 삭제됩니다. 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    try {
      await deleteRole.mutateAsync({
        companyWorkspaceId: selectedWorkspaceId,
        roleId: selectedRole.roleId,
      });

      catalog.setSelectedRoleId(null);
      setIsRoleCreateModalOpen(false);
      setRoleDraftMode("edit");
      setRoleDraft(roleToDraft(null));
      showToast({
        message: "기회가 완전히 삭제되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "기회 삭제에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleRoleSync = async () => {
    if (!selectedWorkspaceId) {
      showToast({
        message: "먼저 회사를 선택해 주세요.",
        variant: "white",
      });
      return;
    }

    const careerUrl =
      workspaceDraft.careerUrl.trim() || selectedWorkspace?.careerUrl || "";
    if (!careerUrl.trim()) {
      showToast({
        message: "career url이 없습니다. 회사 정보에 먼저 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    try {
      const response = await syncRoles.mutateAsync({
        careerUrl,
        workspaceId: selectedWorkspaceId,
      });
      showToast({
        message: `${response.result.provider}에서 ${response.result.insertedCount}개 role을 sync했습니다.`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "role sync에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const openWorkspaceCreateModal = () => {
    setWorkspaceDraftMode("new");
    setWorkspaceDraft({
      ...EMPTY_WORKSPACE_DRAFT,
      isInternal: view === "catalog",
    });
    setIsWorkspaceCreateModalOpen(true);
  };

  const openWorkspaceEditModal = () => {
    if (!selectedWorkspace) {
      showToast({
        message: "수정할 회사를 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }
    setWorkspaceDraftMode("edit");
    setWorkspaceDraft(workspaceToDraft(selectedWorkspace));
    setIsWorkspaceCreateModalOpen(true);
  };

  const closeWorkspaceCreateModal = () => {
    if (saveWorkspace.isPending || extractWorkspace.isPending) return;
    setIsWorkspaceCreateModalOpen(false);
    setWorkspaceDraftMode("edit");
    setWorkspaceDraft(workspaceToDraft(selectedWorkspace));
  };

  const openRoleCreateModal = () => {
    if (!selectedWorkspaceId) return;
    setRoleDraftMode("new");
    setRoleDraft(EMPTY_ROLE_DRAFT);
    setIsRoleCreateModalOpen(true);
  };

  const openRoleEditModalForRole = (role: OpsOpportunityRoleRecord) => {
    catalog.setSelectedRoleId(role.roleId);
    setRoleDraftMode("edit");
    setRoleDraft(roleToDraft(role));
    setIsRoleCreateModalOpen(true);
  };

  const openRoleEditModal = () => {
    if (!selectedRole) {
      showToast({
        message: "수정할 기회를 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }
    openRoleEditModalForRole(selectedRole);
  };

  const closeRoleCreateModal = () => {
    if (saveRole.isPending || deleteRole.isPending) return;
    setIsRoleCreateModalOpen(false);
    setRoleDraftMode("edit");
    setRoleDraft(roleToDraft(selectedRole));
  };

  const handleRefresh = useCallback(() => {
    if (view === "company_management") {
      void refetchCompanyManagement();
      return;
    }
    void catalog.refetchCatalog();
    void catalog.refetchRoles();
  }, [catalog, refetchCompanyManagement, view]);

  const fetchNextCompanyManagementPage = useCallback(() => {
    void fetchNextCompanyManagementQueryPage();
  }, [fetchNextCompanyManagementQueryPage]);

  const handleCompanyManagementSearch = useCallback(() => {
    const nextFilters = {
      companyName: companyManagementCompanyName.trim(),
      employeeCountRange: companyManagementEmployeeCountRange,
      foundedYearMin: companyManagementFoundedYearMin.trim(),
      hasCareerUrlOnly: companyManagementHasCareerUrlOnly,
      investors: companyManagementInvestors.trim(),
      location: companyManagementLocation.trim(),
      qualityLabel: companyManagementQualityLabel,
    };
    const filtersUnchanged =
      nextFilters.companyName === companyManagementAppliedFilters.companyName &&
      nextFilters.employeeCountRange ===
        companyManagementAppliedFilters.employeeCountRange &&
      nextFilters.foundedYearMin ===
        companyManagementAppliedFilters.foundedYearMin &&
      nextFilters.hasCareerUrlOnly ===
        companyManagementAppliedFilters.hasCareerUrlOnly &&
      nextFilters.investors === companyManagementAppliedFilters.investors &&
      nextFilters.location === companyManagementAppliedFilters.location &&
      nextFilters.qualityLabel === companyManagementAppliedFilters.qualityLabel;

    if (filtersUnchanged) {
      void refetchCompanyManagement();
      return;
    }

    setCompanyManagementAppliedFilters(nextFilters);
  }, [
    companyManagementAppliedFilters.companyName,
    companyManagementAppliedFilters.employeeCountRange,
    companyManagementAppliedFilters.foundedYearMin,
    companyManagementAppliedFilters.hasCareerUrlOnly,
    companyManagementAppliedFilters.investors,
    companyManagementAppliedFilters.location,
    companyManagementAppliedFilters.qualityLabel,
    companyManagementCompanyName,
    companyManagementEmployeeCountRange,
    companyManagementFoundedYearMin,
    companyManagementHasCareerUrlOnly,
    companyManagementInvestors,
    companyManagementLocation,
    companyManagementQualityLabel,
    refetchCompanyManagement,
  ]);

  const handleCompanyQualityLabelChange = useCallback(
    async (
      company: OpsCompanyManagementRecord,
      humanQualityLabel: OpsCompanyQualityLabel | null
    ) => {
      const workspaceId = company.companyWorkspaceId;
      if (!workspaceId) return;

      setUpdatingQualityLabelIds((current) => {
        const next = new Set(current);
        next.add(workspaceId);
        return next;
      });

      try {
        await updateCompanyHumanQualityLabel.mutateAsync({
          humanQualityLabel,
          workspaceId,
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "human_quality_label 업데이트에 실패했습니다.",
          variant: "white",
        });
      } finally {
        setUpdatingQualityLabelIds((current) => {
          const next = new Set(current);
          next.delete(workspaceId);
          return next;
        });
      }
    },
    [updateCompanyHumanQualityLabel]
  );

  const refreshPending =
    view === "company_management"
      ? companyManagementQuery.isFetching
      : catalog.isFetching;

  return (
    <>
      <Head>
        <title>Harper Ops Opportunities</title>
        <meta
          name="description"
          content="Ops company and opportunity catalog management"
        />
      </Head>

      <OpsShell
        compactHeader
        title="Company / Opportunity Ops"
        description="회사와 기회 목록을 관리합니다."
        actions={
          <BareButton
            type="button"
            onClick={handleRefresh}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
          >
            {refreshPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </BareButton>
        }
      >
        <ViewTabs view={view} onChange={setViewWithUrl} />

        {view === "catalog" ? (
          <CatalogView
            catalogErrorMessage={catalog.catalogErrorMessage}
            catalogLoading={catalog.catalogLoading}
            filteredRoles={catalog.catalogRoles}
            filteredWorkspaces={catalog.workspaces}
            onLoadMoreRoles={catalog.onLoadMoreRoles}
            onLoadMoreWorkspaces={catalog.onLoadMoreWorkspaces}
            onRoleEdit={openRoleEditModalForRole}
            onOpenRoleCreateModal={openRoleCreateModal}
            onOpenRoleEditModal={openRoleEditModal}
            onOpenWorkspaceCreateModal={openWorkspaceCreateModal}
            onOpenWorkspaceEditModal={openWorkspaceEditModal}
            onRoleSearchChange={catalog.onRoleSearchChange}
            onRoleSearchSubmit={catalog.onRoleSearchSubmit}
            onRoleSelect={(roleId) => {
              setRoleDraftMode("edit");
              catalog.onRoleSelect(roleId);
            }}
            onRoleSync={() => void handleRoleSync()}
            onWorkspaceSearchChange={catalog.onWorkspaceSearchChange}
            onWorkspaceSearchSubmit={catalog.onWorkspaceSearchSubmit}
            onWorkspaceSelect={(workspaceId) => {
              setWorkspaceDraftMode("edit");
              catalog.onWorkspaceSelect(workspaceId);
            }}
            roleSearch={catalog.roleSearch}
            roleLoading={catalog.roleLoading}
            roleTotalCount={catalog.roleTotalCount}
            syncRolePending={syncRoles.isPending}
            selectedRoleId={selectedRoleId}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            workspaceSearch={catalog.workspaceSearch}
            workspaceTotalCount={catalog.workspaceTotalCount}
          />
        ) : (
          <CompanyManagementView
            companies={companyManagementRows}
            companyNameSearch={companyManagementCompanyName}
            employeeCountRange={companyManagementEmployeeCountRange}
            error={companyManagementQuery.error}
            foundedYearMin={companyManagementFoundedYearMin}
            hasCareerUrlOnly={companyManagementHasCareerUrlOnly}
            hasNextPage={Boolean(companyManagementQuery.hasNextPage)}
            investorsSearch={companyManagementInvestors}
            isFetching={companyManagementQuery.isFetching}
            isFetchingNextPage={companyManagementQuery.isFetchingNextPage}
            isLoading={companyManagementQuery.isLoading}
            locationSearch={companyManagementLocation}
            onCompanyNameSearchChange={setCompanyManagementCompanyName}
            onEmployeeCountRangeChange={setCompanyManagementEmployeeCountRange}
            onFetchNextPage={fetchNextCompanyManagementPage}
            onFoundedYearMinChange={(value) =>
              setCompanyManagementFoundedYearMin(
                value.replace(/[^\d]/g, "").slice(0, 4)
              )
            }
            onHasCareerUrlOnlyChange={setCompanyManagementHasCareerUrlOnly}
            onInvestorsSearchChange={setCompanyManagementInvestors}
            onLocationSearchChange={setCompanyManagementLocation}
            onQualityLabelChange={setCompanyManagementQualityLabel}
            onReviewModeChange={setCompanyManagementReviewMode}
            onReviewUnlabeledFirstChange={
              setCompanyManagementReviewUnlabeledFirst
            }
            onSearch={handleCompanyManagementSearch}
            onHumanQualityLabelChange={handleCompanyQualityLabelChange}
            qualityLabel={companyManagementQualityLabel}
            reviewMode={companyManagementReviewMode}
            reviewUnlabeledFirst={companyManagementReviewUnlabeledFirst}
            updatingQualityLabelIds={updatingQualityLabelIds}
          />
        )}
      </OpsShell>

      <WorkspaceCreateModal
        open={isWorkspaceCreateModalOpen}
        draft={workspaceDraft}
        extractPending={extractWorkspace.isPending}
        mode={workspaceDraftMode}
        onChange={setWorkspaceDraft}
        onClose={closeWorkspaceCreateModal}
        onExtract={() => void handleWorkspaceExtract()}
        onSubmit={() => void handleWorkspaceSave()}
        pending={saveWorkspace.isPending}
      />
      <RoleCreateModal
        open={isRoleCreateModalOpen}
        deletePending={deleteRole.isPending}
        draft={roleDraft}
        mode={roleDraftMode}
        onChange={setRoleDraft}
        onClose={closeRoleCreateModal}
        onDelete={() => void handleRoleDelete()}
        onSubmit={() => void handleRoleSave()}
        pending={saveRole.isPending}
        workspaceName={selectedWorkspace?.companyName ?? null}
      />
    </>
  );
}
