import {
  BriefcaseBusiness,
  Columns3,
  Menu,
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
import { OrgRoleSettingsContent } from "@/components/org/role-overview/OrgRoleSettingsContent";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { MuteButton } from "@/components/ui/button";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import {
  getOrgRoleStatusPresentation,
  normalizeOrgRoleStatus,
} from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import {
  ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
  useOrgRoleCreationUiStore,
} from "@/store/useOrgRoleCreationUiStore";

type RoleCreationTab = "pipeline" | "matching" | "role" | "settings";
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
  if (!isDraft && tab === "pipeline") return "pipeline";
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
              Pipeline
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
  const DisplayIcon = display === "pipeline" ? Columns3 : Rows3;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          aria-label={`표시 방식: ${
            display === "pipeline" ? "파이프라인" : "보드"
          }`}
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
          파이프라인
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDisplayChange("board")}
          selected={display === "board"}
          variant="sm"
        >
          <Rows3 />
          보드
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgRolePipelineTab({
  display,
  mobile = false,
  onDisplayChange,
}: {
  display: RolePipelineDisplay;
  mobile?: boolean;
  onDisplayChange: (display: RolePipelineDisplay) => void;
}) {
  return (
    <OrgJobsProvider routePage="role">
      <OrgRolePipelineWorkspace
        display={display}
        mobile={mobile}
        onDisplayChange={onDisplayChange}
      />
      <TalentDetailSimpleView />
    </OrgJobsProvider>
  );
}

function OrgRoleCreationDetails({
  companyInfoOpen = false,
  mobile = false,
  onClose,
  onCompanyInfoClose,
  role,
}: {
  companyInfoOpen?: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onCompanyInfoClose?: () => void;
  role: OrgRole | null;
}) {
  const router = useRouter();
  const { workspace } = useOrgWorkspace();
  const roleCreation =
    role !== null && normalizeOrgRoleStatus(role.status) === "draft";
  const requestedTab = router.isReady ? getQueryText(router.query.tab) : "";
  const requestedView = router.isReady ? getQueryText(router.query.view) : "";
  const activeTab = getRoleTab({ isDraft: roleCreation, tab: requestedTab });
  const pipelineDisplay: RolePipelineDisplay =
    mobile || requestedView === "board" ? "board" : "pipeline";
  const detailTabs = roleCreation
    ? DETAIL_TABS
    : [PIPELINE_TAB, ...DETAIL_TABS];
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

  return (
    <section
      aria-label={companyInfoOpen ? "회사 정보 상세" : "새 역할 등록 상세"}
      className={
        mobile
          ? "relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-default"
          : "relative hidden ml-[-4px] min-h-0 min-w-0 flex-1 flex-col bg-bg-default md:flex"
      }
    >
      <DocumentEditorPanelProvider key={role?.roleId ?? "loading"}>
        <div className="flex w-full shrink-0 items-center border-b border-neutral-1000-a05">
          {mobile ? (
            <MuteButton
              aria-label="역할 상세 닫기"
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
            aria-label="새 역할 정보"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3 scrollbar-none",
              mobile && "pl-1"
            )}
            role="tablist"
          >
            {detailTabs.map((tab) => {
              const active = !companyInfoOpen && activeTab === tab.value;
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
                    onCompanyInfoClose?.();
                    setActiveTab(tab.value);
                  }}
                  role="tab"
                  type="button"
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-default px-4 pt-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 md:px-5 md:pt-6 ${
            !companyInfoOpen && activeTab === "pipeline"
              ? "pb-0"
              : mobile
                ? "pb-16"
                : "pb-48"
          }`}
        >
          {companyInfoOpen ? (
            <div aria-label="회사 정보 상세 내용">
              <OrgTeamPage companyOnly readOnlyCompany />
            </div>
          ) : null}
          <div
            aria-label="파이프라인 탭 내용"
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
              <OrgRolePipelineTab
                display={pipelineDisplay}
                mobile={mobile}
                onDisplayChange={setPipelineDisplay}
              />
            ) : null}
          </div>
          <div
            aria-label="매칭 기준 탭 내용"
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
                역할 정보를 불러오는 중입니다.
              </div>
            )}
          </div>
          <div
            aria-label="역할 정보 탭 내용"
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
                역할 정보를 불러오는 중입니다.
              </div>
            )}
          </div>
          <div
            aria-label="Setting 탭 내용"
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
    </section>
  );
}

export function OrgRoleCreationPage() {
  const router = useRouter();
  const { openNavigation, setNavigationTriggerHidden } =
    useOrgMobileNavigation();
  const { page, permissions, roles, workspace } = useOrgWorkspace();
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const isNewRolePage = page === "new-role";
  const roleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const role = roles.find((item) => item.roleId === roleId) ?? null;
  const roleStatus = role ? getOrgRoleStatusPresentation(role.status) : null;
  const isDesktop = useMediaQuery(ORG_ROLE_DESKTOP_MEDIA_QUERY);
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
    enabled: Boolean(roleId) && isDesktop,
    maxPct: ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
    minPct: ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
    onResizeEnd: handleChatPanelResizeEnd,
  });

  useEffect(() => {
    setNavigationTriggerHidden(mobileDetailsOpen);
    return () => setNavigationTriggerHidden(false);
  }, [mobileDetailsOpen, setNavigationTriggerHidden]);

  if (!permissions.canManageCandidates) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-muted">
        역할을 등록할 권한이 없습니다.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        roleId
          ? "flex h-full w-full min-h-0 flex-row transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:translate-x-0 md:overflow-hidden motion-reduce:transition-none"
          : "h-full min-h-0",
        roleId && mobileDetailsOpen && "-translate-x-full"
      )}
    >
      <section
        aria-label={isNewRolePage ? "새 역할 등록 대화" : "역할 대화"}
        className="relative flex h-full w-full shrink-0 min-w-0 flex-col overflow-hidden md:w-auto md:flex-none md:basis-[42%]"
        style={
          roleId && isDesktop
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
                      aria-label="메뉴 열기"
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
                        ? role?.name || "역할 불러오는 중"
                        : "새 역할 등록"}
                    </h1>
                  </div>
                  {roleId ? (
                    <MuteButton
                      aria-label="역할 상세 열기"
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
                {isDesktop && roleId ? (
                  <header className="absolute left-0 top-0 flex h-13 w-full shrink-0 items-center gap-2 bg-linear-to-b from-70% from-bg-default to-bg-default/0 px-4 pb-2">
                    {role ? (
                      <OrgRoleStatusDot decorative status={role.status} />
                    ) : null}
                    <h1 className="truncate text-[14px] font-normal text-neutral-primary">
                      {role?.name || "역할 불러오는 중"}
                    </h1>
                    {roleStatus ? (
                      <span className="shrink-0 text-[14px] font-normal text-neutral-muted">
                        <span aria-hidden="true">- </span>
                        {roleStatus.label}
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
              if (!isDesktop) setMobileDetailsOpen(true);
            }}
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
            aria-label="역할 대화 패널 너비 조절"
            aria-orientation="vertical"
            aria-valuemax={ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT}
            aria-valuemin={ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT}
            aria-valuenow={Math.round(chatPanelWidth)}
            className="group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none md:flex"
            onKeyDown={handleResizeKeyDown}
            onPointerDown={(event) => {
              event.preventDefault();
              handleResizeStart(event.clientX);
            }}
            role="separator"
            tabIndex={isDesktop ? 0 : -1}
          >
            <div
              aria-hidden="true"
              className="h-full w-px bg-neutral-1000-a10 transition-colors group-hover:bg-neutral-400 group-focus-visible:bg-neutral-400"
            />
          </div>
          <OrgRoleCreationDetails
            companyInfoOpen={companyInfoOpen}
            onCompanyInfoClose={() => setCompanyInfoOpen(false)}
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
