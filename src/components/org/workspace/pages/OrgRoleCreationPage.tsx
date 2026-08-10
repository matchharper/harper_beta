import { BriefcaseBusiness, Building2, Scale, Settings } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgRoleOverviewPanel } from "@/components/org/OrgRoleOverview";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import {
  ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
  useOrgRoleCreationUiStore,
} from "@/store/useOrgRoleCreationUiStore";

type RoleCreationTab = "role" | "company" | "settings" | "calibration";

const ORG_ROLE_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
const ORG_ROLE_SPLIT_HANDLE_WIDTH_PX = 8;

const DETAIL_TABS = [
  {
    icon: <BriefcaseBusiness className="size-3.5" strokeWidth={1.65} />,
    label: "Role",
    value: "role",
  },
  {
    icon: <Building2 className="size-3.5" strokeWidth={1.65} />,
    label: "Company",
    value: "company",
  },
  {
    icon: <Settings className="size-3.5" strokeWidth={1.65} />,
    label: "Setting",
    value: "settings",
  },
  {
    icon: <Scale className="size-3.5" strokeWidth={1.65} />,
    label: "Calibration",
    value: "calibration",
  },
] as const;

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getRoleVersion(role: OrgRole) {
  return `${role.updatedAt}:${role.memoryUpdatedAt ?? ""}`;
}

function OrgRoleCreationDetails({ role }: { role: OrgRole | null }) {
  const { workspace } = useOrgWorkspace();
  const [activeTab, setActiveTab] = useState<RoleCreationTab>("role");

  return (
    <section
      aria-label="새 역할 등록 상세"
      className="hidden ml-[-4px] min-h-0 min-w-0 flex-1 flex-col bg-bg-default lg:flex"
    >
      <div
        aria-label="새 역할 정보"
        className="flex w-full items-center gap-1 border-b border-neutral-1000-a05 px-3"
        role="tablist"
      >
        {DETAIL_TABS.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <button
              aria-controls={`role-creation-${tab.value}-panel`}
              aria-selected={active}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xs px-3 py-3 text-[14px] font-light focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 ${
                active
                  ? " text-neutral-primary"
                  : "text-neutral-600 hover:text-neutral-primary"
              }`}
              id={`role-creation-${tab.value}-tab`}
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              role="tab"
              type="button"
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10">
        <div
          aria-label="Role 탭 내용"
          aria-labelledby="role-creation-role-tab"
          hidden={activeTab !== "role"}
          id="role-creation-role-panel"
          role="tabpanel"
        >
          {role ? (
            <OrgRoleOverviewPanel
              key={`role:${role.roleId}:${getRoleVersion(role)}`}
              roleCreation
              role={role}
              section="role"
              workspaceId={workspace.workspaceId}
            />
          ) : (
            <div className="py-12 text-center text-sm text-neutral-muted">
              역할 정보를 불러오는 중입니다.
            </div>
          )}
        </div>
        <div
          aria-label="Company 탭 내용"
          aria-labelledby="role-creation-company-tab"
          hidden={activeTab !== "company"}
          id="role-creation-company-panel"
          role="tabpanel"
        >
          <OrgTeamPage companyOnly />
        </div>
        <div
          aria-label="Setting 탭 내용"
          aria-labelledby="role-creation-settings-tab"
          hidden={activeTab !== "settings"}
          id="role-creation-settings-panel"
          role="tabpanel"
        >
          {role ? (
            <OrgRoleOverviewPanel
              key={`settings:${role.roleId}:${getRoleVersion(role)}`}
              roleCreation
              role={role}
              section="settings"
              workspaceId={workspace.workspaceId}
            />
          ) : null}
        </div>
        <div
          aria-label="Calibration 탭 내용"
          aria-labelledby="role-creation-calibration-tab"
          hidden={activeTab !== "calibration"}
          id="role-creation-calibration-panel"
          role="tabpanel"
        />
      </div>
    </section>
  );
}

export function OrgRoleCreationPage() {
  const router = useRouter();
  const { permissions, roles, workspace } = useOrgWorkspace();
  const roleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const role = roles.find((item) => item.roleId === roleId) ?? null;
  const roleStatus = role
    ? getOrgRoleStatusPresentation(role.status)
    : null;
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
      className={
        roleId
          ? "flex h-full min-h-0 flex-col lg:flex-row lg:overflow-hidden"
          : "h-full min-h-0"
      }
    >
      <section
        aria-label="새 역할 등록 대화"
        className="flex relative h-full min-h-0 min-w-0 flex-col overflow-hidden lg:flex-none lg:basis-[42%]"
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
                {roleId ? (
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
                ) : (
                  <h1 className="sr-only">새 역할 등록</h1>
                )}
              </>
            }
            onRoleCreated={(createdRoleId) => {
              void router.replace(
                buildOrgHref({
                  orgId: workspace.workspaceId,
                  page: "new-role",
                  roleId: createdRoleId,
                }),
                undefined,
                { shallow: true }
              );
            }}
            purpose="role-creation"
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
            className="group relative hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none lg:flex"
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
              className="h-full w-px bg-neutral-1000-a05 transition-colors group-hover:bg-neutral-1000-a10 group-focus-visible:bg-neutral-1000-a10"
            />
          </div>
          <OrgRoleCreationDetails role={role} />
        </>
      ) : null}
    </div>
  );
}
