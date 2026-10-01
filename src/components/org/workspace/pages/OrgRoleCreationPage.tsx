import { useOrgSourceT, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import {
  BriefcaseBusiness,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Columns3,
  Inbox,
  Menu,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  PanelsTopLeft,
  Rows3,
  Scale,
  Settings,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleTalentBoard } from "@/components/org/OrgRoleTalentBoard";
import { OrgRoleDetailsContent } from "@/components/org/role-overview/OrgRoleDetailsContent";
import { OrgRoleMatchingContent } from "@/components/org/role-overview/OrgRoleMatchingContent";
import { OrgCalibrationProfilePanel } from "@/components/org/role-overview/OrgCalibrationProfilePanel";
import { OrgRoleSettingsContent } from "@/components/org/role-overview/OrgRoleSettingsContent";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { useOrgBoard } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import {
  getOrgRoleStatusPresentation,
  normalizeOrgRoleStatus,
} from "@/lib/org/roleStatus";
import { isOrgInboxStage } from "@/lib/org/pipelineStage";
import { buildOrgHref, type OrgRoleTab } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import {
  ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
  useOrgRoleCreationUiStore,
} from "@/store/useOrgRoleCreationUiStore";

type RoleCreationTab = OrgRoleTab;
type RolePipelineDisplay = "pipeline" | "board";

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

const CHAT_TAB = {
  icon: <MessageSquare className="size-3.5" strokeWidth={1.65} />,
  label: "채팅",
  value: "chat",
} as const;

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getRoleTab({
  isDraft,
  tab,
}: {
  isDraft: boolean;
  tab: string;
}): RoleCreationTab {
  if (!isDraft && (tab === "inbox" || tab === "pipeline")) return tab;
  if (tab === "role" || tab === "settings") return tab;
  return "matching";
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
  const t = useOrgT();
  const resolvedDisplay = mobile ? "board" : display;

  const displayControl = mobile ? null : (
    <RolePipelineDisplayMenu
      display={resolvedDisplay}
      onDisplayChange={onDisplayChange}
    />
  );

  return (
    <div
      className={
        resolvedDisplay === "pipeline"
          ? "flex h-full min-h-0 flex-col gap-2"
          : "space-y-2"
      }
    >
      {resolvedDisplay === "pipeline" ? (
        <>
          <div className="flex w-full shrink-0 flex-row justify-between">
            <div className="text-[16px] font-normal text-neutral-primary">
              {t("workspace.pages.OrgRoleCreationPage.ceed6860", "Pipeline")}
            </div>
            <div className="flex justify-end">{displayControl}</div>
          </div>
          <OrgPipeline />
        </>
      ) : (
        <OrgRoleTalentBoard displayControl={displayControl} />
      )}
    </div>
  );
}

function RolePipelineDisplayMenu({
  display,
  onDisplayChange,
}: {
  display: RolePipelineDisplay;
  onDisplayChange: (display: RolePipelineDisplay) => void;
}) {
  const t = useOrgT();
  const DisplayIcon = display === "pipeline" ? Columns3 : Rows3;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          aria-label={t("workspace.pages.OrgRoleCreationPage.1e8c9520", "표시 방식: {p0}", {
            p0:
              display === "pipeline"
                ? t("workspace.pages.OrgRoleCreationPage.bc7ac4c7", "파이프라인")
                : t("workspace.pages.OrgRoleCreationPage.66151d3c", "보드"),
          })}
          size="sm"
          variant="transparent"
        >
          <DisplayIcon className="size-4" />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32 w-32" sideOffset={2}>
        <DropdownMenuItem
          onSelect={() => onDisplayChange("pipeline")}
          selected={display === "pipeline"}
          variant="sm"
        >
          <Columns3 />
          {t("workspace.pages.OrgRoleCreationPage.bc7ac4c7", "파이프라인")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDisplayChange("board")}
          selected={display === "board"}
          variant="sm"
        >
          <Rows3 />
          {t("workspace.pages.OrgRoleCreationPage.66151d3c", "보드")}
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
    <OrgJobsProvider routePage="role">
      {tab === "inbox" ? (
        <OrgRoleTalentBoard section="inbox" />
      ) : (
        <OrgRolePipelineWorkspace
          display={display}
          mobile={mobile}
          onDisplayChange={onDisplayChange}
        />
      )}
      <TalentDetailSimpleView />
    </OrgJobsProvider>
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
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const router = useRouter();
  const { workspace } = useOrgWorkspace();
  const roleCreation =
    role !== null && normalizeOrgRoleStatus(role.status) === "draft";
  const inboxBoardQuery = useOrgBoard({
    enabled: Boolean(role) && !roleCreation,
    roleId: role?.roleId,
    workspaceId: workspace.workspaceId,
  });
  const inboxCount = inboxBoardQuery.data?.items.filter((item) =>
    isOrgInboxStage(item.stage)
  ).length;
  const requestedTab = router.isReady ? getQueryText(router.query.tab) : "";
  const requestedView = router.isReady ? getQueryText(router.query.view) : "";
  const calibrationId = router.isReady
    ? getQueryText(router.query.calibration)
    : "";
  const calibrationProfileId = router.isReady
    ? getQueryText(router.query.profile)
    : "";
  const activeTab = getRoleTab({ isDraft: roleCreation, tab: requestedTab });
  const pipelineDisplay: RolePipelineDisplay =
    mobile || requestedView === "board" ? "board" : "pipeline";
  const detailTabs = [
    ...(expanded ? [CHAT_TAB] : []),
    ...(roleCreation ? DETAIL_TABS : [INBOX_TAB, PIPELINE_TAB, ...DETAIL_TABS]),
  ];
  const roleStatus = role ? getOrgRoleStatusPresentation(role.status) : null;
  const setActiveTab = (tab: RoleCreationTab) => {
    const nextQuery = { ...router.query };
    if (tab === "pipeline") {
      nextQuery.tab = "pipeline";
      nextQuery.view = pipelineDisplay;
    } else if (tab === "matching") {
      delete nextQuery.tab;
      delete nextQuery.view;
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
  const closeCalibrationProfile = useCallback(() => {
    const nextQuery = { ...router.query };
    delete nextQuery.calibration;
    delete nextQuery.profile;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true }
    );
  }, [router]);

  return (
    <section
      aria-label={
        companyInfoOpen
          ? t("workspace.pages.OrgRoleCreationPage.df1ae4cb", "회사 정보 상세")
          : t("workspace.pages.OrgRoleCreationPage.cf791d49", "새 역할 등록 상세")
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
      <DocumentEditorPanelProvider key={role?.roleId ?? "loading"}>
        <div className="relative flex h-12 w-full shrink-0 items-center border-b border-neutral-1000-a05">
          {expanded ? (
            <div className="flex min-w-0 max-w-[35%] shrink-0 items-center gap-2 pl-4">
              {role ? (
                <OrgRoleStatusDot decorative status={role.status} />
              ) : null}
              <h1 className="truncate text-[14px] font-normal text-neutral-primary">
                {role?.name ||
                  t("workspace.pages.OrgRoleCreationPage.c5bb73aa", "역할 불러오는 중")}
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
              aria-label={t("workspace.pages.OrgRoleCreationPage.0ba669d2", "역할 상세 닫기")}
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
            aria-label={t("workspace.pages.OrgRoleCreationPage.3ea2c40a", "새 역할 정보")}
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
                  aria-controls={`role-creation-${tab.value}-panel`}
                  aria-selected={active}
                  className={`flex min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-xs px-3 py-3 text-[14px] font-light focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 ${
                    active
                      ? " text-neutral-primary"
                      : "text-neutral-600 hover:text-neutral-primary"
                  }`}
                  id={`role-creation-${tab.value}-tab`}
                  key={tab.value}
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
                  {tab.value === "inbox" && inboxCount !== undefined ? (
                    <Badge
                      className="h-4 bg-action px-[5px] py-[1px] text-white tabular-nums font-normal text-[11px]"
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
                    ? t("workspace.pages.OrgRoleCreationPage.2ce1419d", "분할 화면으로 보기")
                    : t("workspace.pages.OrgRoleCreationPage.3a073344", "전체 화면으로 보기")
                }
                className="pointer-events-auto shrink-0"
                onClick={onToggleExpanded}
                size="md"
                title={
                  expanded
                    ? t("workspace.pages.OrgRoleCreationPage.2ce1419d", "분할 화면으로 보기")
                    : t("workspace.pages.OrgRoleCreationPage.3a073344", "전체 화면으로 보기")
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
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-default px-4 pt-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 md:px-5 md:pt-6 ${
            !companyInfoOpen && activeTab === "pipeline"
              ? "pb-0"
              : mobile
                ? "pb-16"
                : "pb-48"
          }`}
        >
          {companyInfoOpen ? (
            <div aria-label={t("workspace.pages.OrgRoleCreationPage.c0fac685", "회사 정보 상세 내용")}>
              <OrgTeamPage companyOnly readOnlyCompany />
            </div>
          ) : null}
          <div
            aria-label={t("workspace.pages.OrgRoleCreationPage.2320cf8f", "인박스 탭 내용")}
            aria-labelledby="role-creation-inbox-tab"
            hidden={companyInfoOpen || activeTab !== "inbox"}
            id="role-creation-inbox-panel"
            role="tabpanel"
          >
            {!companyInfoOpen &&
            activeTab === "inbox" &&
            role &&
            !roleCreation ? (
              <OrgRoleCandidatesTab
                display="board"
                mobile={mobile}
                onDisplayChange={setPipelineDisplay}
                tab="inbox"
              />
            ) : null}
          </div>
          <div
            aria-label={t("workspace.pages.OrgRoleCreationPage.75d1f1fb", "파이프라인 탭 내용")}
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
            aria-label={t("workspace.pages.OrgRoleCreationPage.6ded0155", "매칭 기준 탭 내용")}
            aria-labelledby="role-creation-matching-tab"
            hidden={companyInfoOpen || activeTab !== "matching"}
            id="role-creation-matching-panel"
            role="tabpanel"
          >
            {role ? (
              <OrgRoleMatchingContent
                key={`matching:${role.roleId}`}
                role={role}
                workspaceId={workspace.workspaceId}
              />
            ) : (
              <div className="py-12 text-center text-sm text-neutral-muted">
                {t("workspace.pages.OrgRoleCreationPage.548f7898", "역할 정보를 불러오는 중입니다.")}
              </div>
            )}
          </div>
          <div
            aria-label={t("workspace.pages.OrgRoleCreationPage.af3ffc67", "역할 정보 탭 내용")}
            aria-labelledby="role-creation-role-tab"
            hidden={companyInfoOpen || activeTab !== "role"}
            id="role-creation-role-panel"
            role="tabpanel"
          >
            {role ? (
              <OrgRoleDetailsContent
                key={`role:${role.roleId}`}
                role={role}
                workspaceId={workspace.workspaceId}
              />
            ) : (
              <div className="py-12 text-center text-sm text-neutral-muted">
                {t("workspace.pages.OrgRoleCreationPage.548f7898", "역할 정보를 불러오는 중입니다.")}
              </div>
            )}
          </div>
          <div
            aria-label={t("workspace.pages.OrgRoleCreationPage.012479bc", "Setting 탭 내용")}
            aria-labelledby="role-creation-settings-tab"
            hidden={companyInfoOpen || activeTab !== "settings"}
            id="role-creation-settings-panel"
            role="tabpanel"
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
          </div>
        </div>
      </DocumentEditorPanelProvider>
      {role && calibrationId && calibrationProfileId ? (
        <OrgCalibrationProfilePanel
          calibrationId={calibrationId}
          onClose={closeCalibrationProfile}
          profileId={calibrationProfileId}
          roleId={role.roleId}
          roleName={role.name}
          workspaceId={workspace.workspaceId}
        />
      ) : null}
    </section>
  );
}

export function OrgRoleCreationPage() {
  const t = useOrgT();
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
  const roleId = router.isReady ? getQueryText(router.query.roleId) : "";
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

  useEffect(() => {
    setNavigationTriggerHidden(mobileDetailsOpen);
    return () => setNavigationTriggerHidden(false);
  }, [mobileDetailsOpen, setNavigationTriggerHidden]);

  if (isNewRolePage && !permissions.canManageCandidates) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-muted">
        {t("workspace.pages.OrgRoleCreationPage.7c332120", "역할을 등록할 권한이 없습니다.")}
      </div>
    );
  }

  return (
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
          isNewRolePage
            ? t("workspace.pages.OrgRoleCreationPage.fb3f0cac", "새 역할 등록 대화")
            : t("workspace.pages.OrgRoleCreationPage.7df56925", "역할 대화")
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
            header={
              <>
                <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center gap-2 bg-linear-to-b from-white/30 to-white/0 px-3 md:hidden">
                  {isNewRolePage ? (
                    <span aria-hidden className="size-8 shrink-0" />
                  ) : (
                    <MuteButton
                      aria-label={t(
                        "workspace.pages.OrgRoleCreationPage.3bb985b9", "메뉴 열기"
                      )}
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
                        ? role?.name ||
                          t("workspace.pages.OrgRoleCreationPage.c5bb73aa", "역할 불러오는 중")
                        : t("workspace.pages.OrgRoleCreationPage.d9d673d2", "새 역할 등록")}
                    </h1>
                  </div>
                  {roleId ? (
                    <MuteButton
                      aria-label={t(
                        "workspace.pages.OrgRoleCreationPage.6034f8df", "역할 상세 열기"
                      )}
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
                      {role?.name ||
                        t("workspace.pages.OrgRoleCreationPage.c5bb73aa", "역할 불러오는 중")}
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
      {roleId ? (
        <>
          <div
            aria-label={t("workspace.pages.OrgRoleCreationPage.2ee10b6b", "역할 대화 패널 너비 조절")}
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
              className="h-full w-px bg-neutral-1000-a10 transition-colors group-hover:bg-neutral-400 group-focus-visible:bg-neutral-400"
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
      {roleId ? (
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
  );
}
