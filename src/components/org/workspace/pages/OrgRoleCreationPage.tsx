import { OrgRoleInbox } from "@/components/org/OrgRoleInbox";
import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  BriefcaseBusiness,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Columns3,
  Flag,
  Inbox,
  ListTodo,
  LoaderCircle,
  Menu,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  PanelsTopLeft,
  Rows3,
  Scale,
  Settings,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleTalentBoard } from "@/components/org/OrgRoleTalentBoard";
import { OrgRoleDetailsContent } from "@/components/org/role-overview/OrgRoleDetailsContent";
import { OrgRoleMatchingHistory } from "@/components/org/role-overview/OrgRoleMatchingHistory";
import { OrgRoleMatchingContent } from "@/components/org/role-overview/OrgRoleMatchingContent";
import { OrgRoleSettingsContent } from "@/components/org/role-overview/OrgRoleSettingsContent";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { OrgRoleStartPanel } from "@/components/org/role-start/OrgRoleStartPanel";
import { RoleStartPreparation } from "@/components/org/role-start/RoleStartPreparation";
import { EMPTY_ORG_AGENT_LIVE_CHAT, getOrgAgentLiveChatKey, useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";
import {
  isRoleStartOnboarding,
  RoleStartOnboarding,
  useRoleStartQuery,
} from "@/components/org/role-start/RoleStartOnboarding";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrgRoleTodoTab } from "@/components/org/OrgRoleTodoTab";
import { useOrgRoleTodo } from "@/hooks/org/useOrgRoleTodo";
import { orgTodoBadge } from "@/lib/org/todo";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { useOrgInboxCounts } from "@/hooks/org/useOrgRoleInbox";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import {
  getOrgRoleStatusPresentation,
  normalizeOrgRoleStatus,
} from "@/lib/org/roleStatus";
import {
  buildOrgHref,
  resolveOrgRoleTab,
  type OrgRoleTab,
} from "@/lib/org/routes";
import { queryKeys } from "@/lib/queryKeys";
import { clearNewRolePending, sessionStorageOrNull, START_PENDING_EVENT, startPendingUntil } from "@/lib/org/roleStart/startPending";
import type { OrgRole } from "@/lib/org/server";
import { OrgCriteriaRecheckWatcher } from "@/components/org/OrgCriteriaRecheck";
import { cn } from "@/lib/utils";
import {
  ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
  useOrgRoleCreationUiStore,
} from "@/store/useOrgRoleCreationUiStore";

type RoleCreationTab = OrgRoleTab;
type RolePipelineDisplay = "pipeline" | "board";

// Mount expensive editors/settings on first visit, then preserve their drafts
// while another tab is visible. The parent key resets this for a different Role.
function VisitedRolePanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return active || visited ? children : null;
}

const ORG_ROLE_DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const ORG_ROLE_SPLIT_HANDLE_WIDTH_PX = 8;

const DETAIL_TABS = [
  {
    icon: <Scale className="size-3.5" strokeWidth={1.65} />,
    label: "매칭 기준",
    value: "matching",
  },
  {
    icon: <BriefcaseBusiness className="size-3.5" strokeWidth={1.65} />,
    label: "역할 정보",
    value: "role",
  },
  {
    icon: <Settings className="size-3.5" strokeWidth={1.65} />,
    label: "설정",
    value: "settings",
  },
] as const;

const START_TAB = {
  icon: <Flag className="size-3.5" strokeWidth={1.65} />,
  label: "시작",
  value: "start",
} as const;

const PIPELINE_TAB = {
  icon: <PanelsTopLeft className="size-3.5" strokeWidth={1.65} />,
  label: "파이프라인",
  value: "pipeline",
} as const;

const INBOX_TAB = {
  icon: <Inbox className="size-3.5" strokeWidth={1.65} />,
  label: "인박스",
  value: "inbox",
} as const;

const TODO_TAB = {
  icon: <ListTodo className="size-3.5" strokeWidth={1.65} />,
  label: "To-do",
  value: "todo",
} as const;

const CHAT_TAB = {
  icon: <MessageSquare className="size-3.5" strokeWidth={1.65} />,
  label: "채팅",
  value: "chat",
} as const;

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function OrgRolePipelineWorkspace({
  display,
  mobile = false,
  onDisplayChange,
}: {
  display: RolePipelineDisplay;
  mobile?: boolean;
  onDisplayChange: (display: RolePipelineDisplay) => void;
}) {
  const resolvedDisplay = mobile ? "board" : display;

  const displayControl = mobile ? null : (
    <RolePipelineDisplayMenu
      display={resolvedDisplay}
      onDisplayChange={onDisplayChange}
    />
  );

  return resolvedDisplay === "pipeline" ? (
    <OrgPipeline displayControl={displayControl} />
  ) : (
    <OrgRoleTalentBoard displayControl={displayControl} />
  );
}

function RolePipelineDisplayMenu({
  display,
  onDisplayChange,
}: {
  display: RolePipelineDisplay;
  onDisplayChange: (display: RolePipelineDisplay) => void;
}) {
  const { c } = useOrgLocale();
  const DisplayIcon = display === "pipeline" ? Columns3 : Rows3;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton size="sm" variant="transparent">
          <DisplayIcon className="size-4" />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" sideOffset={2}>
        <DropdownMenuItem
          onSelect={() => onDisplayChange("pipeline")}
          selected={display === "pipeline"}
          variant="sm"
        >
          <Columns3 />
          {c("파이프라인", "Pipeline")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDisplayChange("board")}
          selected={display === "board"}
          variant="sm"
        >
          <Rows3 />
          {c("보드", "Board")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgRoleCandidatesTab({
  display,
  mobile = false,
  onDisplayChange,
  tab,
}: {
  display: RolePipelineDisplay;
  mobile?: boolean;
  onDisplayChange: (display: RolePipelineDisplay) => void;
  tab: "inbox" | "pipeline";
}) {
  return (
    <OrgJobsProvider routePage="role" inbox={tab === "inbox"}>
      {tab === "inbox" ? (
        <OrgRoleInbox />
      ) : (
        <OrgRolePipelineWorkspace
          display={display}
          mobile={mobile}
          onDisplayChange={onDisplayChange}
        />
      )}
      {tab !== "inbox" && <TalentDetailSimpleView />}
    </OrgJobsProvider>
  );
}

const registeredNoticeKey = (roleId: string) => `harper:role-start-registered:${roleId}`;

function writeRegisteredNotice(roleId: string, open: boolean) {
  try {
    if (open) window.sessionStorage.setItem(registeredNoticeKey(roleId), "1");
    else window.sessionStorage.removeItem(registeredNoticeKey(roleId));
  } catch {}
}

function readRegisteredNotice(roleId: string) {
  try {
    return window.sessionStorage.getItem(registeredNoticeKey(roleId)) === "1";
  } catch {
    return false;
  }
}

/** Right after registration, above the inbox: the Role is on and regular recommendations take over. */
function RoleStartRegisteredNotice({
  roleId,
  workspaceId,
}: {
  roleId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const [shown, setShown] = useState(false);
  // Cached from the step screens; a reload has no cache and shows nothing.
  const batch = useRoleStartQuery(roleId, workspaceId, false).data?.session?.batch;
  const ready = batch?.status === "done" || batch?.status === "failed";
  // Shown once per registration: this mount keeps it, the flag goes.
  if (ready && !shown && readRegisteredNotice(roleId)) setShown(true);
  useEffect(() => {
    if (shown) writeRegisteredNotice(roleId, false);
  }, [roleId, shown]);
  if (!batch || !ready || !shown) return null;
  const close = () => setShown(false);
  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p>
          {c(
            "역할을 켰어요. 새 후보는 정기 추천에서 찾아 인박스에 넣어 드릴게요.",
            "The role is on. Regular recommendations will look for new people and add them to the inbox."
          )}
        </p>
      </div>
      <MuteButton
        aria-label={c("안내 닫기", "Close notice")}
        onClick={close}
        size="sm"
        variant="transparent"
      >
        <X aria-hidden className="size-3.5" strokeWidth={1.7} />
      </MuteButton>
    </div>
  );
}

function OrgRoleCreationDetails({
  chatActive = false,
  companyInfoOpen = false,
  expanded = false,
  mobile = false,
  onChatTabSelect,
  onClose,
  onCompanyInfoClose,
  onDetailTabSelect,
  onToggleExpanded,
  role,
}: {
  chatActive?: boolean;
  companyInfoOpen?: boolean;
  expanded?: boolean;
  mobile?: boolean;
  onChatTabSelect?: () => void;
  onClose?: () => void;
  onCompanyInfoClose?: () => void;
  onDetailTabSelect?: () => void;
  onToggleExpanded?: () => void;
  role: OrgRole | null;
}) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const { workspace } = useOrgWorkspace();
  const roleCreation =
    role !== null && normalizeOrgRoleStatus(role.status) === "draft";
  const inboxBoardQuery = useOrgInboxCounts({
    enabled: Boolean(role) && !roleCreation,
    roleId: role?.roleId,
    workspaceId: workspace.workspaceId,
  });
  const todo = useOrgRoleTodo({
    roleId: role && !roleCreation ? role.roleId : null,
    workspaceId: workspace.workspaceId,
  });
  const inboxCount = inboxBoardQuery.data
    ? inboxBoardQuery.data.counts.pending_connection + inboxBoardQuery.data.counts.company_intro
    : undefined;
  const requestedTab = router.isReady ? getQueryText(router.query.tab) : "";
  const requestedView = router.isReady ? getQueryText(router.query.view) : "";
  const activeTab = resolveOrgRoleTab({
    isDraft: roleCreation,
    tab: requestedTab,
  });
  const pipelineDisplay: RolePipelineDisplay =
    mobile || requestedView === "board" ? "board" : "pipeline";
  const detailTabs = [
    ...(expanded ? [CHAT_TAB] : []),
    ...(roleCreation
      ? [START_TAB, ...DETAIL_TABS]
      : [TODO_TAB, INBOX_TAB, PIPELINE_TAB, ...DETAIL_TABS]),
  ];
  const roleStatus = role ? getOrgRoleStatusPresentation(role.status) : null;
  const setActiveTab = (tab: RoleCreationTab) => {
    const nextQuery = { ...router.query };
    for (const key of [
      "talentId",
      "recommendationId",
      "detailRoleId",
      "detailWorkspaceId",
      // Opening the inbox from its tab shows the inbox, not Saved.
      "review",
    ])
      delete nextQuery[key];
    if (tab === "pipeline") {
      nextQuery.tab = "pipeline";
      nextQuery.view = pipelineDisplay;
    } else {
      nextQuery.tab = tab;
      delete nextQuery.view;
    }
    void router.push(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true }
    );
  };
  const setPipelineDisplay = (display: RolePipelineDisplay) => {
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          tab: "pipeline",
          view: display,
        },
      },
      undefined,
      { shallow: true }
    );
  };

  return (
    <section
      aria-label={
        companyInfoOpen
          ? c("회사 정보 상세", "Company details")
          : c("새 역할 등록 상세", "New role details")
      }
      className={cn(
        mobile
          ? "relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-default"
          : "relative hidden ml-[-4px] min-h-0 min-w-0 flex-1 flex-col bg-bg-default md:flex",
        expanded && "ml-0"
      )}
      id={
        mobile
          ? "role-creation-mobile-details-panel"
          : "role-creation-details-panel"
      }
    >
      {role && !roleCreation ? (
        <OrgCriteriaRecheckWatcher
          items={inboxBoardQuery.data?.items}
          refetch={inboxBoardQuery.refetch}
          roleId={role.roleId}
        />
      ) : null}
      <DocumentEditorPanelProvider key={role?.roleId ?? "loading"}>
        <div className="relative flex h-12 w-full shrink-0 items-center border-b border-neutral-1000-a05">
          {expanded ? (
            <div className="flex min-w-0 max-w-[35%] shrink-0 items-center gap-2 pl-4">
              {role ? (
                <OrgRoleStatusDot decorative status={role.status} />
              ) : null}
              <h1 className="truncate text-[14px] font-normal text-neutral-primary">
                {role?.name || c("역할 불러오는 중", "Loading role")}
              </h1>
              {roleStatus ? (
                <span className="shrink-0 text-[14px] font-normal text-neutral-muted">
                  <span aria-hidden="true">- </span>
                  {sourceT(roleStatus.label)}
                </span>
              ) : null}
            </div>
          ) : null}
          {mobile ? (
            <MuteButton
              aria-label={c("역할 상세 닫기", "Close role details")}
              className="ml-1 rounded-full"
              onClick={onClose}
              size="md"
              variant="transparent"
            >
              <PanelRightClose
                aria-hidden
                className="size-4"
                strokeWidth={1.65}
              />
            </MuteButton>
          ) : null}
          <div
            aria-label={c("새 역할 정보", "New role info")}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3 scrollbar-none",
              mobile && "pl-1",
              !mobile && onToggleExpanded && "pr-16"
            )}
            key={expanded ? "expanded" : "split"}
            role="tablist"
          >
            {detailTabs.map((tab) => {
              const active =
                !companyInfoOpen &&
                (tab.value === "chat"
                  ? chatActive
                  : !chatActive && activeTab === tab.value);
              return (
                <button
                  key={tab.value}
                  aria-controls={`role-creation-${tab.value}-panel`}
                  aria-selected={active}
                  className={`flex min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-xs px-3 py-3 text-[14px] font-light focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 ${
                    active
                      ? " text-neutral-primary"
                      : "text-neutral-600 hover:text-neutral-primary"
                  }`}
                  id={`role-creation-${tab.value}-tab`}
                  onClick={() => {
                    if (tab.value === "chat") {
                      onChatTabSelect?.();
                      return;
                    }
                    onDetailTabSelect?.();
                    onCompanyInfoClose?.();
                    setActiveTab(tab.value);
                  }}
                  role="tab"
                  type="button"
                >
                  {tab.icon}
                  <span className="truncate">{sourceT(tab.label)}</span>
                  {tab.value === "todo" && todo.data ? (
                    <Badge
                      className="h-4 bg-action px-[5px] py-0 text-white tabular-nums font-normal text-[11px] leading-none"
                      size="sm"
                    >
                      {String(orgTodoBadge(todo.data.items))}
                    </Badge>
                  ) : null}
                  {tab.value === "inbox" && inboxCount !== undefined ? (
                    <Badge
                      className="h-4 bg-action px-[5px] py-0 text-white tabular-nums font-normal text-[11px] leading-none"
                      size="sm"
                    >
                      {String(inboxCount)}
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
          {!mobile && onToggleExpanded ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center bg-linear-to-r from-transparent via-white to-white pl-8 pr-2">
              <MuteButton
                aria-controls="role-creation-details-panel"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? c("분할 화면으로 보기", "Split view")
                    : c("전체 화면으로 보기", "Full screen")
                }
                className="pointer-events-auto shrink-0"
                onClick={onToggleExpanded}
                size="md"
                title={
                  expanded
                    ? c("분할 화면으로 보기", "Split view")
                    : c("전체 화면으로 보기", "Full screen")
                }
                variant="transparent"
              >
                {expanded ? (
                  <ChevronsRightLeft
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.7}
                  />
                ) : (
                  <ChevronsLeftRight
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.7}
                  />
                )}
              </MuteButton>
            </div>
          ) : null}
        </div>
        <div
          hidden={chatActive && !companyInfoOpen}
          className={`min-h-0 flex-1 ${!companyInfoOpen && activeTab === "inbox" ? "overflow-hidden" : "overflow-y-auto pt-5 md:pt-6"} overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 ${
            !companyInfoOpen && activeTab === "pipeline"
              ? "bg-neutral-50 px-0 pb-0"
              : !companyInfoOpen && activeTab === "inbox"
                ? "bg-bg-default px-4 md:px-5 pb-4"
                : `bg-bg-default px-4 md:px-5 ${mobile ? "pb-16" : "pb-48"}`
          }`}
        >
          {companyInfoOpen ? (
            <div
              aria-label={c("회사 정보 상세 내용", "Company details content")}
            >
              <OrgTeamPage companyOnly readOnlyCompany />
            </div>
          ) : null}
          <div
            aria-label={c("시작 탭 내용", "Start tab content")}
            aria-labelledby="role-creation-start-tab"
            hidden={companyInfoOpen || activeTab !== "start"}
            id="role-creation-start-panel"
            role="tabpanel"
          >
            {!companyInfoOpen && activeTab === "start" && role ? (
              <OrgRoleStartPanel
                key={`start:${role.roleId}`}
                roleId={role.roleId}
                workspaceId={workspace.workspaceId}
              />
            ) : null}
          </div>
          <div
            aria-label={c("인박스 탭 내용", "Inbox tab content")}
            aria-labelledby="role-creation-inbox-tab"
            className={activeTab === "inbox" ? "h-full min-h-0" : undefined}
            hidden={companyInfoOpen || activeTab !== "inbox"}
            id="role-creation-inbox-panel"
            role="tabpanel"
          >
            {!companyInfoOpen &&
            activeTab === "inbox" &&
            role &&
            !roleCreation ? (
              <>
                <RoleStartRegisteredNotice
                  roleId={role.roleId}
                  workspaceId={workspace.workspaceId}
                />
                <OrgRoleCandidatesTab
                  display="board"
                  mobile={mobile}
                  onDisplayChange={setPipelineDisplay}
                  tab="inbox"
                />
              </>
            ) : null}
          </div>
          <div
            aria-label={c("To-do 탭 내용", "To-do tab content")}
            aria-labelledby="role-creation-todo-tab"
            hidden={companyInfoOpen || activeTab !== "todo"}
            id="role-creation-todo-panel"
            role="tabpanel"
          >
            {!companyInfoOpen && activeTab === "todo" && role && !roleCreation ? (
              <OrgRoleTodoTab
                roleId={role.roleId}
                workspaceId={workspace.workspaceId}
              />
            ) : null}
          </div>
          <div
            aria-label={c("파이프라인 탭 내용", "Pipeline tab content")}
            aria-labelledby="role-creation-pipeline-tab"
            className={activeTab === "pipeline" ? "h-full min-h-0" : undefined}
            hidden={companyInfoOpen || activeTab !== "pipeline"}
            id="role-creation-pipeline-panel"
            role="tabpanel"
          >
            {!companyInfoOpen &&
            activeTab === "pipeline" &&
            role &&
            !roleCreation ? (
              <OrgRoleCandidatesTab
                display={pipelineDisplay}
                mobile={mobile}
                onDisplayChange={setPipelineDisplay}
                tab="pipeline"
              />
            ) : null}
          </div>
          <div
            aria-label={c("매칭 기준 탭 내용", "Matching criteria tab content")}
            aria-labelledby="role-creation-matching-tab"
            hidden={companyInfoOpen || activeTab !== "matching"}
            id="role-creation-matching-panel"
            role="tabpanel"
          >
            <VisitedRolePanel
              active={!companyInfoOpen && activeTab === "matching"}
            >
              {role ? (
                <>
                  <div className="mb-4 flex justify-end">
                    {!chatActive && !companyInfoOpen && activeTab === "matching" ? (
                      <OrgRoleMatchingHistory
                        key={`matching-history:${role.roleId}`}
                        roleId={role.roleId}
                        workspaceId={workspace.workspaceId}
                      />
                    ) : null}
                  </div>
                  <OrgRoleMatchingContent
                    key={`matching:${role.roleId}`}
                    role={role}
                    workspaceId={workspace.workspaceId}
                  />
                </>
              ) : (
                <div className="py-12 text-center text-sm text-neutral-muted">
                  {c(
                    "역할 정보를 불러오는 중입니다.",
                    "Loading role information."
                  )}
                </div>
              )}
            </VisitedRolePanel>
          </div>
          <div
            aria-label={c("역할 정보 탭 내용", "Role details tab content")}
            aria-labelledby="role-creation-role-tab"
            hidden={companyInfoOpen || activeTab !== "role"}
            id="role-creation-role-panel"
            role="tabpanel"
          >
            <VisitedRolePanel active={!companyInfoOpen && activeTab === "role"}>
              {role ? (
                <OrgRoleDetailsContent
                  key={`role:${role.roleId}`}
                  role={role}
                  workspaceId={workspace.workspaceId}
                />
              ) : (
                <div className="py-12 text-center text-sm text-neutral-muted">
                  {c(
                    "역할 정보를 불러오는 중입니다.",
                    "Loading role information."
                  )}
                </div>
              )}
            </VisitedRolePanel>
          </div>
          <div
            aria-label={c("Setting 탭 내용", "Settings tab content")}
            aria-labelledby="role-creation-settings-tab"
            hidden={companyInfoOpen || activeTab !== "settings"}
            id="role-creation-settings-panel"
            role="tabpanel"
          >
            <VisitedRolePanel
              active={!companyInfoOpen && activeTab === "settings"}
            >
              {role ? (
                <OrgRoleSettingsContent
                  key={`settings:${role.roleId}`}
                  layout="panel"
                  role={role}
                  roleCreation={roleCreation}
                  workspaceId={workspace.workspaceId}
                />
              ) : null}
            </VisitedRolePanel>
          </div>
        </div>
        {getQueryText(router.query.talentId) &&
        (companyInfoOpen ||
          roleCreation ||
          !["inbox", "pipeline"].includes(activeTab)) ? (
          <OrgJobsProvider routePage="role">
            <TalentDetailSimpleView />
          </OrgJobsProvider>
        ) : null}
      </DocumentEditorPanelProvider>
    </section>
  );
}

export function OrgRoleCreationPage() {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const { openNavigation, setNavigationTriggerHidden } =
    useOrgMobileNavigation();
  const { page, permissions, roles, workspace } = useOrgWorkspace();
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [panelView, setPanelView] = useState<"split" | "details" | "chat">(
    "split"
  );
  const isNewRolePage = page === "new-role";
  const isRoleEntry = isNewRolePage || page === "home";
  // /org/new only creates Roles; an existing Role belongs to /org/role.
  const roleId = page === "role" && router.isReady ? getQueryText(router.query.roleId) : "";
  const creationKey = getOrgAgentLiveChatKey({ mode: "role_creation", roleId, workspaceId: workspace.workspaceId });
  const creation = useOrgAgentLiveChatStore((state) => state.chats[creationKey] ?? EMPTY_ORG_AGENT_LIVE_CHAT);
  const preparingRole = Boolean(roleId) && creation.isCreatingRole && (creation.isStreaming || Boolean(creation.error));
  const role = roles.find((item) => item.roleId === roleId) ?? null;
  const roleStatus = role ? getOrgRoleStatusPresentation(role.status) : null;
  const isDesktop = useMediaQuery(ORG_ROLE_DESKTOP_MEDIA_QUERY);
  const detailsExpanded = Boolean(roleId) && isDesktop && panelView !== "split";
  const chatTabActive = detailsExpanded && panelView === "chat";
  const persistedChatPanelWidth = useOrgRoleCreationUiStore(
    (state) => state.chatPanelWidthPct
  );
  const setPersistedChatPanelWidth = useOrgRoleCreationUiStore(
    (state) => state.setChatPanelWidthPct
  );
  const handleChatPanelResizeEnd = useCallback(
    (widthPct: number) => setPersistedChatPanelWidth(widthPct),
    [setPersistedChatPanelWidth]
  );
  const {
    containerRef,
    handleResizeKeyDown,
    handleResizeStart,
    widthPct: chatPanelWidth,
  } = useResizableSplitPanel({
    defaultPct: persistedChatPanelWidth,
    enabled: Boolean(roleId) && isDesktop && !detailsExpanded,
    maxPct: ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
    minPct: ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
    onResizeEnd: handleChatPanelResizeEnd,
  });

  const roleDraft =
    role !== null && normalizeOrgRoleStatus(role.status) === "draft";
  const roleStartEnabled =
    Boolean(roleId) && !preparingRole && (role === null || roleDraft) && permissions.canManageCandidates;
  const roleStartQuery = useRoleStartQuery(roleId, workspace.workspaceId, roleStartEnabled);
  // A Role created a moment ago may not be in the workspace list yet; the
  // start flow's own read says it is a draft, so its steps open right away.
  const onboardingRole: OrgRole | null =
    role ??
    (roleId && roleStartQuery.data?.role.status === "draft"
      ? ({
          criteria: [],
          createdAt: "",
          description: null,
          employmentTypes: [],
          externalJdUrl: null,
          locationText: null,
          name: "",
          request: null,
          roleId,
          status: "draft",
          updatedAt: "",
          workMode: null,
          workspaceId: workspace.workspaceId,
        } satisfies OrgRole)
      : null);
  const onboarding =
    roleStartEnabled &&
    isRoleStartOnboarding(onboardingRole, roleStartQuery.data);
  const queryClient = useQueryClient();
  // A Role this tab just created from a JD shows the start loading line, not the
  // chat, until its start session exists (at most 30 s; then the chat as before).
  // Read while rendering, so the chat does not show for a moment first.
  const startPendingAt = useSyncExternalStore(
    subscribeStartPending,
    () => {
      const until = roleId
        ? startPendingUntil(sessionStorageOrNull(), roleId)
        : null;
      return until !== null && until > Date.now() ? until : null;
    },
    () => null
  );
  // Clear the transient creation marker once the destination Role page takes over.
  useEffect(() => {
    // Only a Role this tab just created (its own mark still within the 30 s).
    if (roleId && (startPendingUntil(sessionStorageOrNull(), roleId) ?? 0) > Date.now()) clearNewRolePending(workspace.workspaceId);
  }, [roleId, workspace.workspaceId]);
  // Renders again when the 30 s are up, so the line gives way to the chat.
  const [, setStartPendingTick] = useState(0);
  useEffect(() => {
    if (startPendingAt === null) return;
    const timer = window.setTimeout(() => setStartPendingTick((tick) => tick + 1), startPendingAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [startPendingAt]);
  const waitingForStart =
    roleStartEnabled &&
    startPendingAt !== null &&
    !onboarding &&
    !roleStartQuery.data?.session;
  const roleMissing = Boolean(roleId) && role === null;
  // Only while the start flow still finds the Role: a deleted one errors there.
  // Members who cannot run the start flow keep the plain re-read.
  const roleStillLoading =
    roleMissing && (!permissions.canManageCandidates || (Boolean(roleStartQuery.data) && !roleStartQuery.isError));
  useEffect(() => {
    if (!roleStillLoading) return;
    // Read the workspace's Roles again until the new one is listed; one still missing
    // after about 30 seconds (deleted, or not visible to this member) is not asked for again.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 10) window.clearInterval(timer);
      else void queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [queryClient, roleStillLoading]);
  const wasOnboarding = useRef(false);
  const registered = roleStartQuery.data?.session?.phase === "done";
  useEffect(() => {
    // Registration just finished on the step screens: refresh the Role (now
    // active) and open its inbox, where the recommended people are.
    if (wasOnboarding.current && !onboarding && registered) {
      writeRegisteredNotice(roleId, true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
      void router.replace(
        { pathname: router.pathname, query: { ...router.query, tab: "inbox" } },
        undefined,
        { shallow: true }
      );
    }
    wasOnboarding.current = onboarding;
  }, [onboarding, queryClient, registered, roleId, router]);

  useEffect(() => {
    setNavigationTriggerHidden(mobileDetailsOpen);
    return () => setNavigationTriggerHidden(false);
  }, [mobileDetailsOpen, setNavigationTriggerHidden]);

  if (isRoleEntry && !permissions.canManageCandidates) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-muted">
        {c(
          "역할을 등록할 권한이 없습니다.",
          "You don't have permission to create roles."
        )}
      </div>
    );
  }

  if (preparingRole) {
    return <RoleStartPreparation logs={creation.thinkingLogs} error={creation.error} onBack={() => {
      void router.replace(buildOrgHref({ page: "new-role", orgId: workspace.workspaceId }));
    }} />;
  }

  if (waitingForStart && !onboarding) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[14px] text-neutral-muted">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {c("JD를 읽고 있어요", "Reading the JD")}
      </div>
    );
  }

  if (onboarding && onboardingRole) {
    // Until registration the start flow owns the whole screen; the chat and
    // the role tabs come back once the Role is registered.
    return (
      <RoleStartOnboarding
        key={`onboarding:${onboardingRole.roleId}`}
        role={onboardingRole}
        workspaceId={workspace.workspaceId}
        onRoleCreated={(createdRoleId) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
          void router.replace(buildOrgHref({ page: "role", orgId: workspace.workspaceId, roleId: createdRoleId }));
        }}
      />
    );
  }

  if (roleStartEnabled && roleStartQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p role="alert" className="text-sm text-critical">{c("채용 시작 정보를 불러오지 못했어요.", "Could not load hiring setup.")}</p>
        <MuteButton onClick={() => void roleStartQuery.refetch()}>{c("다시 시도", "Try again")}</MuteButton>
      </div>
    );
  }

  if (roleStartEnabled && roleStartQuery.isLoading && !role) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {c("역할 불러오는 중", "Loading role")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
    <div
      ref={containerRef}
      className={cn(
        roleId
          ? "relative flex h-full w-full min-h-0 flex-row transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:translate-x-0 md:overflow-hidden motion-reduce:transition-none"
          : "h-full min-h-0",
        roleId && mobileDetailsOpen && "-translate-x-full"
      )}
    >
      <section
        aria-label={
          isRoleEntry
            ? c("새 역할 등록 대화", "New role creation dialog")
            : c("역할 대화", "Role dialog")
        }
        aria-labelledby={chatTabActive ? "role-creation-chat-tab" : undefined}
        className={cn(
          "relative flex h-full w-full shrink-0 min-w-0 flex-col overflow-hidden md:w-auto md:flex-none md:basis-[42%]",
          detailsExpanded && !chatTabActive && "md:hidden",
          chatTabActive &&
            "md:absolute md:inset-x-0 md:bottom-0 md:top-12 md:z-10 md:h-auto md:w-full md:basis-auto"
        )}
        id="role-creation-chat-panel"
        role={chatTabActive ? "tabpanel" : undefined}
        style={
          roleId && isDesktop && !detailsExpanded
            ? {
                flexBasis: `calc(${chatPanelWidth}% - ${
                  ORG_ROLE_SPLIT_HANDLE_WIDTH_PX / 2
                }px)`,
              }
            : undefined
        }
      >
        <div className="min-h-0 flex-1">
          <OrgAgentChatSurface
            initialMessage={isNewRolePage && typeof router.query.prefill === "string" ? router.query.prefill : undefined}
            header={
              <>
                <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center gap-2 bg-linear-to-b from-white/30 to-white/0 px-3 md:hidden">
                  {isNewRolePage ? (
                    <span aria-hidden className="size-8 shrink-0" />
                  ) : (
                    <MuteButton
                      aria-label={c("메뉴 열기", "Open menu")}
                      className="border border-white/20 bg-white/10 backdrop-blur-xs hover:bg-white/20"
                      onClick={openNavigation}
                      size="md"
                      variant="transparent"
                    >
                      <Menu
                        aria-hidden
                        className="size-4.5"
                        strokeWidth={1.7}
                      />
                    </MuteButton>
                  )}
                  <div className="min-w-0 flex-1 px-1 text-left">
                    <h1 className="truncate whitespace-nowrap text-[13px] font-medium text-neutral-primary">
                      {roleId
                        ? role?.name || c("역할 불러오는 중", "Loading role")
                        : c("새 역할 등록", "Create role")}
                    </h1>
                  </div>
                  {roleId ? (
                    <MuteButton
                      aria-label={c("역할 상세 열기", "Open role details")}
                      className="border border-white/20 bg-white/10 backdrop-blur-xs hover:bg-white/20"
                      onClick={() => setMobileDetailsOpen(true)}
                      size="md"
                      variant="transparent"
                    >
                      <PanelRight
                        aria-hidden
                        className="size-4.5"
                        strokeWidth={1.7}
                      />
                    </MuteButton>
                  ) : (
                    <span aria-hidden className="size-8 shrink-0" />
                  )}
                </header>
                {isDesktop && roleId && !detailsExpanded ? (
                  <header className="absolute left-0 top-0 flex h-13 w-full shrink-0 items-center gap-2 bg-linear-to-b from-70% from-bg-default to-bg-default/0 px-4 pb-2">
                    {role ? (
                      <OrgRoleStatusDot decorative status={role.status} />
                    ) : null}
                    <h1 className="truncate text-[14px] font-normal text-neutral-primary">
                      {role?.name || c("역할 불러오는 중", "Loading role")}
                    </h1>
                    {roleStatus ? (
                      <span className="shrink-0 text-[14px] font-normal text-neutral-muted">
                        <span aria-hidden="true">- </span>
                        {sourceT(roleStatus.label)}
                      </span>
                    ) : null}
                  </header>
                ) : null}
              </>
            }
            onRoleCreated={(createdRoleId) => {
              void router.replace(
                buildOrgHref({
                  orgId: workspace.workspaceId,
                  page: "role",
                  roleId: createdRoleId,
                }),
                undefined
              );
            }}
            onCompanyInfoClick={() => {
              setCompanyInfoOpen(true);
              setPanelView((current) =>
                current === "split" ? current : "details"
              );
              if (!isDesktop) setMobileDetailsOpen(true);
            }}
            readOnly={!permissions.canManageCandidates}
            purpose={
              !roleId ||
              (role && normalizeOrgRoleStatus(role.status) === "draft")
                ? "role-creation"
                : "role"
            }
            roleId={roleId || null}
          />
        </div>
      </section>
      {/* Mount one details tree: CSS-hidden copies still open their portal dialogs. */}
      {roleId && isDesktop ? (
        <>
          <div
            aria-label={c("역할 대화 패널 너비 조절", "Resize role panel")}
            aria-orientation="vertical"
            aria-valuemax={ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT}
            aria-valuemin={ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT}
            aria-valuenow={Math.round(chatPanelWidth)}
            className={cn(
              "group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none md:flex",
              detailsExpanded && "md:hidden"
            )}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={(event) => {
              event.preventDefault();
              handleResizeStart(event.clientX);
            }}
            role="separator"
            tabIndex={isDesktop && !detailsExpanded ? 0 : -1}
          >
            <div
              aria-hidden="true"
              className="h-full w-px bg-neutral-400 transition-colors group-hover:bg-neutral-500 group-focus-visible:bg-neutral-500"
            />
          </div>
          <OrgRoleCreationDetails
            chatActive={chatTabActive}
            companyInfoOpen={companyInfoOpen}
            expanded={detailsExpanded}
            onChatTabSelect={() => {
              setCompanyInfoOpen(false);
              setPanelView("chat");
            }}
            onCompanyInfoClose={() => setCompanyInfoOpen(false)}
            onDetailTabSelect={() => {
              setPanelView((current) =>
                current === "split" ? current : "details"
              );
            }}
            onToggleExpanded={() => {
              setPanelView((current) =>
                current === "split" ? "details" : "split"
              );
            }}
            role={role}
          />
        </>
      ) : null}
      {roleId && !isDesktop ? (
        <div className="h-full w-full shrink-0 md:hidden">
          <OrgRoleCreationDetails
            companyInfoOpen={companyInfoOpen}
            mobile
            onClose={() => {
              setMobileDetailsOpen(false);
              setCompanyInfoOpen(false);
            }}
            onCompanyInfoClose={() => {
              setCompanyInfoOpen(false);
            }}
            role={role}
          />
        </div>
      ) : null}
    </div>
    </div>
  );
}

function subscribeStartPending(onChange: () => void) {
  window.addEventListener(START_PENDING_EVENT, onChange);
  return () => window.removeEventListener(START_PENDING_EVENT, onChange);
}
