import {
  ArrowLeft,
  Blocks,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleHelp,
  Home,
  Inbox,
  Landmark,
  ListFilter,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgInbox } from "@/hooks/org/useOrg";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { usePreviousPathname } from "@/hooks/useRouteHistory";
import { sortOrgRolesByRecentConversation } from "@/lib/org/recentRoles";
import {
  getOrgRoleStatusFilterValue,
  ORG_ROLE_STATUS_FILTER_OPTIONS,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";
import { shouldAnimateOrganizationSidebarEntry } from "@/lib/org/sidebarTransition";
import type { OrgMember, OrgWorkspace } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";

type OrgNavItem = {
  icon: ComponentType<{ className?: string }>;
  id: OrgWorkspacePageId;
  label: string;
  location?: "top" | "bottom";
};

const PRIMARY_NAV: OrgNavItem[] = [
  { icon: Home, id: "home", label: "Home" },
  { icon: Inbox, id: "inbox", label: "Inbox" },
  { icon: BriefcaseBusiness, id: "jobs", label: "Roles" },
  {
    icon: Landmark,
    id: "team",
    label: "Organization",
    location: "bottom",
  },
];
const NEW_ROLE_NAV: OrgNavItem = {
  icon: Plus,
  id: "new-role",
  label: "New",
};
const INTERNAL_ALL_NAV: OrgNavItem = {
  icon: ListFilter,
  id: "all",
  label: "All",
  location: "bottom",
};

function WorkspaceAvatar({
  size = "md",
  workspace,
}: {
  size?: "md" | "sm";
  workspace: OrgWorkspace;
}) {
  const pixelSize = size === "sm" ? 24 : 28;
  const className = size === "sm" ? "size-6 rounded-md" : "size-7 rounded-md";
  if (workspace.logoUrl) {
    return (
      <Image
        alt=""
        className={cn(
          className,
          "shrink-0 border border-neutral-1000-a05 object-cover"
        )}
        height={pixelSize}
        src={workspace.logoUrl}
        unoptimized
        width={pixelSize}
      />
    );
  }
  return (
    <span
      className={cn(
        className,
        "flex shrink-0 items-center justify-center bg-bg-weak text-[11px] font-medium text-neutral-muted"
      )}
    >
      {workspace.companyName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function UserAvatar({
  member,
  size = "md",
}: {
  member?: OrgMember | null;
  size?: "md" | "sm";
}) {
  const displayName = member?.name || member?.email || "User";
  const pixelSize = size === "sm" ? 24 : 30;
  const className =
    size === "sm" ? "size-6 rounded-full" : "size-[30px] rounded-full";
  if (member?.profilePicture) {
    return (
      <Image
        alt={displayName}
        className={cn(className, "shrink-0 object-cover")}
        height={pixelSize}
        src={member.profilePicture}
        unoptimized
        width={pixelSize}
      />
    );
  }
  return (
    <span
      className={cn(
        className,
        "flex shrink-0 items-center justify-center bg-neutral-1000 text-xs font-medium text-neutral-00"
      )}
    >
      {displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function getNavItemClassName({
  active,
  compact,
}: {
  active: boolean;
  compact: boolean;
}) {
  return cn(
    "relative isolate flex h-9 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[14.5px] font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
    compact && "justify-center gap-0 px-0",
    active
      ? "bg-neutral-200/80 text-black"
      : "text-neutral-primary hover:bg-neutral-100 hover:text-neutral-primary"
  );
}

function getMobileNavItemClassName(active: boolean) {
  return cn(
    "relative isolate shrink-0 overflow-hidden rounded-md px-3 py-1.5 text-[12px] font-normal",
    active
      ? "bg-bg-weak text-neutral-primary"
      : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary"
  );
}

function NavLink({
  active,
  compact = false,
  href,
  icon: Icon,
  iconBackground = false,
  internalOnly = false,
  label,
  pendingConnectionCount,
}: {
  active: boolean;
  compact?: boolean;
  href: string;
  icon: ComponentType<{ className?: string }>;
  iconBackground?: boolean;
  internalOnly?: boolean;
  label: string;
  pendingConnectionCount?: number;
}) {
  const tooltipText =
    pendingConnectionCount !== undefined
      ? `${label} · 연결 대기 ${pendingConnectionCount}명`
      : label;
  const link = (
    <Link
      aria-label={compact ? tooltipText : undefined}
      aria-current={active ? "page" : undefined}
      className={getNavItemClassName({ active, compact })}
      href={href}
    >
      {internalOnly ? <InternalOnlyHatch className="opacity-70" /> : null}
      {iconBackground ? (
        <span className="relative z-20 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-faded text-primary">
          <Icon className="size-3.5 stroke-[1.8]" />
        </span>
      ) : (
        <Icon className="relative z-20 size-4.5 stroke-[1.5]" />
      )}
      {compact ? null : <span className="relative z-20">{label}</span>}
      {!compact && pendingConnectionCount !== undefined ? (
        <div className="relative z-20 ml-auto rounded-full text-[10px] py-0.5 bg-action-500 px-1.5 tabular-nums text-white">
          {pendingConnectionCount}
        </div>
      ) : null}
    </Link>
  );

  return compact ? (
    <Tooltips side="right" text={tooltipText}>
      {link}
    </Tooltips>
  ) : (
    link
  );
}

function RecentRoleTitle({ title }: { title: string }) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const measureTruncation = () => {
      setIsTruncated(text.scrollWidth > text.clientWidth);
    };

    measureTruncation();
    window.addEventListener("resize", measureTruncation);
    const resizeObserver = window.ResizeObserver
      ? new window.ResizeObserver(measureTruncation)
      : null;
    resizeObserver?.observe(text);

    return () => {
      window.removeEventListener("resize", measureTruncation);
      resizeObserver?.disconnect();
    };
  }, [title]);

  return (
    <Tooltips side="right" text={isTruncated ? title : ""}>
      <span ref={textRef} className="min-w-0 flex-1 truncate">
        {title}
      </span>
    </Tooltips>
  );
}

function OrgSlackConnectionCard() {
  const router = useRouter();
  const { permissions, workspace } = useOrgWorkspace();
  const statusQuery = useOrgSlackStatus({
    workspaceId: workspace.workspaceId,
  });

  if (statusQuery.isLoading || statusQuery.data?.connected) {
    return null;
  }

  return (
    <section
      aria-label="Slack 연결 안내"
      className="mb-2 rounded-lg border border-neutral-1000-a05 bg-bg-floating p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-weak">
          <Image
            alt=""
            aria-hidden="true"
            height={18}
            src="/images/logos/slack.svg"
            width={18}
          />
        </span>
        <p className="text-[12px] font-medium text-neutral-primary">
          Slack을 연결해 주세요
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-[1.45] text-neutral-muted">
        채용 진행 알림과 역할 생성, 기준 변경 등 모든 작업을 Slack으로 할 수
        있어요.
      </p>
      {permissions.canManageIntegrations ? (
        <MuteButton
          className="mt-3 w-full"
          onClick={() =>
            void router.push(
              buildOrgHref({
                orgId: workspace.workspaceId,
                page: "settings",
              })
            )
          }
          size="sm"
          variant="dark"
        >
          <Image
            alt=""
            aria-hidden="true"
            height={12}
            src="/images/logos/slack.svg"
            width={12}
          />
          Integration에서 연결하기
        </MuteButton>
      ) : (
        <p className="mt-3 text-[10px] leading-4 text-neutral-soft">
          Workspace Owner 또는 Admin이 Slack을 연결할 수 있어요.
        </p>
      )}
    </section>
  );
}

export function OrgWorkspaceSidebar({
  compact = false,
}: {
  compact?: boolean;
}) {
  const router = useRouter();
  const previousPathname = usePreviousPathname();
  const signOut = useAuthStore((state) => state.signOut);
  const [signOutPending, setSignOutPending] = useState(false);
  const [visibleRecentRoleStatuses, setVisibleRecentRoleStatuses] = useState<
    OrgRoleStatus[]
  >(() => ORG_ROLE_STATUS_FILTER_OPTIONS.map((option) => option.status));
  const {
    currentUser,
    internalOpsAccess,
    page: activePage,
    permissions,
    roles,
    workspace,
    workspaces,
  } = useOrgWorkspace();
  const inboxQuery = useOrgInbox({ workspaceId: workspace.workspaceId });
  const pendingConnectionCount = useMemo(
    () =>
      inboxQuery.data?.items.reduce(
        (count, item) => count + (item.stage === "pending_connection" ? 1 : 0),
        0
      ),
    [inboxQuery.data?.items]
  );
  const canSwitchWorkspace = workspaces.length > 1;
  const baseNav = internalOpsAccess
    ? [INTERNAL_ALL_NAV, ...PRIMARY_NAV]
    : PRIMARY_NAV;
  const primaryNav = permissions.canManageCandidates
    ? baseNav.flatMap((item) =>
        item.id === "jobs" ? [item, NEW_ROLE_NAV] : [item]
      )
    : baseNav;
  const topNav = primaryNav.filter((item) => item.location !== "bottom");
  const bottomNav = primaryNav.filter((item) => item.location === "bottom");
  const recentRoles = useMemo(
    () => sortOrgRolesByRecentConversation(roles),
    [roles]
  );
  const visibleRecentRoleStatusSet = useMemo(
    () => new Set(visibleRecentRoleStatuses),
    [visibleRecentRoleStatuses]
  );
  const filteredRecentRoles = useMemo(
    () =>
      recentRoles.filter((role) =>
        visibleRecentRoleStatusSet.has(getOrgRoleStatusFilterValue(role.status))
      ),
    [recentRoles, visibleRecentRoleStatusSet]
  );
  const recentStatusFilterActive =
    visibleRecentRoleStatuses.length !== ORG_ROLE_STATUS_FILTER_OPTIONS.length;
  const activeRoleId =
    typeof router.query.roleId === "string" ? router.query.roleId.trim() : "";
  const navHref = (page: OrgWorkspacePageId) =>
    buildOrgHref({ orgId: workspace.workspaceId, page });
  const organizationMode =
    activePage === "team" ||
    activePage === "member" ||
    activePage === "settings";
  const animateOrganizationSidebarEntry =
    shouldAnimateOrganizationSidebarEntry(previousPathname);
  const organizationSection =
    activePage === "settings"
      ? "integration"
      : activePage === "member"
        ? "members"
        : "company";
  const organizationCompanyHref = buildOrgHref({
    orgId: workspace.workspaceId,
    page: "team",
  });
  const organizationMembersHref = buildOrgHref({
    orgId: workspace.workspaceId,
    page: "member",
  });
  const organizationReturnHref = buildOrgHref({
    orgId: workspace.workspaceId,
    page: "home",
  });
  const toggleRecentRoleStatus = (status: OrgRoleStatus, checked: boolean) => {
    setVisibleRecentRoleStatuses((current) => {
      const next = new Set(current);
      if (checked) next.add(status);
      else next.delete(status);
      return ORG_ROLE_STATUS_FILTER_OPTIONS.map(
        (option) => option.status
      ).filter((value) => next.has(value));
    });
  };
  const selectWorkspace = (workspaceId: string) => {
    if (!workspaceId || workspaceId === workspace.workspaceId) return;
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: activePage,
        roleId: activePage === "jobs" ? "all" : null,
      })
    );
  };
  const handleSignOut = async () => {
    setSignOutPending(true);
    try {
      await signOut();
      await router.replace("/org");
    } finally {
      setSignOutPending(false);
    }
  };

  const workspaceControl =
    canSwitchWorkspace && workspaces.length > 1 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MuteButton
            aria-label="Workspace 변경"
            className="w-full justify-between"
            size="md"
            variant="transparent"
          >
            <span className="flex min-w-0 items-center gap-2">
              <WorkspaceAvatar workspace={workspace} />
              <span className="truncate text-[14px] font-medium text-neutral-primary">
                {workspace.companyName}
              </span>
            </span>
            <ChevronDown className="size-3.5 text-neutral-soft" />
          </MuteButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {workspaces.map((item) => (
            <DropdownMenuItem
              key={item.workspaceId}
              onSelect={() => selectWorkspace(item.workspaceId)}
              selected={item.workspaceId === workspace.workspaceId}
            >
              <WorkspaceAvatar size="sm" workspace={item} />
              <span className="truncate">{item.companyName}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <div className="flex min-w-0 items-center gap-2.5 px-2 py-1.5">
        <WorkspaceAvatar workspace={workspace} />
        <span className="truncate text-[13px] font-medium text-neutral-primary">
          {workspace.companyName}
        </span>
      </div>
    );
  const compactWorkspaceControl =
    canSwitchWorkspace && workspaces.length > 1 ? (
      <DropdownMenu>
        <Tooltips side="right" text={workspace.companyName}>
          <DropdownMenuTrigger asChild>
            <MuteButton
              aria-label={`${workspace.companyName} Workspace 변경`}
              className="w-full justify-center px-0"
              size="md"
              variant="transparent"
            >
              <WorkspaceAvatar workspace={workspace} />
            </MuteButton>
          </DropdownMenuTrigger>
        </Tooltips>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {workspaces.map((item) => (
            <DropdownMenuItem
              key={item.workspaceId}
              onSelect={() => selectWorkspace(item.workspaceId)}
              selected={item.workspaceId === workspace.workspaceId}
            >
              <WorkspaceAvatar size="sm" workspace={item} />
              <span className="truncate">{item.companyName}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Tooltips side="right" text={workspace.companyName}>
        <div
          aria-label={workspace.companyName}
          className="flex h-9 items-center justify-center"
          role="img"
        >
          <WorkspaceAvatar workspace={workspace} />
        </div>
      </Tooltips>
    );

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-neutral-1000-a05 py-3 lg:flex",
          compact ? "w-[72px] px-3" : "w-[244px] px-3"
        )}
      >
        <AnimatePresence mode="wait">
          {organizationMode ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex min-h-0 flex-1 flex-col"
              exit={{ opacity: 0, x: -28 }}
              initial={
                animateOrganizationSidebarEntry ? { opacity: 0, x: -28 } : false
              }
              key="organization-sidebar"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-3 border-b border-neutral-1000-a05 pb-3">
                <NavLink
                  active={false}
                  href={organizationReturnHref}
                  icon={ArrowLeft}
                  label="돌아가기"
                />
              </div>
              <nav aria-label="Organization 설정" className="space-y-1">
                <NavLink
                  active={organizationSection === "company"}
                  href={organizationCompanyHref}
                  icon={Building2}
                  label="회사정보"
                />
                <NavLink
                  active={organizationSection === "members"}
                  href={organizationMembersHref}
                  icon={Users}
                  label="멤버"
                />
                <NavLink
                  active={organizationSection === "integration"}
                  href={navHref("settings")}
                  icon={Blocks}
                  label="Integration"
                />
              </nav>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex min-h-0 flex-1 flex-col"
              exit={{ opacity: 0, x: -28 }}
              initial={false}
              key="main-sidebar"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-2">
                {compact ? compactWorkspaceControl : workspaceControl}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10">
                <nav aria-label="Organization" className="space-y-1">
                  {topNav.map((item) => (
                    <NavLink
                      key={item.id}
                      active={activePage === item.id}
                      compact={compact}
                      href={navHref(item.id)}
                      icon={item.icon}
                      iconBackground={item.id === "new-role"}
                      internalOnly={item.id === "all"}
                      label={item.label}
                      pendingConnectionCount={
                        item.id === "inbox" ? pendingConnectionCount : undefined
                      }
                    />
                  ))}
                </nav>

                {!compact && permissions.canManageCandidates ? (
                  <section className="mt-4 border-t border-neutral-1000-a05 pt-4">
                    <div className="mb-2 flex items-center justify-between px-2.5 text-[13px] font-normal text-neutral-muted">
                      <span>Recent</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <MuteButton
                            aria-label="Recent 역할 상태 필터"
                            aria-pressed={recentStatusFilterActive}
                            size="sm"
                            variant={
                              recentStatusFilterActive
                                ? "neutral"
                                : "transparent"
                            }
                          >
                            <ListFilter className="size-3.5 stroke-[1.5]" />
                          </MuteButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel className="text-[12px] font-normal">
                            표시할 상태
                          </DropdownMenuLabel>
                          {ORG_ROLE_STATUS_FILTER_OPTIONS.map((option) => (
                            <DropdownMenuCheckboxItem
                              key={option.status}
                              checked={visibleRecentRoleStatusSet.has(
                                option.status
                              )}
                              className="gap-2"
                              indicatorPosition="right"
                              onCheckedChange={(checked) =>
                                toggleRecentRoleStatus(
                                  option.status,
                                  checked === true
                                )
                              }
                              onSelect={(event) => event.preventDefault()}
                            >
                              <OrgRoleStatusDot
                                decorative
                                status={option.status}
                              />
                              <span>{option.label}</span>
                            </DropdownMenuCheckboxItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() =>
                              setVisibleRecentRoleStatuses([
                                ...ORG_ROLE_STATUS_FILTER_OPTIONS.map(
                                  (option) => option.status
                                ),
                              ])
                            }
                            selected={!recentStatusFilterActive}
                          >
                            전체 상태
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <nav aria-label="Recent roles" className="space-y-1">
                      {filteredRecentRoles.map((role) => {
                        const active =
                          activePage === "role" && activeRoleId === role.roleId;
                        return (
                          <Link
                            key={role.roleId}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex h-9 min-w-0 items-center gap-2.5 rounded-sm px-2.5 text-[14px] font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
                              active
                                ? "bg-neutral-200/80 text-black"
                                : "text-neutral-primary hover:bg-neutral-100"
                            )}
                            href={buildOrgHref({
                              orgId: workspace.workspaceId,
                              page: "role",
                              roleId: role.roleId,
                            })}
                          >
                            <OrgRoleStatusDot status={role.status} />
                            <RecentRoleTitle title={role.name} />
                          </Link>
                        );
                      })}
                      {recentRoles.length > 0 &&
                      filteredRecentRoles.length === 0 ? (
                        <p className="px-2.5 py-2 text-[12px] text-neutral-soft">
                          선택한 상태의 역할이 없습니다.
                        </p>
                      ) : null}
                    </nav>
                  </section>
                ) : null}
              </div>

              <div className="space-y-1">
                {bottomNav.map((item) => (
                  <div key={item.id}>
                    {item.id === "team" && !compact ? (
                      <OrgSlackConnectionCard />
                    ) : null}
                    <NavLink
                      active={activePage === item.id}
                      compact={compact}
                      href={navHref(item.id)}
                      icon={item.icon}
                      internalOnly={item.id === "all"}
                      label={item.label}
                      pendingConnectionCount={
                        item.id === "inbox" ? pendingConnectionCount : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <DropdownMenu>
          {compact ? (
            <Tooltips side="right" text="프로필 메뉴">
              <DropdownMenuTrigger asChild>
                <MuteButton
                  aria-label="프로필 메뉴"
                  className="w-full justify-center px-0"
                  size="md"
                  variant="transparent"
                >
                  <UserAvatar member={currentUser} size="sm" />
                </MuteButton>
              </DropdownMenuTrigger>
            </Tooltips>
          ) : (
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label="프로필 메뉴"
                className="w-full justify-start"
                size="md"
                variant="transparent"
              >
                <UserAvatar member={currentUser} size="sm" />
                <span className="ml-1 min-w-0 text-left">
                  <span className="block truncate text-sm font-medium text-neutral-primary">
                    {currentUser?.name || currentUser?.email || "User"}
                  </span>
                  {currentUser?.email ? (
                    <span className="block truncate text-[12px] font-light text-neutral-soft">
                      {currentUser.email}
                    </span>
                  ) : null}
                </span>
              </MuteButton>
            </DropdownMenuTrigger>
          )}
          <DropdownMenuContent align="start" className="w-[224px]" side="top">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-[13px] font-medium text-neutral-primary">
                {currentUser?.name || "이름 없음"}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-light text-neutral-muted">
                {currentUser?.email || "-"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openCustomCrispWidget()}>
              <CircleHelp />
              문의하기
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void router.push(navHref("documents"))}
            >
              <BookOpenText />
              Documents
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signOutPending}
              onSelect={() => void handleSignOut()}
              tone="danger"
            >
              <LogOut />
              {signOutPending ? "로그아웃 중" : "로그아웃"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>

      <header className="sticky top-0 z-40 border-b border-neutral-1000-a05 bg-bg-default/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex-1">{workspaceControl}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label="프로필 메뉴"
                size="sm"
                variant="transparent"
              >
                <UserAvatar member={currentUser} size="sm" />
              </MuteButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-[12px] font-medium">
                  {currentUser?.name || "이름 없음"}
                </span>
                <span className="block truncate text-[11px] text-neutral-muted">
                  {currentUser?.email || "-"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openCustomCrispWidget()}>
                <CircleHelp />
                문의하기
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void router.push(navHref("documents"))}
              >
                <BookOpenText />
                Documents
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signOutPending}
                onSelect={() => void handleSignOut()}
                tone="danger"
              >
                <LogOut />
                {signOutPending ? "로그아웃 중" : "로그아웃"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav
          aria-label={organizationMode ? "Organization 설정" : "Organization"}
          className="flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-none"
        >
          {organizationMode ? (
            <>
              <Link
                className={getMobileNavItemClassName(false)}
                href={organizationReturnHref}
              >
                <span className="flex items-center gap-1.5">
                  <ArrowLeft className="size-3.5" />
                  돌아가기
                </span>
              </Link>
              <Link
                aria-current={
                  organizationSection === "company" ? "page" : undefined
                }
                className={getMobileNavItemClassName(
                  organizationSection === "company"
                )}
                href={organizationCompanyHref}
              >
                회사정보
              </Link>
              <Link
                aria-current={
                  organizationSection === "members" ? "page" : undefined
                }
                className={getMobileNavItemClassName(
                  organizationSection === "members"
                )}
                href={organizationMembersHref}
              >
                멤버
              </Link>
              <Link
                aria-current={
                  organizationSection === "integration" ? "page" : undefined
                }
                className={getMobileNavItemClassName(
                  organizationSection === "integration"
                )}
                href={navHref("settings")}
              >
                Integration
              </Link>
            </>
          ) : (
            [
              ...primaryNav,
              {
                icon: BookOpenText,
                id: "documents" as const,
                label: "Documents",
              },
            ].map((item) => (
              <Link
                key={item.id}
                aria-current={activePage === item.id ? "page" : undefined}
                className={getMobileNavItemClassName(activePage === item.id)}
                href={navHref(item.id)}
              >
                {item.id === "all" ? (
                  <InternalOnlyHatch className="opacity-70" />
                ) : null}
                <span className="relative z-20 flex items-center gap-2">
                  {item.id === "new-role" ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary-faded text-primary">
                      <Plus className="size-3.5 stroke-[1.8]" />
                    </span>
                  ) : null}
                  {item.label}
                  {item.id === "inbox" &&
                  pendingConnectionCount !== undefined ? (
                    <Badge
                      aria-label={`연결 대기 ${pendingConnectionCount}명`}
                      className="min-w-5 bg-blue-500 px-1.5 tabular-nums text-white"
                      radius="full"
                      size="sm"
                    >
                      {pendingConnectionCount}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            ))
          )}
        </nav>
      </header>
    </>
  );
}

export function OrgWorkspaceShellSkeleton({
  compact = false,
  wide = false,
}: {
  compact?: boolean;
  wide?: boolean;
}) {
  return (
    <Page as="main" background="neutral">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-neutral-1000-a05 py-4 lg:block ",
          compact ? "w-[72px] px-3" : "w-[256px] px-4"
        )}
      >
        <Skeleton className={cn("h-9", compact ? "mx-auto w-9" : "w-full")} />
        <div className="mt-5 space-y-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton
              className={cn("h-9", compact ? "mx-auto w-9" : "w-full")}
              key={index}
            />
          ))}
        </div>
      </aside>
      <div className={compact ? "lg:pl-[72px]" : "lg:pl-[256px]"}>
        <PageContainer className="py-7" size={wide ? "wide" : "narrow"}>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3 w-72 max-w-full" />
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </PageContainer>
      </div>
    </Page>
  );
}
