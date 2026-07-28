import {
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  Home,
  ListFilter,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ComponentType, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";
import type { OrgMember, OrgWorkspace } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";

const PRIMARY_NAV: Array<{
  icon: ComponentType<{ className?: string }>;
  id: OrgWorkspacePageId;
  label: string;
}> = [
  { icon: Home, id: "home", label: "Home" },
  { icon: BriefcaseBusiness, id: "jobs", label: "Jobs" },
  { icon: Users, id: "team", label: "Team" },
  { icon: Settings, id: "settings", label: "Settings" },
];
const INTERNAL_ALL_NAV = {
  icon: ListFilter,
  id: "all" as const,
  label: "All",
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

function NavLink({
  active,
  href,
  icon: Icon,
  internalOnly = false,
  label,
}: {
  active: boolean;
  href: string;
  icon: ComponentType<{ className?: string }>;
  internalOnly?: boolean;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative isolate flex h-9 items-center gap-2.5 overflow-hidden rounded-md px-3 text-[14px] font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        active
          ? "bg-neutral-100 text-black"
          : "text-neutral-muted hover:bg-neutral-100 hover:text-neutral-primary"
      )}
      href={href}
    >
      {internalOnly ? <InternalOnlyHatch className="opacity-70" /> : null}
      <Icon className="relative z-20 size-4 stroke-[1.75]" />
      <span className="relative z-20">{label}</span>
    </Link>
  );
}

export function OrgWorkspaceSidebar() {
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [signOutPending, setSignOutPending] = useState(false);
  const {
    currentUser,
    internalOpsAccess,
    page: activePage,
    workspace,
    workspaces,
  } = useOrgWorkspace();
  const canSwitchWorkspace = internalOpsAccess;
  const primaryNav = internalOpsAccess
    ? [INTERNAL_ALL_NAV, ...PRIMARY_NAV]
    : PRIMARY_NAV;
  const navHref = (page: OrgWorkspacePageId) =>
    buildOrgHref({ orgId: workspace.workspaceId, page });
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

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[256px] flex-col border-r border-neutral-1000-a05 px-4 py-3 lg:flex">
        <div className="mb-6">{workspaceControl}</div>
        <nav aria-label="Organization" className="space-y-1">
          {primaryNav.map((item) => (
            <NavLink
              key={item.id}
              active={activePage === item.id}
              href={navHref(item.id)}
              icon={item.icon}
              internalOnly={item.id === "all"}
              label={item.label}
            />
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <NavLink
            active={activePage === "help"}
            href={navHref("help")}
            icon={CircleHelp}
            label="Help"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label="프로필 메뉴"
                className="w-full justify-start"
                size="md"
                variant="transparent"
              >
                <UserAvatar member={currentUser} />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[12px] font-medium text-neutral-primary">
                    {currentUser?.name || currentUser?.email || "User"}
                  </span>
                  {currentUser?.email ? (
                    <span className="block truncate text-[11px] font-light text-neutral-soft">
                      {currentUser.email}
                    </span>
                  ) : null}
                </span>
              </MuteButton>
            </DropdownMenuTrigger>
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
          aria-label="Organization"
          className="flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-none"
        >
          {[
            ...primaryNav,
            { icon: CircleHelp, id: "help" as const, label: "Help" },
          ].map((item) => (
            <Link
              key={item.id}
              aria-current={activePage === item.id ? "page" : undefined}
              className={cn(
                "relative isolate shrink-0 overflow-hidden rounded-md px-3 py-1.5 text-[12px] font-normal",
                activePage === item.id
                  ? "bg-bg-weak text-neutral-primary"
                  : "text-neutral-muted"
              )}
              href={navHref(item.id)}
            >
              {item.id === "all" ? (
                <InternalOnlyHatch className="opacity-70" />
              ) : null}
              <span className="relative z-20">{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

export function OrgWorkspaceShellSkeleton({
  wide = false,
}: {
  wide?: boolean;
}) {
  return (
    <Page as="main" background="neutral">
      <aside className="fixed inset-y-0 left-0 hidden w-[256px] border-r border-neutral-1000-a05 p-4 lg:block">
        <Skeleton className="h-9 w-full" />
        <div className="mt-5 space-y-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-9 w-full" key={index} />
          ))}
        </div>
      </aside>
      <div className="lg:pl-[256px]">
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
