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
  Menu,
  ListFilter,
  LogOut,
  PanelLeftClose,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { useOrgMobileNavigation } from "@/components/org/workspace/OrgMobileNavigation";
import { useOrgInbox } from "@/hooks/org/useOrg";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { usePreviousPathname } from "@/hooks/useRouteHistory";
import { sortOrgRolesForRecentList } from "@/lib/org/recentRoles";
import { ORG_PRODUCT_LABELS } from "@/lib/org/productVocabulary";
import {
  getOrgRoleStatusFilterValue,
  ORG_ROLE_STATUS_FILTER_OPTIONS,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";
import { shouldAnimateOrganizationSidebarEntry } from "@/lib/org/sidebarTransition";
import type { OrgMember, OrgRole, OrgWorkspace } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

type OrgNavItem = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  id: OrgWorkspacePageId;
  label: string;
  location?: "top" | "bottom";
};

const PRIMARY_NAV: OrgNavItem[] = [
  { icon: Home, id: "home", label: ORG_PRODUCT_LABELS.home },
  { icon: Inbox, id: "inbox", label: ORG_PRODUCT_LABELS.inbox },
  { icon: BriefcaseBusiness, id: "jobs", label: ORG_PRODUCT_LABELS.roles },
  {
    icon: Landmark,
    id: "team",
    label: ORG_PRODUCT_LABELS.organization,
    location: "bottom",
  },
];
const NEW_ROLE_NAV: OrgNavItem = {
  icon: Plus,
  id: "new-role",
  label: ORG_PRODUCT_LABELS.newRole,
};
const ALL_ROLE_STATUSES = ORG_ROLE_STATUS_FILTER_OPTIONS.map(
  (option) => option.status
);

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

function WorkspaceControl({
  compact = false,
  onSelectWorkspace,
  workspace,
  workspaces,
}: {
  compact?: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  workspace: OrgWorkspace;
  workspaces: OrgWorkspace[];
}) {
  if (workspaces.length <= 1) {
    return compact ? (
      <Tooltips side="right" text={workspace.companyName}>
        <div
          aria-label={workspace.companyName}
          className="flex h-9 items-center justify-center"
          role="img"
        >
          <WorkspaceAvatar workspace={workspace} />
        </div>
      </Tooltips>
    ) : (
      <div className="flex min-w-0 items-center gap-2.5 px-2 py-1.5">
        <WorkspaceAvatar workspace={workspace} />
        <span className="truncate text-[13px] font-medium text-neutral-primary">
          {workspace.companyName}
        </span>
      </div>
    );
  }

  const trigger = (
    <DropdownMenuTrigger asChild>
      <MuteButton
        aria-label={`${workspace.companyName} Workspace 변경`}
        className={cn(
          "w-full",
          compact ? "justify-center px-0" : "justify-between"
        )}
        size="md"
        variant="transparent"
      >
        <span className={cn("flex items-center", !compact && "min-w-0 gap-2")}>
          <WorkspaceAvatar workspace={workspace} />
          {compact ? null : (
            <span className="truncate text-[14px] font-medium text-neutral-primary">
              {workspace.companyName}
            </span>
          )}
        </span>
        {compact ? null : (
          <ChevronDown className="size-3.5 text-neutral-soft" />
        )}
      </MuteButton>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {compact ? (
        <Tooltips side="right" text={workspace.companyName}>
          {trigger}
        </Tooltips>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        {workspaces.map((item) => (
          <DropdownMenuItem
            key={item.workspaceId}
            onSelect={() => onSelectWorkspace(item.workspaceId)}
            selected={item.workspaceId === workspace.workspaceId}
          >
            <WorkspaceAvatar size="sm" workspace={item} />
            <span className="truncate">{item.companyName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

function NavLink({
  active,
  compact = false,
  href,
  icon: Icon,
  iconBackground = false,
  label,
  pendingConnectionCount,
}: {
  active: boolean;
  compact?: boolean;
  href: string;
  icon: ComponentType<{ className?: string }>;
  iconBackground?: boolean;
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

function RecentRoleTitle({
  mobile = false,
  title,
}: {
  mobile?: boolean;
  title: string;
}) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const measureTruncation = () => {
      setIsTruncated(
        mobile
          ? text.scrollHeight > text.clientHeight
          : text.scrollWidth > text.clientWidth
      );
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
  }, [mobile, title]);

  return (
    <Tooltips side="right" text={isTruncated ? title : ""}>
      <span
        ref={textRef}
        className={cn("min-w-0 flex-1", mobile ? "line-clamp-2" : "truncate")}
      >
        {title}
      </span>
    </Tooltips>
  );
}

function RecentRoleStatusFilter({
  active,
  onReset,
  onToggle,
  visibleStatuses,
}: {
  active: boolean;
  onReset: () => void;
  onToggle: (status: OrgRoleStatus, checked: boolean) => void;
  visibleStatuses: ReadonlySet<OrgRoleStatus>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          aria-label="Recent 역할 상태 필터"
          aria-pressed={active}
          size="sm"
          variant={active ? "neutral" : "transparent"}
        >
          <ListFilter className="size-3.5 stroke-[1.6]" />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[12px] font-normal">
          표시할 상태
        </DropdownMenuLabel>
        {ORG_ROLE_STATUS_FILTER_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.status}
            checked={visibleStatuses.has(option.status)}
            className="gap-2"
            indicatorPosition="right"
            onCheckedChange={(checked) =>
              onToggle(option.status, checked === true)
            }
            onSelect={(event) => event.preventDefault()}
          >
            <OrgRoleStatusDot decorative status={option.status} />
            <span>{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset} selected={!active}>
          전체 상태
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RecentRolesSection({
  activePage,
  activeRoleId,
  filteredRoles,
  mobile = false,
  onNavigate,
  onResetStatusFilter,
  onToggleStatus,
  recentRoleCount,
  statusFilterActive,
  visibleStatuses,
  workspaceId,
}: {
  activePage: OrgWorkspacePageId;
  activeRoleId: string;
  filteredRoles: readonly OrgRole[];
  mobile?: boolean;
  onNavigate?: () => void;
  onResetStatusFilter: () => void;
  onToggleStatus: (status: OrgRoleStatus, checked: boolean) => void;
  recentRoleCount: number;
  statusFilterActive: boolean;
  visibleStatuses: ReadonlySet<OrgRoleStatus>;
  workspaceId: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col border-t border-neutral-1000-a05",
        mobile ? "pt-2" : "mt-4 pt-4"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between text-neutral-muted",
          mobile
            ? "mb-1 px-4 text-[12px]"
            : "mx-3 mb-2 px-2.5 text-[13px] font-normal"
        )}
      >
        <span>{ORG_PRODUCT_LABELS.recent}</span>
        <RecentRoleStatusFilter
          active={statusFilterActive}
          onReset={onResetStatusFilter}
          onToggle={onToggleStatus}
          visibleStatuses={visibleStatuses}
        />
      </div>
      <nav
        aria-label="Recent roles"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10",
          mobile ? "px-2" : "px-3"
        )}
      >
        <div className={cn("space-y-1", mobile && "pb-2")}>
          {filteredRoles.map((role) => {
            const active =
              activePage === "role" && activeRoleId === role.roleId;
            return (
              <Link
                key={role.roleId}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 min-w-0 items-center font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
                  mobile
                    ? "gap-2 rounded-md px-2 py-1.5 text-[13px]"
                    : "h-9 gap-2.5 rounded-sm px-2.5 text-[14px]",
                  active &&
                    (mobile
                      ? "bg-bg-weak text-neutral-primary"
                      : "bg-neutral-200/80 text-black"),
                  !active &&
                    (mobile
                      ? "text-neutral-primary hover:bg-bg-weak"
                      : "text-neutral-primary hover:bg-neutral-100")
                )}
                href={buildOrgHref({
                  orgId: workspaceId,
                  page: "role",
                  roleId: role.roleId,
                })}
                onClick={onNavigate}
              >
                <OrgRoleStatusDot status={role.status} />
                <RecentRoleTitle mobile={mobile} title={role.name} />
              </Link>
            );
          })}
          {recentRoleCount > 0 && filteredRoles.length === 0 ? (
            <p
              className={cn(
                "py-2 text-[12px] text-neutral-soft",
                mobile ? "px-3" : "px-2.5"
              )}
            >
              선택한 상태의 역할이 없습니다.
            </p>
          ) : null}
        </div>
      </nav>
    </section>
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
          Slack 연결하기
        </MuteButton>
      ) : (
        <></>
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
  const {
    closeNavigation,
    navigationOpen,
    navigationTriggerHidden,
    openNavigation,
    setNavigationOpen,
  } = useOrgMobileNavigation();
  const previousPathname = usePreviousPathname();
  const signOut = useAuthStore((state) => state.signOut);
  const [signOutPending, setSignOutPending] = useState(false);
  const [mobileOrganizationMenuOpen, setMobileOrganizationMenuOpen] =
    useState(false);
  const [visibleRecentRoleStatuses, setVisibleRecentRoleStatuses] = useState<
    OrgRoleStatus[]
  >(() => [...ALL_ROLE_STATUSES]);
  const {
    currentUser,
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
  const primaryNav = permissions.canManageCandidates
    ? PRIMARY_NAV.flatMap((item) =>
        item.id === "jobs" ? [item, NEW_ROLE_NAV] : [item]
      )
    : PRIMARY_NAV;
  const topNav = primaryNav.filter((item) => item.location !== "bottom");
  const bottomNav = primaryNav.filter((item) => item.location === "bottom");
  const recentRoles = useMemo(() => sortOrgRolesForRecentList(roles), [roles]);
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
  const organizationNav = [
    {
      active: organizationSection === "company",
      href: navHref("team"),
      icon: Building2,
      label: ORG_PRODUCT_LABELS.company,
    },
    {
      active: organizationSection === "members",
      href: navHref("member"),
      icon: Users,
      label: ORG_PRODUCT_LABELS.members,
    },
    {
      active: organizationSection === "integration",
      href: navHref("settings"),
      icon: Blocks,
      label: ORG_PRODUCT_LABELS.integrations,
    },
  ];
  const organizationReturnHref = buildOrgHref({
    orgId: workspace.workspaceId,
    page: "home",
  });
  const handleOpenMobileNavigation = () => {
    setMobileOrganizationMenuOpen(organizationMode);
    openNavigation();
  };
  const handleMobileNavigationOpenChange = (open: boolean) => {
    if (open) setMobileOrganizationMenuOpen(organizationMode);
    setNavigationOpen(open);
  };
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
  const resetRecentRoleStatusFilter = () =>
    setVisibleRecentRoleStatuses([...ALL_ROLE_STATUSES]);
  const selectWorkspace = (workspaceId: string) => {
    if (!workspaceId || workspaceId === workspace.workspaceId) return;
    closeNavigation();
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
      closeNavigation();
      await router.replace("/org");
    } finally {
      setSignOutPending(false);
    }
  };

  useEffect(() => {
    setNavigationOpen(false);
  }, [router.asPath, setNavigationOpen]);

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-neutral-1000-a05 py-3 md:flex",
          compact ? "w-[72px]" : "w-[244px]"
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
              <div className="mx-3 mb-3 border-b border-neutral-1000-a05 pb-3">
                <NavLink
                  active={false}
                  href={organizationReturnHref}
                  icon={ArrowLeft}
                  label="돌아가기"
                />
              </div>
              <nav aria-label="Organization 설정" className="mx-3 space-y-1">
                {organizationNav.map((item) => (
                  <NavLink key={item.label} {...item} />
                ))}
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
              <div className="mx-3 mb-2">
                <WorkspaceControl
                  compact={compact}
                  onSelectWorkspace={selectWorkspace}
                  workspace={workspace}
                  workspaces={workspaces}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <nav aria-label="Organization" className="mx-3 space-y-1">
                  {topNav.map((item) => (
                    <NavLink
                      key={item.id}
                      active={activePage === item.id}
                      compact={compact}
                      href={navHref(item.id)}
                      icon={item.icon}
                      iconBackground={item.id === "new-role"}
                      label={item.label}
                      pendingConnectionCount={
                        item.id === "inbox" ? pendingConnectionCount : undefined
                      }
                    />
                  ))}
                </nav>

                {!compact ? (
                  <RecentRolesSection
                    activePage={activePage}
                    activeRoleId={activeRoleId}
                    filteredRoles={filteredRecentRoles}
                    onResetStatusFilter={resetRecentRoleStatusFilter}
                    onToggleStatus={toggleRecentRoleStatus}
                    recentRoleCount={recentRoles.length}
                    statusFilterActive={recentStatusFilterActive}
                    visibleStatuses={visibleRecentRoleStatusSet}
                    workspaceId={workspace.workspaceId}
                  />
                ) : null}
              </div>

              <div className="mx-3 space-y-1">
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

        <div className="mx-3">
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
        </div>
      </aside>

      {navigationTriggerHidden || activePage === "role" ? null : (
        <header className="fixed inset-x-0 top-0 z-50 flex h-12 items-center bg-linear-to-b from-white/30 to-white/0 px-3 md:hidden">
          <MuteButton
            aria-label="메뉴 열기"
            className="border border-white/20 bg-white/10 backdrop-blur-xs hover:bg-white/20"
            onClick={handleOpenMobileNavigation}
            size="md"
            variant="transparent"
          >
            <Menu aria-hidden className="size-4.5" strokeWidth={1.7} />
          </MuteButton>
        </header>
      )}

      <Dialog
        open={navigationOpen}
        onOpenChange={handleMobileNavigationOpenChange}
      >
        <DialogContent
          className="!inset-y-0 !left-0 !right-auto !top-0 z-[60] flex h-svh w-[min(82vw,280px)] max-w-[280px] !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 border-r border-neutral-1000-a05 bg-bg-default p-0 shadow-[18px_0_48px_color-mix(in_srgb,var(--color-neutral-1000)_18%,transparent)] duration-300 data-[state=closed]:slide-out-to-left-full data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-full data-[state=open]:zoom-in-100 md:hidden"
          hideCloseButton
          overlayClassName="z-[59] bg-transparent backdrop-blur-none md:hidden"
        >
          <DialogTitle className="sr-only">Organization 메뉴</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-3">
              <WorkspaceAvatar workspace={workspace} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-primary">
                {workspace.companyName}
              </span>
              <MuteButton
                aria-label="메뉴 닫기"
                onClick={closeNavigation}
                size="md"
                variant="transparent"
              >
                <PanelLeftClose
                  aria-hidden
                  className="size-4.5"
                  strokeWidth={1.7}
                />
              </MuteButton>
            </div>
            {mobileOrganizationMenuOpen ? (
              <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
                <MuteButton
                  className="mb-2 h-9 w-full justify-start gap-2 px-2 text-[13px]"
                  onClick={() => setMobileOrganizationMenuOpen(false)}
                  size="md"
                  variant="transparent"
                >
                  <ArrowLeft className="size-4" strokeWidth={1.6} />
                  돌아가기
                </MuteButton>
                <nav aria-label="Organization 설정" className="space-y-1">
                  {organizationNav.map((item) => (
                    <Link
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md px-2 text-[14px] outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
                        item.active
                          ? "bg-bg-weak text-neutral-primary"
                          : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary"
                      )}
                      href={item.href}
                      key={item.label}
                      onClick={closeNavigation}
                    >
                      <item.icon className="size-4" strokeWidth={1.55} />
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <nav
                  aria-label="Organization"
                  className="shrink-0 space-y-1 px-2 py-2"
                >
                  {primaryNav.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.id === "team"
                        ? organizationMode
                        : activePage === item.id;
                    if (item.id === "team") {
                      return (
                        <MuteButton
                          aria-current={active ? "page" : undefined}
                          aria-expanded={mobileOrganizationMenuOpen}
                          className={cn(
                            "h-9 w-full justify-start gap-2 px-2 text-[14px]",
                            active
                              ? "bg-bg-weak text-neutral-primary"
                              : "text-neutral-muted"
                          )}
                          key={item.id}
                          onClick={() => setMobileOrganizationMenuOpen(true)}
                          size="md"
                          variant="transparent"
                        >
                          <Icon className="size-4" strokeWidth={1.55} />
                          <span>{item.label}</span>
                        </MuteButton>
                      );
                    }

                    return (
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-md px-2 text-[14px] outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
                          active
                            ? "bg-bg-weak text-neutral-primary"
                            : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary"
                        )}
                        href={navHref(item.id)}
                        key={item.id}
                        onClick={closeNavigation}
                      >
                        {item.id === "new-role" ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary-faded text-primary">
                            <Plus className="size-3.5" strokeWidth={1.8} />
                          </span>
                        ) : (
                          <Icon className="size-4" strokeWidth={1.55} />
                        )}
                        <span>{item.label}</span>
                        {item.id === "inbox" &&
                        pendingConnectionCount !== undefined ? (
                          <Badge
                            aria-label={`연결 대기 ${pendingConnectionCount}명`}
                            className="ml-auto min-w-5 bg-blue-500 px-1.5 tabular-nums text-white"
                            radius="full"
                            size="sm"
                          >
                            {pendingConnectionCount}
                          </Badge>
                        ) : null}
                      </Link>
                    );
                  })}
                </nav>

                {!compact ? (
                  <RecentRolesSection
                    activePage={activePage}
                    activeRoleId={activeRoleId}
                    filteredRoles={filteredRecentRoles}
                    mobile
                    onNavigate={closeNavigation}
                    onResetStatusFilter={resetRecentRoleStatusFilter}
                    onToggleStatus={toggleRecentRoleStatus}
                    recentRoleCount={recentRoles.length}
                    statusFilterActive={recentStatusFilterActive}
                    visibleStatuses={visibleRecentRoleStatusSet}
                    workspaceId={workspace.workspaceId}
                  />
                ) : null}
              </div>
            )}

            <div className="shrink-0 border-t border-neutral-1000-a05 px-1 py-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <MuteButton
                    aria-label="프로필 메뉴"
                    className="w-full justify-start"
                    size="md"
                    variant="transparent"
                  >
                    <UserAvatar member={currentUser} size="sm" />
                    <span className="ml-1 min-w-0 text-left">
                      <span className="block truncate text-[13px] font-medium text-neutral-primary">
                        {currentUser?.name || currentUser?.email || "User"}
                      </span>
                      {currentUser?.email ? (
                        <span className="block text-[11px] truncate font-light text-neutral-soft">
                          {currentUser.email}
                        </span>
                      ) : null}
                    </span>
                  </MuteButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[min(260px,calc(100vw-24px))]"
                  side="top"
                >
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
          </div>
        </DialogContent>
      </Dialog>
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
          "fixed inset-y-0 left-0 hidden border-r border-neutral-1000-a05 py-4 md:block ",
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
      <div className={compact ? "md:pl-[72px]" : "md:pl-[256px]"}>
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
