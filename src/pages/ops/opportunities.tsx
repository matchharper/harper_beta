import OpsShell from "@/components/ops/OpsShell";
import { showToast } from "@/components/toast/toast";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useDeleteOpsOpportunityMatch,
  useDeleteOpsOpportunityRecommendation,
  useOpsOpportunityCandidates,
  useOpsOpportunityCatalog,
  useOpsOpportunityMatches,
  useOpsOpportunityRecommendations,
  useSaveOpsOpportunityMatch,
  useSaveOpsOpportunityRecommendation,
  useSaveOpsOpportunityRole,
  useSaveOpsOpportunityWorkspace,
} from "@/hooks/useOpsOpportunities";
import type {
  OpsOpportunityCandidateRecord,
  OpsOpportunityRecommendationRecord,
  OpsOpportunityRoleRecord,
  OpsOpportunityWorkspaceRecord,
  OpportunityEmploymentType,
  OpportunitySourceType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";
import {
  ArrowLeftRight,
  Building2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import Head from "next/head";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type PageView = "catalog" | "company_match" | "talent_recommendation";
type SourceFilter = "all" | OpportunitySourceType;
type DraftMode = "edit" | "new";

type WorkspaceDraft = {
  companyDescription: string;
  companyName: string;
  homepageUrl: string;
  linkedinUrl: string;
};

type RoleDraft = {
  description: string;
  employmentTypes: OpportunityEmploymentType[];
  expiresAt: string;
  externalJdUrl: string;
  locationText: string;
  name: string;
  postedAt: string;
  sourceJobId: string;
  sourceProvider: string;
  sourceType: OpportunitySourceType;
  status: OpportunityStatus;
  workMode: OpportunityWorkMode | null;
};

const EMPTY_WORKSPACE_DRAFT: WorkspaceDraft = {
  companyDescription: "",
  companyName: "",
  homepageUrl: "",
  linkedinUrl: "",
};

const EMPTY_ROLE_DRAFT: RoleDraft = {
  description: "",
  employmentTypes: [],
  expiresAt: "",
  externalJdUrl: "",
  locationText: "",
  name: "",
  postedAt: "",
  sourceJobId: "",
  sourceProvider: "",
  sourceType: "internal",
  status: "active",
  workMode: null,
};

const EMPLOYMENT_LABEL: Record<OpportunityEmploymentType, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

const STATUS_LABEL: Record<OpportunityStatus, string> = {
  active: "진행",
  ended: "종료",
  paused: "중단",
  top_priority: "최우선",
};

const WORK_MODE_LABEL: Record<OpportunityWorkMode, string> = {
  hybrid: "하이브리드",
  onsite: "상주",
  remote: "리모트",
};

const SOURCE_LABEL: Record<OpportunitySourceType, string> = {
  external: "외부",
  internal: "내부",
};

const RECOMMENDATION_FEEDBACK_LABEL: Record<
  NonNullable<OpsOpportunityRecommendationRecord["feedback"]>,
  string
> = {
  dislike: "Not for me",
  like: "Tracked",
  neutral: "Don't know",
};

const formatDateValue = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const formatUpdatedAt = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const workspaceToDraft = (
  workspace?: OpsOpportunityWorkspaceRecord | null
): WorkspaceDraft => ({
  companyDescription: workspace?.companyDescription ?? "",
  companyName: workspace?.companyName ?? "",
  homepageUrl: workspace?.homepageUrl ?? "",
  linkedinUrl: workspace?.linkedinUrl ?? "",
});

const roleToDraft = (role?: OpsOpportunityRoleRecord | null): RoleDraft => ({
  description: role?.description ?? "",
  employmentTypes: role?.employmentTypes ?? [],
  expiresAt: formatDateValue(role?.expiresAt),
  externalJdUrl: role?.externalJdUrl ?? "",
  locationText: role?.locationText ?? "",
  name: role?.name ?? "",
  postedAt: formatDateValue(role?.postedAt),
  sourceJobId: role?.sourceJobId ?? "",
  sourceProvider: role?.sourceProvider ?? "",
  sourceType: role?.sourceType ?? "internal",
  status: role?.status ?? "active",
  workMode: role?.workMode ?? null,
});

const matchesWorkspaceQuery = (
  workspace: OpsOpportunityWorkspaceRecord,
  query: string
) => {
  if (!query) return true;
  const haystack = [
    workspace.companyName,
    workspace.companyDescription,
    workspace.homepageUrl,
    workspace.linkedinUrl,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

const matchesRoleQuery = (role: OpsOpportunityRoleRecord, query: string) => {
  if (!query) return true;
  const haystack = [
    role.name,
    role.companyName,
    role.description,
    role.locationText,
    role.sourceProvider,
    role.externalJdUrl,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

const toggleEmploymentType = (
  current: OpportunityEmploymentType[],
  next: OpportunityEmploymentType
) =>
  current.includes(next)
    ? current.filter((item) => item !== next)
    : [...current, next];

function ActionButton({
  active = false,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md px-3 py-2 font-geist text-xs transition",
        active
          ? "bg-beige900 text-beige100"
          : "bg-white/65 text-beige900 hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

function PanelHeader({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="font-geist text-[13px] font-medium text-beige900/72">
        {title}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-4 font-geist text-sm text-beige900/55")}>
      {copy}
    </div>
  );
}

function Token({
  active = false,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-1 font-geist text-[11px]",
        active
          ? "bg-beige900 text-beige100"
          : "bg-white/70 text-beige900/68"
      )}
    >
      {children}
    </span>
  );
}

function ToggleGrid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function RoleOptionCard({
  action,
  active,
  onSelect,
  role,
}: {
  action?: ReactNode;
  active?: boolean;
  onSelect: () => void;
  role: OpsOpportunityRoleRecord;
}) {
  return (
    <div
      className={cx(
        "rounded-md px-3 py-3 transition",
        active ? "bg-beige900 text-beige100" : "bg-white/65 text-beige900"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate font-geist text-sm font-medium">
            {role.name}
          </div>
          <div
            className={cx(
              "mt-1 text-xs",
              active ? "text-beige100/70" : "text-beige900/52"
            )}
          >
            {role.companyName} · {role.matchedCandidateCount} matches
          </div>
        </button>
        {action}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Token active={active}>{SOURCE_LABEL[role.sourceType]}</Token>
        <Token active={active}>{STATUS_LABEL[role.status]}</Token>
        {role.workMode ? (
          <Token active={active}>{WORK_MODE_LABEL[role.workMode]}</Token>
        ) : null}
        {role.employmentTypes.map((type) => (
          <Token key={type} active={active}>
            {EMPLOYMENT_LABEL[type]}
          </Token>
        ))}
      </div>
      {role.locationText || role.postedAt ? (
        <div
          className={cx(
            "mt-2 text-xs",
            active ? "text-beige100/72" : "text-beige900/52"
          )}
        >
          {[role.locationText, formatShortDate(role.postedAt)]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function TalentOptionCard({
  active,
  item,
  onSelect,
}: {
  active?: boolean;
  item: OpsOpportunityCandidateRecord;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "w-full rounded-md px-3 py-3 text-left transition",
        active
          ? "bg-beige900 text-beige100"
          : "bg-white/65 text-beige900 hover:bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-geist text-sm font-medium">
            {item.name ?? "Unnamed talent"}
          </div>
          <div
            className={cx(
              "mt-1 text-xs",
              active ? "text-beige100/72" : "text-beige900/55"
            )}
          >
            {item.headline ?? item.location ?? "-"}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {item.matched ? <Token active={active}>matched</Token> : null}
          {!item.candidId ? <Token active={active}>candid 없음</Token> : null}
        </div>
      </div>
      {item.summary ? (
        <div
          className={cx(
            "mt-2 line-clamp-2 text-xs leading-5",
            active ? "text-beige100/72" : "text-beige900/58"
          )}
        >
          {item.summary}
        </div>
      ) : null}
    </button>
  );
}

function SearchInput({
  onChange,
  onEnter,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
  value: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cx(opsTheme.input, "pl-9")}
        />
      </div>
      <div className="text-xs text-beige900/42">Enter로 검색</div>
    </div>
  );
}

function SelectionSummary({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}>
      <div className="font-geist text-[11px] text-beige900/42">{title}</div>
      {children}
    </div>
  );
}

export default function OpsOpportunitiesPage() {
  const [view, setView] = useState<PageView>("catalog");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [roleSourceFilter, setRoleSourceFilter] = useState<SourceFilter>("all");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [workspaceDraftMode, setWorkspaceDraftMode] =
    useState<DraftMode>("edit");
  const [roleDraftMode, setRoleDraftMode] = useState<DraftMode>("edit");
  const [workspaceDraft, setWorkspaceDraft] =
    useState<WorkspaceDraft>(EMPTY_WORKSPACE_DRAFT);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(EMPTY_ROLE_DRAFT);

  const [companyRoleSearch, setCompanyRoleSearch] = useState("");
  const [selectedCompanyRoleId, setSelectedCompanyRoleId] = useState<string | null>(
    null
  );
  const [companyTalentInput, setCompanyTalentInput] = useState("");
  const [companyTalentSearchQuery, setCompanyTalentSearchQuery] = useState("");
  const [selectedCompanyTalent, setSelectedCompanyTalent] =
    useState<OpsOpportunityCandidateRecord | null>(null);
  const [companyMemo, setCompanyMemo] = useState("");

  const [recommendationRoleSearch, setRecommendationRoleSearch] = useState("");
  const [selectedRecommendationRoleId, setSelectedRecommendationRoleId] =
    useState<string | null>(null);
  const [recommendationTalentInput, setRecommendationTalentInput] = useState("");
  const [recommendationTalentSearchQuery, setRecommendationTalentSearchQuery] =
    useState("");
  const [selectedRecommendationTalent, setSelectedRecommendationTalent] =
    useState<OpsOpportunityCandidateRecord | null>(null);
  const [recommendationMemo, setRecommendationMemo] = useState("");

  const deferredWorkspaceSearch = useDeferredValue(
    workspaceSearch.trim().toLowerCase()
  );
  const deferredRoleSearch = useDeferredValue(roleSearch.trim().toLowerCase());
  const deferredCompanyRoleSearch = useDeferredValue(
    companyRoleSearch.trim().toLowerCase()
  );
  const deferredRecommendationRoleSearch = useDeferredValue(
    recommendationRoleSearch.trim().toLowerCase()
  );

  const catalogQuery = useOpsOpportunityCatalog();
  const saveWorkspace = useSaveOpsOpportunityWorkspace();
  const saveRole = useSaveOpsOpportunityRole();
  const saveMatch = useSaveOpsOpportunityMatch();
  const deleteMatch = useDeleteOpsOpportunityMatch();
  const saveRecommendation = useSaveOpsOpportunityRecommendation();
  const deleteRecommendation = useDeleteOpsOpportunityRecommendation();

  const workspaces = useMemo(
    () => catalogQuery.data?.workspaces ?? [],
    [catalogQuery.data?.workspaces]
  );
  const roles = useMemo(
    () => catalogQuery.data?.roles ?? [],
    [catalogQuery.data?.roles]
  );

  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter((workspace) =>
        matchesWorkspaceQuery(workspace, deferredWorkspaceSearch)
      ),
    [deferredWorkspaceSearch, workspaces]
  );

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find(
        (workspace) => workspace.companyWorkspaceId === selectedWorkspaceId
      ) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const scopedRoles = useMemo(
    () =>
      roles.filter((role) =>
        selectedWorkspaceId
          ? role.companyWorkspaceId === selectedWorkspaceId
          : true
      ),
    [roles, selectedWorkspaceId]
  );

  const filteredRoles = useMemo(
    () =>
      scopedRoles.filter((role) => {
        if (roleSourceFilter !== "all" && role.sourceType !== roleSourceFilter) {
          return false;
        }
        return matchesRoleQuery(role, deferredRoleSearch);
      }),
    [deferredRoleSearch, roleSourceFilter, scopedRoles]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.roleId === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

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
    () => roles.find((role) => role.roleId === selectedCompanyRoleId) ?? null,
    [roles, selectedCompanyRoleId]
  );

  const selectedRecommendationRole = useMemo(
    () =>
      roles.find((role) => role.roleId === selectedRecommendationRoleId) ?? null,
    [roles, selectedRecommendationRoleId]
  );

  const companyCandidateQuery = useOpsOpportunityCandidates({
    enabled: view === "company_match",
    query: companyTalentSearchQuery,
    roleId: selectedCompanyRoleId,
  });

  const recommendationTalentQuery = useOpsOpportunityCandidates({
    enabled: view === "talent_recommendation",
    query: recommendationTalentSearchQuery,
  });

  const roleMatchesQuery = useOpsOpportunityMatches({
    enabled: view === "company_match" && Boolean(selectedCompanyRoleId),
    roleId: selectedCompanyRoleId,
  });

  const talentRecommendationsQuery = useOpsOpportunityRecommendations({
    enabled:
      view === "talent_recommendation" &&
      Boolean(selectedRecommendationTalent?.talentId),
    talentId: selectedRecommendationTalent?.talentId,
  });

  useEffect(() => {
    if (
      selectedWorkspaceId &&
      workspaces.some((item) => item.companyWorkspaceId === selectedWorkspaceId)
    ) {
      return;
    }
    setSelectedWorkspaceId(workspaces[0]?.companyWorkspaceId ?? null);
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (
      selectedRoleId &&
      roles.some(
        (role) =>
          role.roleId === selectedRoleId &&
          (!selectedWorkspaceId || role.companyWorkspaceId === selectedWorkspaceId)
      )
    ) {
      return;
    }
    const nextRole =
      roles.find((role) => role.companyWorkspaceId === selectedWorkspaceId) ?? null;
    setSelectedRoleId(nextRole?.roleId ?? null);
  }, [roles, selectedRoleId, selectedWorkspaceId]);

  useEffect(() => {
    if (
      selectedCompanyRoleId &&
      roles.some(
        (role) =>
          role.roleId === selectedCompanyRoleId && role.sourceType === "internal"
      )
    ) {
      return;
    }
    setSelectedCompanyRoleId(
      roles.find((role) => role.sourceType === "internal")?.roleId ?? null
    );
  }, [roles, selectedCompanyRoleId]);

  useEffect(() => {
    if (
      selectedRecommendationRoleId &&
      roles.some((role) => role.roleId === selectedRecommendationRoleId)
    ) {
      return;
    }
    setSelectedRecommendationRoleId(roles[0]?.roleId ?? null);
  }, [roles, selectedRecommendationRoleId]);

  useEffect(() => {
    if (workspaceDraftMode !== "edit") return;
    setWorkspaceDraft(workspaceToDraft(selectedWorkspace));
  }, [selectedWorkspace, workspaceDraftMode]);

  useEffect(() => {
    if (roleDraftMode !== "edit") return;
    setRoleDraft(roleToDraft(selectedRole));
  }, [roleDraftMode, selectedRole]);

  useEffect(() => {
    if (!selectedCompanyTalent) return;
    const refreshed = (companyCandidateQuery.data?.items ?? []).find(
      (item) => item.talentId === selectedCompanyTalent.talentId
    );
    if (refreshed) {
      setSelectedCompanyTalent(refreshed);
    }
  }, [companyCandidateQuery.data?.items, selectedCompanyTalent]);

  useEffect(() => {
    if (!selectedRecommendationTalent) return;
    const refreshed = (recommendationTalentQuery.data?.items ?? []).find(
      (item) => item.talentId === selectedRecommendationTalent.talentId
    );
    if (refreshed) {
      setSelectedRecommendationTalent(refreshed);
    }
  }, [recommendationTalentQuery.data?.items, selectedRecommendationTalent]);

  const handleWorkspaceSave = async () => {
    try {
      const response = await saveWorkspace.mutateAsync({
        ...workspaceDraft,
        workspaceId:
          workspaceDraftMode === "edit" ? selectedWorkspace?.companyWorkspaceId : null,
      });
      setWorkspaceDraftMode("edit");
      setSelectedWorkspaceId(response.workspace.companyWorkspaceId);
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

  const handleRoleSave = async () => {
    try {
      const response = await saveRole.mutateAsync({
        ...roleDraft,
        companyWorkspaceId: selectedWorkspaceId,
        roleId: roleDraftMode === "edit" ? selectedRole?.roleId : null,
      });
      setRoleDraftMode("edit");
      setSelectedRoleId(response.role.roleId);
      if (response.role.sourceType === "internal") {
        setSelectedCompanyRoleId(response.role.roleId);
      }
      setSelectedRecommendationRoleId(response.role.roleId);
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

  const handleCreateCompanyMatch = async () => {
    if (!selectedCompanyRole || !selectedCompanyTalent?.candidId) {
      showToast({
        message: "candid로 연결된 talent를 선택해야 합니다.",
        variant: "white",
      });
      return;
    }

    try {
      await saveMatch.mutateAsync({
        candidId: selectedCompanyTalent.candidId,
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
    if (!selectedRecommendationRole || !selectedRecommendationTalent) return;

    try {
      await saveRecommendation.mutateAsync({
        recommendationMemo: recommendationMemo,
        roleId: selectedRecommendationRole.roleId,
        talentId: selectedRecommendationTalent.talentId,
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

  const handleDeleteRecommendation = async (roleId: string, talentId: string) => {
    if (!window.confirm("이 추천을 제거할까요?")) return;

    try {
      await deleteRecommendation.mutateAsync({ roleId, talentId });
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

  const openRoleFlow = (role: OpsOpportunityRoleRecord) => {
    if (role.sourceType === "internal") {
      setView("company_match");
      setSelectedCompanyRoleId(role.roleId);
      return;
    }

    setView("talent_recommendation");
    setSelectedRecommendationRoleId(role.roleId);
  };

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
          <button
            type="button"
            onClick={() => void catalogQuery.refetch()}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
          >
            {catalogQuery.isFetching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </button>
        }
      >
        <section className={cx(opsTheme.panel, "px-4 py-4")}>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              active={view === "catalog"}
              onClick={() => setView("catalog")}
            >
              <Building2 className="mr-2 inline-flex h-3.5 w-3.5" />
              목록 관리
            </ActionButton>
            <ActionButton
              active={view === "company_match"}
              onClick={() => setView("company_match")}
            >
              <ArrowLeftRight className="mr-2 inline-flex h-3.5 w-3.5" />
              회사에게 후보자 추천
            </ActionButton>
            <ActionButton
              active={view === "talent_recommendation"}
              onClick={() => setView("talent_recommendation")}
            >
              <Sparkles className="mr-2 inline-flex h-3.5 w-3.5" />
              후보자에게 회사 추천
            </ActionButton>
          </div>
        </section>

        {view === "catalog" ? (
          <section className="grid gap-4 xl:grid-cols-[300px_1fr_420px]">
            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader
                title="회사"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceDraftMode("new");
                      setWorkspaceDraft(EMPTY_WORKSPACE_DRAFT);
                    }}
                    className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                  >
                    <Plus className="h-4 w-4" />
                    추가
                  </button>
                }
              />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
                <input
                  value={workspaceSearch}
                  onChange={(event) => setWorkspaceSearch(event.target.value)}
                  placeholder="회사명, 링크, 소개 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
              <div className="space-y-2">
                {catalogQuery.isLoading ? (
                  <EmptyState copy="회사 목록을 불러오는 중입니다." />
                ) : filteredWorkspaces.length === 0 ? (
                  <EmptyState copy="조건에 맞는 회사가 없습니다." />
                ) : (
                  filteredWorkspaces.map((workspace) => {
                    const active =
                      workspace.companyWorkspaceId === selectedWorkspaceId &&
                      workspaceDraftMode === "edit";
                    return (
                      <button
                        key={workspace.companyWorkspaceId}
                        type="button"
                        onClick={() => {
                          setWorkspaceDraftMode("edit");
                          setSelectedWorkspaceId(workspace.companyWorkspaceId);
                        }}
                        className={cx(
                          "w-full rounded-md px-3 py-3 text-left transition",
                          active
                            ? "bg-beige900 text-beige100"
                            : "bg-white/65 text-beige900 hover:bg-white"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-geist text-sm font-medium">
                              {workspace.companyName}
                            </div>
                            <div
                              className={cx(
                                "mt-1 text-xs",
                                active ? "text-beige100/70" : "text-beige900/52"
                              )}
                            >
                              {workspace.totalRoleCount} roles
                            </div>
                          </div>
                          <Token active={active}>
                            {workspace.internalRoleCount}/{workspace.externalRoleCount}
                          </Token>
                        </div>
                        {workspace.companyDescription ? (
                          <div
                            className={cx(
                              "mt-2 line-clamp-2 text-xs leading-5",
                              active ? "text-beige100/72" : "text-beige900/58"
                            )}
                          >
                            {workspace.companyDescription}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader
                title="기회"
                action={
                  <button
                    type="button"
                    disabled={!selectedWorkspaceId}
                    onClick={() => {
                      if (!selectedWorkspaceId) return;
                      setRoleDraftMode("new");
                      setRoleDraft(EMPTY_ROLE_DRAFT);
                    }}
                    className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                  >
                    <Plus className="h-4 w-4" />
                    추가
                  </button>
                }
              />
              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
                  <input
                    value={roleSearch}
                    onChange={(event) => setRoleSearch(event.target.value)}
                    placeholder="role, company, location 검색"
                    className={cx(opsTheme.input, "pl-9")}
                  />
                </div>
                <div className="flex gap-2">
                  <ActionButton
                    active={roleSourceFilter === "all"}
                    onClick={() => setRoleSourceFilter("all")}
                  >
                    전체
                  </ActionButton>
                  <ActionButton
                    active={roleSourceFilter === "internal"}
                    onClick={() => setRoleSourceFilter("internal")}
                  >
                    내부
                  </ActionButton>
                  <ActionButton
                    active={roleSourceFilter === "external"}
                    onClick={() => setRoleSourceFilter("external")}
                  >
                    외부
                  </ActionButton>
                </div>
              </div>
              {!selectedWorkspaceId ? (
                <EmptyState copy="먼저 회사를 선택해 주세요." />
              ) : filteredRoles.length === 0 ? (
                <EmptyState copy="이 회사에 표시할 기회가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {filteredRoles.map((role) => (
                    <RoleOptionCard
                      key={role.roleId}
                      role={role}
                      active={role.roleId === selectedRoleId && roleDraftMode === "edit"}
                      onSelect={() => {
                        setRoleDraftMode("edit");
                        setSelectedRoleId(role.roleId);
                      }}
                      action={
                        <button
                          type="button"
                          onClick={() => openRoleFlow(role)}
                          className={cx(
                            "rounded-md px-2 py-1 font-geist text-[11px] transition",
                            role.roleId === selectedRoleId && roleDraftMode === "edit"
                              ? "bg-white/12 text-beige100 hover:bg-white/18"
                              : "bg-beige500/80 text-beige900 hover:bg-beige500/95"
                          )}
                        >
                          {role.sourceType === "internal" ? "회사" : "후보자"}
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
                <PanelHeader
                  title={workspaceDraftMode === "edit" ? "회사 수정" : "회사 추가"}
                  action={
                    workspaceDraftMode === "new" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceDraftMode("edit");
                          setWorkspaceDraft(workspaceToDraft(selectedWorkspace));
                        }}
                        className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                      >
                        <RefreshCw className="h-4 w-4" />
                        되돌리기
                      </button>
                    ) : null
                  }
                />
                <input
                  value={workspaceDraft.companyName}
                  onChange={(event) =>
                    setWorkspaceDraft((current) => ({
                      ...current,
                      companyName: event.target.value,
                    }))
                  }
                  placeholder="회사명"
                  className={opsTheme.input}
                />
                <input
                  value={workspaceDraft.homepageUrl}
                  onChange={(event) =>
                    setWorkspaceDraft((current) => ({
                      ...current,
                      homepageUrl: event.target.value,
                    }))
                  }
                  placeholder="homepage"
                  className={opsTheme.input}
                />
                <input
                  value={workspaceDraft.linkedinUrl}
                  onChange={(event) =>
                    setWorkspaceDraft((current) => ({
                      ...current,
                      linkedinUrl: event.target.value,
                    }))
                  }
                  placeholder="linkedin company url"
                  className={opsTheme.input}
                />
                <textarea
                  value={workspaceDraft.companyDescription}
                  onChange={(event) =>
                    setWorkspaceDraft((current) => ({
                      ...current,
                      companyDescription: event.target.value,
                    }))
                  }
                  placeholder="간단한 소개"
                  className={cx(opsTheme.textarea, "min-h-[120px] px-3 py-3")}
                />
                {selectedWorkspace && workspaceDraftMode === "edit" ? (
                  <div className="text-xs text-beige900/45">
                    last edit · {formatUpdatedAt(selectedWorkspace.updatedAt)}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleWorkspaceSave()}
                  disabled={saveWorkspace.isPending}
                  className={cx(opsTheme.buttonPrimary, "h-10 w-full")}
                >
                  {saveWorkspace.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  저장
                </button>
              </div>

              <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
                <PanelHeader
                  title={roleDraftMode === "edit" ? "기회 수정" : "기회 추가"}
                  action={
                    roleDraftMode === "new" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRoleDraftMode("edit");
                          setRoleDraft(roleToDraft(selectedRole));
                        }}
                        className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                      >
                        <RefreshCw className="h-4 w-4" />
                        되돌리기
                      </button>
                    ) : null
                  }
                />
                {!selectedWorkspaceId ? (
                  <EmptyState copy="회사를 먼저 고르면 role을 바로 붙일 수 있습니다." />
                ) : (
                  <>
                    <input
                      value={roleDraft.name}
                      onChange={(event) =>
                        setRoleDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="role title"
                      className={opsTheme.input}
                    />
                    <ToggleGrid>
                      <ActionButton
                        active={roleDraft.sourceType === "internal"}
                        onClick={() =>
                          setRoleDraft((current) => ({
                            ...current,
                            sourceType: "internal",
                          }))
                        }
                      >
                        내부
                      </ActionButton>
                      <ActionButton
                        active={roleDraft.sourceType === "external"}
                        onClick={() =>
                          setRoleDraft((current) => ({
                            ...current,
                            sourceType: "external",
                          }))
                        }
                      >
                        외부
                      </ActionButton>
                    </ToggleGrid>
                    <ToggleGrid>
                      {(Object.keys(STATUS_LABEL) as OpportunityStatus[]).map(
                        (status) => (
                          <ActionButton
                            key={status}
                            active={roleDraft.status === status}
                            onClick={() =>
                              setRoleDraft((current) => ({
                                ...current,
                                status,
                              }))
                            }
                          >
                            {STATUS_LABEL[status]}
                          </ActionButton>
                        )
                      )}
                    </ToggleGrid>
                    <ToggleGrid>
                      {(
                        Object.keys(EMPLOYMENT_LABEL) as OpportunityEmploymentType[]
                      ).map((type) => (
                        <ActionButton
                          key={type}
                          active={roleDraft.employmentTypes.includes(type)}
                          onClick={() =>
                            setRoleDraft((current) => ({
                              ...current,
                              employmentTypes: toggleEmploymentType(
                                current.employmentTypes,
                                type
                              ),
                            }))
                          }
                        >
                          {EMPLOYMENT_LABEL[type]}
                        </ActionButton>
                      ))}
                    </ToggleGrid>
                    <ToggleGrid>
                      <ActionButton
                        active={roleDraft.workMode === null}
                        onClick={() =>
                          setRoleDraft((current) => ({
                            ...current,
                            workMode: null,
                          }))
                        }
                      >
                        미정
                      </ActionButton>
                      {(Object.keys(WORK_MODE_LABEL) as OpportunityWorkMode[]).map(
                        (mode) => (
                          <ActionButton
                            key={mode}
                            active={roleDraft.workMode === mode}
                            onClick={() =>
                              setRoleDraft((current) => ({
                                ...current,
                                workMode: mode,
                              }))
                            }
                          >
                            {WORK_MODE_LABEL[mode]}
                          </ActionButton>
                        )
                      )}
                    </ToggleGrid>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={roleDraft.sourceProvider}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            sourceProvider: event.target.value,
                          }))
                        }
                        placeholder="source provider"
                        className={opsTheme.input}
                      />
                      <input
                        value={roleDraft.sourceJobId}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            sourceJobId: event.target.value,
                          }))
                        }
                        placeholder="source job id"
                        className={opsTheme.input}
                      />
                    </div>
                    <input
                      value={roleDraft.externalJdUrl}
                      onChange={(event) =>
                        setRoleDraft((current) => ({
                          ...current,
                          externalJdUrl: event.target.value,
                        }))
                      }
                      placeholder="external jd url"
                      className={opsTheme.input}
                    />
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        value={roleDraft.locationText}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            locationText: event.target.value,
                          }))
                        }
                        placeholder="location"
                        className={opsTheme.input}
                      />
                      <input
                        value={roleDraft.postedAt}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            postedAt: event.target.value,
                          }))
                        }
                        placeholder="posted at / YYYY-MM-DD"
                        className={opsTheme.input}
                      />
                      <input
                        value={roleDraft.expiresAt}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            expiresAt: event.target.value,
                          }))
                        }
                        placeholder="expires at / YYYY-MM-DD"
                        className={opsTheme.input}
                      />
                    </div>
                    <textarea
                      value={roleDraft.description}
                      onChange={(event) =>
                        setRoleDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="role description"
                      className={cx(opsTheme.textarea, "min-h-[170px] px-3 py-3")}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRoleSave()}
                      disabled={saveRole.isPending}
                      className={cx(opsTheme.buttonPrimary, "h-10 w-full")}
                    >
                      {saveRole.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      저장
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : view === "company_match" ? (
          <section className="grid gap-4 xl:grid-cols-[320px_1fr_360px]">
            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader title="내부 기회" />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
                <input
                  value={companyRoleSearch}
                  onChange={(event) => setCompanyRoleSearch(event.target.value)}
                  placeholder="internal role 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
              <div className="space-y-2">
                {internalRoleOptions.length === 0 ? (
                  <EmptyState copy="선택 가능한 내부 기회가 없습니다." />
                ) : (
                  internalRoleOptions.map((role) => (
                    <RoleOptionCard
                      key={role.roleId}
                      role={role}
                      active={role.roleId === selectedCompanyRoleId}
                      onSelect={() => setSelectedCompanyRoleId(role.roleId)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader title="talent 검색" />
              <SearchInput
                value={companyTalentInput}
                onChange={setCompanyTalentInput}
                onEnter={() =>
                  setCompanyTalentSearchQuery(companyTalentInput.trim())
                }
                placeholder="talent 검색 후 Enter"
              />
              {!companyTalentSearchQuery ? (
                <EmptyState copy="검색어를 입력하고 Enter를 누르면 talent 목록이 나옵니다." />
              ) : companyCandidateQuery.isLoading ? (
                <EmptyState copy="talent 목록을 불러오는 중입니다." />
              ) : (companyCandidateQuery.data?.items ?? []).length === 0 ? (
                <EmptyState copy="조건에 맞는 talent가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {companyCandidateQuery.data?.items.map((item) => (
                    <TalentOptionCard
                      key={item.talentId}
                      item={item}
                      active={item.talentId === selectedCompanyTalent?.talentId}
                      onSelect={() => setSelectedCompanyTalent(item)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
                <PanelHeader title="현재 선택" />
                <SelectionSummary title="기회">
                  {selectedCompanyRole ? (
                    <>
                      <div className="font-geist text-sm font-medium text-beige900">
                        {selectedCompanyRole.name}
                      </div>
                      <div className="text-xs text-beige900/55">
                        {selectedCompanyRole.companyName}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Token>{STATUS_LABEL[selectedCompanyRole.status]}</Token>
                        {selectedCompanyRole.workMode ? (
                          <Token>
                            {WORK_MODE_LABEL[selectedCompanyRole.workMode]}
                          </Token>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="font-geist text-sm text-beige900/55">
                      내부 기회를 고르세요.
                    </div>
                  )}
                </SelectionSummary>
                <SelectionSummary title="talent">
                  {selectedCompanyTalent ? (
                    <>
                      <div className="font-geist text-sm font-medium text-beige900">
                        {selectedCompanyTalent.name ?? "Unnamed talent"}
                      </div>
                      <div className="text-xs text-beige900/55">
                        {selectedCompanyTalent.headline ??
                          selectedCompanyTalent.location ??
                          "-"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCompanyTalent.candidId ? (
                          <Token>candid 연결됨</Token>
                        ) : (
                          <Token>candid 없음</Token>
                        )}
                      </div>
                      {selectedCompanyTalent.linkedinUrl ? (
                        <a
                          href={selectedCompanyTalent.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cx(opsTheme.link, "text-xs")}
                        >
                          LinkedIn
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <div className="font-geist text-sm text-beige900/55">
                      talent를 고르세요.
                    </div>
                  )}
                </SelectionSummary>
                <textarea
                  value={companyMemo}
                  onChange={(event) => setCompanyMemo(event.target.value)}
                  placeholder="회사에게 전달되는 메모"
                  className={cx(opsTheme.textarea, "min-h-[108px] px-3 py-3")}
                />
                {!selectedCompanyTalent?.candidId && selectedCompanyTalent ? (
                  <div className="text-xs leading-5 text-beige900/48">
                    이 talent는 linkedin 기반 candid 연결을 찾지 못해서 회사 전달용
                    매칭으로는 아직 저장할 수 없습니다.
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateCompanyMatch()}
                    disabled={
                      !selectedCompanyRole ||
                      !selectedCompanyTalent?.candidId ||
                      saveMatch.isPending
                    }
                    className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
                  >
                    {saveMatch.isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="h-4 w-4" />
                    )}
                    매칭 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCompanyTalent(null);
                      setCompanyMemo("");
                    }}
                    className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </div>

            <div className={cx(opsTheme.panel, "space-y-3 p-4 xl:col-span-3")}>
              <PanelHeader title="선택된 role의 매칭들" />
              {!selectedCompanyRoleId ? (
                <EmptyState copy="기회를 선택하면 여기에 연결된 후보자가 보입니다." />
              ) : roleMatchesQuery.isLoading ? (
                <EmptyState copy="매칭 목록을 불러오는 중입니다." />
              ) : (roleMatchesQuery.data?.items ?? []).length === 0 ? (
                <EmptyState copy="아직 연결된 후보자가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {roleMatchesQuery.data?.items.map((item) => (
                    <div
                      key={`${item.roleId}-${item.candidateId}`}
                      className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-geist text-sm font-medium text-beige900">
                            {item.candidateName ?? "Unnamed candidate"}
                          </div>
                          <div className="mt-1 text-xs text-beige900/55">
                            {item.candidateHeadline ?? item.candidateLocation ?? "-"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteMatch(item.candidateId, item.roleId)
                          }
                          className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-beige900/75 transition hover:bg-white"
                        >
                          제거
                        </button>
                      </div>
                      {item.harperMemo ? (
                        <div className="text-xs leading-5 text-beige900/58">
                          {item.harperMemo}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-[320px_1fr_360px]">
            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader title="talent 검색" />
              <SearchInput
                value={recommendationTalentInput}
                onChange={setRecommendationTalentInput}
                onEnter={() =>
                  setRecommendationTalentSearchQuery(
                    recommendationTalentInput.trim()
                  )
                }
                placeholder="talent 검색 후 Enter"
              />
              {!recommendationTalentSearchQuery ? (
                <EmptyState copy="검색어를 입력하고 Enter를 누르면 talent 목록이 나옵니다." />
              ) : recommendationTalentQuery.isLoading ? (
                <EmptyState copy="talent 목록을 불러오는 중입니다." />
              ) : (recommendationTalentQuery.data?.items ?? []).length === 0 ? (
                <EmptyState copy="조건에 맞는 talent가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {recommendationTalentQuery.data?.items.map((item) => (
                    <TalentOptionCard
                      key={item.talentId}
                      item={item}
                      active={item.talentId === selectedRecommendationTalent?.talentId}
                      onSelect={() => setSelectedRecommendationTalent(item)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <PanelHeader title="기회" />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
                <input
                  value={recommendationRoleSearch}
                  onChange={(event) =>
                    setRecommendationRoleSearch(event.target.value)
                  }
                  placeholder="내부 / 외부 전체 기회 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
              <div className="space-y-2">
                {recommendationRoleOptions.length === 0 ? (
                  <EmptyState copy="선택 가능한 기회가 없습니다." />
                ) : (
                  recommendationRoleOptions.map((role) => (
                    <RoleOptionCard
                      key={role.roleId}
                      role={role}
                      active={role.roleId === selectedRecommendationRoleId}
                      onSelect={() => setSelectedRecommendationRoleId(role.roleId)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
                <PanelHeader title="현재 선택" />
                <SelectionSummary title="talent">
                  {selectedRecommendationTalent ? (
                    <>
                      <div className="font-geist text-sm font-medium text-beige900">
                        {selectedRecommendationTalent.name ?? "Unnamed talent"}
                      </div>
                      <div className="text-xs text-beige900/55">
                        {selectedRecommendationTalent.headline ??
                          selectedRecommendationTalent.location ??
                          "-"}
                      </div>
                      {selectedRecommendationTalent.linkedinUrl ? (
                        <a
                          href={selectedRecommendationTalent.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cx(opsTheme.link, "text-xs")}
                        >
                          LinkedIn
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <div className="font-geist text-sm text-beige900/55">
                      talent를 고르세요.
                    </div>
                  )}
                </SelectionSummary>
                <SelectionSummary title="기회">
                  {selectedRecommendationRole ? (
                    <>
                      <div className="font-geist text-sm font-medium text-beige900">
                        {selectedRecommendationRole.name}
                      </div>
                      <div className="text-xs text-beige900/55">
                        {selectedRecommendationRole.companyName}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Token>
                          {SOURCE_LABEL[selectedRecommendationRole.sourceType]}
                        </Token>
                        <Token>
                          {STATUS_LABEL[selectedRecommendationRole.status]}
                        </Token>
                      </div>
                    </>
                  ) : (
                    <div className="font-geist text-sm text-beige900/55">
                      기회를 고르세요.
                    </div>
                  )}
                </SelectionSummary>
                <textarea
                  value={recommendationMemo}
                  onChange={(event) => setRecommendationMemo(event.target.value)}
                  placeholder="후보자에게 전달되는 메모"
                  className={cx(opsTheme.textarea, "min-h-[108px] px-3 py-3")}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateRecommendation()}
                    disabled={
                      !selectedRecommendationRole ||
                      !selectedRecommendationTalent ||
                      saveRecommendation.isPending
                    }
                    className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
                  >
                    {saveRecommendation.isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    추천 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecommendationTalent(null);
                      setRecommendationMemo("");
                    }}
                    className={cx(opsTheme.buttonSecondary, "h-10 px-4")}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </div>

            <div className={cx(opsTheme.panel, "space-y-3 p-4 xl:col-span-3")}>
              <PanelHeader title="선택된 talent의 추천들" />
              {!selectedRecommendationTalent?.talentId ? (
                <EmptyState copy="talent를 선택하면 여기에 추천한 기회가 보입니다." />
              ) : talentRecommendationsQuery.isLoading ? (
                <EmptyState copy="추천 목록을 불러오는 중입니다." />
              ) : (talentRecommendationsQuery.data?.items ?? []).length === 0 ? (
                <EmptyState copy="아직 추천된 기회가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {talentRecommendationsQuery.data?.items.map((item) => (
                    <div
                      key={`${item.roleId}-${item.talentId}`}
                      className={cx(opsTheme.panelSoft, "space-y-2 px-3 py-3")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-geist text-sm font-medium text-beige900">
                            {item.roleName}
                          </div>
                          <div className="mt-1 text-xs text-beige900/55">
                            {item.companyName}
                            {item.locationText ? ` · ${item.locationText}` : ""}
                            {item.postedAt
                              ? ` · ${formatShortDate(item.postedAt)}`
                              : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteRecommendation(item.roleId, item.talentId)
                          }
                          className="rounded-md bg-white/80 px-2 py-1 text-[11px] text-beige900/75 transition hover:bg-white"
                        >
                          제거
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Token>{SOURCE_LABEL[item.sourceType]}</Token>
                        <Token>{item.kind === "match" ? "연결 수락" : "추천"}</Token>
                        {item.feedback ? (
                          <Token>{RECOMMENDATION_FEEDBACK_LABEL[item.feedback]}</Token>
                        ) : null}
                      </div>
                      {item.recommendationMemo ? (
                        <div className="text-xs leading-5 text-beige900/58">
                          {item.recommendationMemo}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </OpsShell>
    </>
  );
}
