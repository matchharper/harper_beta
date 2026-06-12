import OpsShell from "@/components/ops/OpsShell";
import CatalogView from "@/components/ops/opportunities/CatalogView";
import CompanyManagementView from "@/components/ops/opportunities/CompanyManagementView";
import CompanyMatchView from "@/components/ops/opportunities/CompanyMatchView";
import {
  CandidateMailModal,
  RecommendationPromptModal,
  RoleCreateModal,
  WorkspaceCreateModal,
} from "@/components/ops/opportunities/modals";
import {
  type CandidateMailDraft,
  type DraftMode,
  EMPTY_CANDIDATE_MAIL_DRAFT,
  EMPTY_ROLE_DRAFT,
  EMPTY_WORKSPACE_DRAFT,
  getPageViewFromQuery,
  matchesRoleQuery,
  PAGE_VIEW_QUERY_KEY,
  type PageView,
  type RoleDraft,
  roleToDraft,
  type WorkspaceDraft,
  workspaceToDraft,
} from "@/components/ops/opportunities/shared";
import TalentRecommendationView from "@/components/ops/opportunities/TalentRecommendationView";
import { ViewTabs } from "@/components/ops/opportunities/ViewTabs";
import { showToast } from "@/components/toast/toast";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useGenerateOpsOpportunityRecommendationDraft,
  useSendOpsOpportunityCandidateMail,
  useDeleteOpsOpportunityMatch,
  useDeleteOpsOpportunityRecommendation,
  useExtractOpsOpportunityWorkspace,
  useOpsOpportunityCandidates,
  useOpsOpportunityCompanies,
  useOpsOpportunityMatches,
  useOpsOpportunityRecommendations,
  useSaveOpsOpportunityMatch,
  useSaveOpsOpportunityRecommendation,
  useSaveOpsOpportunityRole,
  useSaveOpsOpportunityWorkspace,
  useSyncOpsOpportunityRoles,
  useUpdateOpsCompanyHumanQualityLabel,
  useUpdateOpsCompanyScrapeOriginal,
} from "@/hooks/useOpsOpportunities";
import { useOpsOpportunityCatalogController } from "@/hooks/useOpsOpportunityCatalogController";
import {
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/opsOpportunityCompanyManagement";
import type {
  OpsCompanyQualityLabel,
  OpsCompanyManagementRecord,
  OpsOpportunityCandidateRecord,
  OpsOpportunityRoleRecord,
  OpsOpportunityType,
} from "@/lib/opsOpportunity";
import { OpportunityType } from "@/lib/opportunityType";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import { DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT } from "@/lib/opsOpportunityRecommendationPrompt";
import { useOpsOpportunityRecommendationPromptStore } from "@/store/useOpsOpportunityRecommendationPromptStore";
import { LoaderCircle, RefreshCw } from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";

export default function OpsOpportunitiesPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const savedRecommendationPromptTemplate =
    useOpsOpportunityRecommendationPromptStore((state) => state.promptTemplate);
  const setSavedRecommendationPromptTemplate =
    useOpsOpportunityRecommendationPromptStore(
      (state) => state.setPromptTemplate
    );
  const resetSavedRecommendationPromptTemplate =
    useOpsOpportunityRecommendationPromptStore(
      (state) => state.resetPromptTemplate
    );
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

  const [companyRoleSearch, setCompanyRoleSearch] = useState("");
  const [selectedCompanyRoleId, setSelectedCompanyRoleId] = useState<
    string | null
  >(null);
  const [companyTalentInput, setCompanyTalentInput] = useState("");
  const [companyTalentSearchQuery, setCompanyTalentSearchQuery] = useState("");
  const [selectedCompanyTalent, setSelectedCompanyTalent] =
    useState<OpsOpportunityCandidateRecord | null>(null);
  const [companyMemo, setCompanyMemo] = useState("");

  const [recommendationRoleSearch, setRecommendationRoleSearch] = useState("");
  const [selectedRecommendationRoleId, setSelectedRecommendationRoleId] =
    useState<string | null>(null);
  const [recommendationTalentInput, setRecommendationTalentInput] =
    useState("");
  const [recommendationTalentSearchQuery, setRecommendationTalentSearchQuery] =
    useState("");
  const [selectedRecommendationTalent, setSelectedRecommendationTalent] =
    useState<OpsOpportunityCandidateRecord | null>(null);
  const [recommendationOpportunityType, setRecommendationOpportunityType] =
    useState<OpsOpportunityType>(OpportunityType.ExternalJd);
  const [recommendationMemo, setRecommendationMemo] = useState("");
  const [isRecommendationPromptModalOpen, setIsRecommendationPromptModalOpen] =
    useState(false);
  const [recommendationPromptDraft, setRecommendationPromptDraft] = useState(
    savedRecommendationPromptTemplate
  );
  const [mailTalent, setMailTalent] =
    useState<OpsOpportunityCandidateRecord | null>(null);
  const [candidateMailDraft, setCandidateMailDraft] =
    useState<CandidateMailDraft>(EMPTY_CANDIDATE_MAIL_DRAFT);
  const [updatingScrapeOriginalIds, setUpdatingScrapeOriginalIds] = useState(
    () => new Set<string>()
  );
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

  const deferredCompanyRoleSearch = useDeferredValue(
    companyRoleSearch.trim().toLowerCase()
  );
  const deferredRecommendationRoleSearch = useDeferredValue(
    recommendationRoleSearch.trim().toLowerCase()
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
  const saveMatch = useSaveOpsOpportunityMatch();
  const deleteMatch = useDeleteOpsOpportunityMatch();
  const saveRecommendation = useSaveOpsOpportunityRecommendation();
  const generateRecommendationDraft =
    useGenerateOpsOpportunityRecommendationDraft();
  const deleteRecommendation = useDeleteOpsOpportunityRecommendation();
  const sendCandidateMail = useSendOpsOpportunityCandidateMail();
  const updateCompanyScrapeOriginal = useUpdateOpsCompanyScrapeOriginal();
  const updateCompanyHumanQualityLabel = useUpdateOpsCompanyHumanQualityLabel();

  const roles = catalog.allRoles;
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

  const internalRoleOptions = useMemo(
    () =>
      roles.filter(
        (role) =>
          role.sourceType === "internal" &&
          matchesRoleQuery(role, deferredCompanyRoleSearch)
      ),
    [deferredCompanyRoleSearch, roles]
  );

  const recommendationRoleOptions = useMemo(
    () =>
      roles.filter((role) =>
        matchesRoleQuery(role, deferredRecommendationRoleSearch)
      ),
    [deferredRecommendationRoleSearch, roles]
  );

  const selectedCompanyRole = useMemo(
    () =>
      roles.find(
        (role) =>
          role.roleId === selectedCompanyRoleId &&
          role.sourceType === "internal"
      ) ??
      roles.find((role) => role.sourceType === "internal") ??
      null,
    [roles, selectedCompanyRoleId]
  );
  const selectedCompanyRoleIdForView = selectedCompanyRole?.roleId ?? null;

  const selectedRecommendationRole = useMemo(
    () =>
      roles.find((role) => role.roleId === selectedRecommendationRoleId) ??
      roles[0] ??
      null,
    [roles, selectedRecommendationRoleId]
  );
  const selectedRecommendationRoleIdForView =
    selectedRecommendationRole?.roleId ?? null;

  const companyCandidateQuery = useOpsOpportunityCandidates({
    enabled: canFetchInternal && view === "company_match",
    query: companyTalentSearchQuery,
    roleId: selectedCompanyRoleIdForView,
  });

  const recommendationTalentQuery = useOpsOpportunityCandidates({
    enabled: canFetchInternal && view === "talent_recommendation",
    query: recommendationTalentSearchQuery,
  });

  const visibleCompanyCandidates = useMemo(
    () =>
      (companyCandidateQuery.data?.items ?? []).filter(
        (item) =>
          !isEmailExcludedByOpsInternalTerms(item.email, emailExclusionTerms)
      ),
    [companyCandidateQuery.data?.items, emailExclusionTerms]
  );
  const visibleRecommendationTalents = useMemo(
    () =>
      (recommendationTalentQuery.data?.items ?? []).filter(
        (item) =>
          !isEmailExcludedByOpsInternalTerms(item.email, emailExclusionTerms)
      ),
    [emailExclusionTerms, recommendationTalentQuery.data?.items]
  );
  const visibleSelectedCompanyTalent = useMemo(() => {
    if (!selectedCompanyTalent) return null;
    const refreshed =
      visibleCompanyCandidates.find(
        (item) => item.talentId === selectedCompanyTalent.talentId
      ) ?? selectedCompanyTalent;
    return isEmailExcludedByOpsInternalTerms(
      refreshed.email,
      emailExclusionTerms
    )
      ? null
      : refreshed;
  }, [emailExclusionTerms, selectedCompanyTalent, visibleCompanyCandidates]);
  const visibleSelectedRecommendationTalent = useMemo(() => {
    if (!selectedRecommendationTalent) return null;
    const refreshed =
      visibleRecommendationTalents.find(
        (item) => item.talentId === selectedRecommendationTalent.talentId
      ) ?? selectedRecommendationTalent;
    return isEmailExcludedByOpsInternalTerms(
      refreshed.email,
      emailExclusionTerms
    )
      ? null
      : refreshed;
  }, [
    emailExclusionTerms,
    selectedRecommendationTalent,
    visibleRecommendationTalents,
  ]);

  const roleMatchesQuery = useOpsOpportunityMatches({
    enabled:
      canFetchInternal &&
      view === "company_match" &&
      Boolean(selectedCompanyRoleIdForView),
    roleId: selectedCompanyRoleIdForView,
  });

  const talentRecommendationsQuery = useOpsOpportunityRecommendations({
    enabled:
      canFetchInternal &&
      view === "talent_recommendation" &&
      Boolean(visibleSelectedRecommendationTalent?.talentId),
    talentId: visibleSelectedRecommendationTalent?.talentId,
  });

  const getDefaultCandidateMailSubject = () => {
    const activeRole =
      view === "company_match"
        ? selectedCompanyRole
        : selectedRecommendationRole;
    if (activeRole) {
      return `${activeRole.companyName} ${activeRole.name} 관련 안내`;
    }
    return "Harper에서 안내드립니다";
  };

  const openCandidateMailModal = (talent: OpsOpportunityCandidateRecord) => {
    if (!talent.email) {
      showToast({
        message: "이 talent에는 등록된 이메일이 없습니다.",
        variant: "white",
      });
      return;
    }

    setMailTalent(talent);
    setCandidateMailDraft({
      content: "",
      fromEmail: user?.email ?? "",
      subject: getDefaultCandidateMailSubject(),
    });
  };

  const closeCandidateMailModal = () => {
    if (sendCandidateMail.isPending) return;
    setMailTalent(null);
    setCandidateMailDraft(EMPTY_CANDIDATE_MAIL_DRAFT);
  };

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
      if (response.role.sourceType === "internal") {
        setSelectedCompanyRoleId(response.role.roleId);
      }
      setSelectedRecommendationRoleId(response.role.roleId);
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
    if (saveRole.isPending) return;
    setIsRoleCreateModalOpen(false);
    setRoleDraftMode("edit");
    setRoleDraft(roleToDraft(selectedRole));
  };

  const handleCreateCompanyMatch = async () => {
    if (!selectedCompanyRole || !visibleSelectedCompanyTalent?.candidId) {
      showToast({
        message: "candid로 연결된 talent를 선택해야 합니다.",
        variant: "white",
      });
      return;
    }

    try {
      await saveMatch.mutateAsync({
        candidId: visibleSelectedCompanyTalent.candidId,
        harperMemo: companyMemo,
        roleId: selectedCompanyRole.roleId,
      });
      setCompanyMemo("");
      showToast({
        message: "회사 전달용 매칭을 저장했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "매칭 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleCreateRecommendation = async () => {
    if (!selectedRecommendationRole || !visibleSelectedRecommendationTalent) {
      return;
    }

    try {
      await saveRecommendation.mutateAsync({
        opportunityType: recommendationOpportunityType,
        recommendationMemo: recommendationMemo,
        roleId: selectedRecommendationRole.roleId,
        talentId: visibleSelectedRecommendationTalent.talentId,
      });
      setRecommendationMemo("");
      showToast({
        message: "후보자 추천을 저장했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "추천 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleGenerateRecommendationMemo = async () => {
    if (!selectedRecommendationRole || !visibleSelectedRecommendationTalent) {
      showToast({
        message: "talent와 기회를 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }

    try {
      const response = await generateRecommendationDraft.mutateAsync({
        opportunityType: recommendationOpportunityType,
        promptTemplate: savedRecommendationPromptTemplate,
        roleId: selectedRecommendationRole.roleId,
        talentId: visibleSelectedRecommendationTalent.talentId,
      });
      setRecommendationMemo(response.draft);
      showToast({
        message: "추천 문구를 작성했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "추천 문구 생성에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const openRecommendationPromptModal = () => {
    setRecommendationPromptDraft(savedRecommendationPromptTemplate);
    setIsRecommendationPromptModalOpen(true);
  };

  const handleSaveRecommendationPrompt = () => {
    const nextPrompt = recommendationPromptDraft.trim();
    if (!nextPrompt) {
      showToast({
        message: "프롬프트를 비워둘 수 없습니다.",
        variant: "white",
      });
      return;
    }

    if (nextPrompt === DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT) {
      resetSavedRecommendationPromptTemplate();
    } else {
      setSavedRecommendationPromptTemplate(nextPrompt);
    }
    setIsRecommendationPromptModalOpen(false);
    showToast({
      message: "프롬프트를 저장했습니다.",
      variant: "white",
    });
  };

  const handleDeleteMatch = async (candidId: string, roleId: string) => {
    if (!window.confirm("이 매칭을 제거할까요?")) return;

    try {
      await deleteMatch.mutateAsync({ candidId, roleId });
      showToast({
        message: "매칭을 제거했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "매칭 제거에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleDeleteRecommendation = async (recommendationId: string) => {
    if (!window.confirm("이 추천을 제거할까요?")) return;

    try {
      await deleteRecommendation.mutateAsync({ recommendationId });
      showToast({
        message: "추천을 제거했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "추천 제거에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleSendCandidateMail = async () => {
    if (!mailTalent) return;

    try {
      await sendCandidateMail.mutateAsync({
        content: candidateMailDraft.content.trim(),
        fromEmail: candidateMailDraft.fromEmail.trim(),
        subject: candidateMailDraft.subject.trim(),
        talentId: mailTalent.talentId,
      });
      showToast({
        message: "메일 발송 완료",
        variant: "white",
      });
      closeCandidateMailModal();
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메일 발송에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleRefresh = useCallback(() => {
    if (view === "company_management") {
      void refetchCompanyManagement();
      return;
    }
    if (view === "catalog") {
      void catalog.refetchCatalog();
      void catalog.refetchRoles();
      return;
    }
    void catalog.refetchCatalog();
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

  const handleCompanyScrapeOriginalChange = useCallback(
    async (company: OpsCompanyManagementRecord, nextValue: boolean) => {
      const workspaceId = company.companyWorkspaceId;
      if (!workspaceId) return;

      setUpdatingScrapeOriginalIds((current) => {
        const next = new Set(current);
        next.add(workspaceId);
        return next;
      });

      try {
        await updateCompanyScrapeOriginal.mutateAsync({
          isScrapeOriginal: nextValue,
          workspaceId,
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "is_scrape_original 업데이트에 실패했습니다.",
          variant: "white",
        });
      } finally {
        setUpdatingScrapeOriginalIds((current) => {
          const next = new Set(current);
          next.delete(workspaceId);
          return next;
        });
      }
    },
    [updateCompanyScrapeOriginal]
  );

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
          content="Ops catalog, company-side candidate matching, and talent-side opportunity recommendations"
        />
      </Head>

      <OpsShell
        compactHeader
        title="Company / Opportunity Ops"
        description="회사와 기회를 관리하고, 회사 전달용 후보자 매칭과 후보자 전달용 기회 추천을 분리해서 운영합니다."
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
        ) : view === "company_management" ? (
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
            onScrapeOriginalChange={handleCompanyScrapeOriginalChange}
            qualityLabel={companyManagementQualityLabel}
            reviewMode={companyManagementReviewMode}
            reviewUnlabeledFirst={companyManagementReviewUnlabeledFirst}
            updatingQualityLabelIds={updatingQualityLabelIds}
            updatingScrapeOriginalIds={updatingScrapeOriginalIds}
          />
        ) : view === "company_match" ? (
          <CompanyMatchView
            companyCandidates={visibleCompanyCandidates}
            companyCandidateLoading={companyCandidateQuery.isLoading}
            companyMemo={companyMemo}
            companyRoleSearch={companyRoleSearch}
            companyTalentInput={companyTalentInput}
            companyTalentSearchQuery={companyTalentSearchQuery}
            internalRoleOptions={internalRoleOptions}
            onCompanyMemoChange={setCompanyMemo}
            onCompanyRoleSearchChange={setCompanyRoleSearch}
            onCompanyRoleSelect={setSelectedCompanyRoleId}
            onCompanyTalentInputChange={setCompanyTalentInput}
            onCompanyTalentSearch={() =>
              setCompanyTalentSearchQuery(companyTalentInput.trim())
            }
            onCompanyTalentSelect={setSelectedCompanyTalent}
            onCreateCompanyMatch={() => void handleCreateCompanyMatch()}
            onDeleteMatch={(candidId, roleId) =>
              void handleDeleteMatch(candidId, roleId)
            }
            onOpenCandidateMailModal={openCandidateMailModal}
            onResetSelection={() => {
              setSelectedCompanyTalent(null);
              setCompanyMemo("");
            }}
            roleMatches={roleMatchesQuery.data?.items ?? []}
            roleMatchesLoading={roleMatchesQuery.isLoading}
            saveMatchPending={saveMatch.isPending}
            selectedCompanyRole={selectedCompanyRole}
            selectedCompanyRoleId={selectedCompanyRoleIdForView}
            selectedCompanyTalent={visibleSelectedCompanyTalent}
          />
        ) : (
          <TalentRecommendationView
            generateRecommendationPending={
              generateRecommendationDraft.isPending
            }
            onCreateRecommendation={() => void handleCreateRecommendation()}
            onDeleteRecommendation={(recommendationId) =>
              void handleDeleteRecommendation(recommendationId)
            }
            onGenerateRecommendationMemo={() =>
              void handleGenerateRecommendationMemo()
            }
            onOpenCandidateMailModal={openCandidateMailModal}
            onOpenRecommendationPromptModal={openRecommendationPromptModal}
            onRecommendationMemoChange={setRecommendationMemo}
            onRecommendationOpportunityTypeChange={
              setRecommendationOpportunityType
            }
            onRecommendationRoleSearchChange={setRecommendationRoleSearch}
            onRecommendationRoleSelect={setSelectedRecommendationRoleId}
            onRecommendationTalentInputChange={setRecommendationTalentInput}
            onRecommendationTalentSearch={() =>
              setRecommendationTalentSearchQuery(
                recommendationTalentInput.trim()
              )
            }
            onRecommendationTalentSelect={setSelectedRecommendationTalent}
            onResetRecommendationSelection={() => {
              setSelectedRecommendationTalent(null);
              setRecommendationMemo("");
            }}
            recommendationMemo={recommendationMemo}
            recommendationOpportunityType={recommendationOpportunityType}
            recommendationRoleOptions={recommendationRoleOptions}
            recommendationRoleSearch={recommendationRoleSearch}
            recommendationTalentInput={recommendationTalentInput}
            recommendationTalentLoading={recommendationTalentQuery.isLoading}
            recommendationTalentSearchQuery={recommendationTalentSearchQuery}
            recommendationTalents={visibleRecommendationTalents}
            saveRecommendationPending={saveRecommendation.isPending}
            selectedRecommendationRole={selectedRecommendationRole}
            selectedRecommendationRoleId={selectedRecommendationRoleIdForView}
            selectedRecommendationTalent={visibleSelectedRecommendationTalent}
            talentRecommendations={talentRecommendationsQuery.data?.items ?? []}
            talentRecommendationsLoading={talentRecommendationsQuery.isLoading}
          />
        )}
      </OpsShell>

      <CandidateMailModal
        talent={mailTalent}
        draft={candidateMailDraft}
        onChange={setCandidateMailDraft}
        onClose={closeCandidateMailModal}
        onSubmit={() => void handleSendCandidateMail()}
        pending={sendCandidateMail.isPending}
      />
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
        draft={roleDraft}
        mode={roleDraftMode}
        onChange={setRoleDraft}
        onClose={closeRoleCreateModal}
        onSubmit={() => void handleRoleSave()}
        pending={saveRole.isPending}
        workspaceName={selectedWorkspace?.companyName ?? null}
      />
      <RecommendationPromptModal
        open={isRecommendationPromptModalOpen}
        value={recommendationPromptDraft}
        onChange={setRecommendationPromptDraft}
        onReset={() =>
          setRecommendationPromptDraft(DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT)
        }
        onClose={() => setIsRecommendationPromptModalOpen(false)}
        onSave={handleSaveRecommendationPrompt}
      />
    </>
  );
}
