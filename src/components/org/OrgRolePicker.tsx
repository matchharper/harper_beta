import { AlignJustify, ChevronDown } from "lucide-react";
import { useRouter } from "next/router";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MuteButton } from "@/components/ui/button";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { normalizeOrgRoleStatus } from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";

function getRoleStatusOrder(status: string | null) {
  const rawStatus = String(status ?? "")
    .trim()
    .toLowerCase();
  if (rawStatus === "stopped") return 2;

  const normalized = normalizeOrgRoleStatus(rawStatus);
  if (normalized === "active" || normalized === "top_priority") return 0;
  if (normalized === "paused") return 1;
  if (normalized === "ended") return 2;
  return 3;
}

export function OrgRolePicker() {
  const router = useRouter();
  const { activeRole, activeRoleId, changeRole } = useOrgJobsNavigation();
  const { roles, workspace } = useOrgWorkspace();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const orderedRoles = useMemo(
    () =>
      roles
        .map((role, originalIndex) => ({ originalIndex, role }))
        .sort(
          (left, right) =>
            getRoleStatusOrder(left.role.status) -
              getRoleStatusOrder(right.role.status) ||
            left.originalIndex - right.originalIndex
        )
        .map(({ role }) => role),
    [roles]
  );

  const cancelClose = () => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 180);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const nextTarget = event.relatedTarget as Node | null;
    if (
      nextTarget &&
      (triggerRef.current?.contains(nextTarget) ||
        contentRef.current?.contains(nextTarget))
    ) {
      return;
    }
    scheduleClose();
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  const selectRole = (roleId: string) => {
    setOpen(false);
    const role = roles.find((item) => item.roleId === roleId);
    if (role && normalizeOrgRoleStatus(role.status) === "draft") {
      void router.push(
        buildOrgHref({
          orgId: workspace.workspaceId,
          page: "new-role",
          roleId,
        })
      );
      return;
    }
    if (roleId !== activeRoleId) changeRole(roleId);
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <div onPointerEnter={cancelClose} onPointerLeave={handlePointerLeave}>
        <DropdownMenuTrigger asChild>
          <MuteButton
            ref={triggerRef}
            aria-label="Role 선택"
            className="-ml-2 w-fit min-w-0 max-w-[calc(100vw-40px)] justify-start text-[20px] text-neutral-primary"
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setOpen(true);
            }}
            size="lg"
            variant="transparent"
          >
            <AlignJustify className="size-5" />
            <span className="max-w-[min(640px,calc(100vw-132px))] truncate">
              {activeRoleId === "all" ? "All roles" : activeRole?.name}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-neutral-soft transition-transform",
                open && "rotate-180 text-neutral-muted"
              )}
            />
          </MuteButton>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        ref={contentRef}
        align="start"
        className="max-h-[min(70vh,520px)] w-[min(420px,calc(100vw-32px))]"
        onPointerEnter={cancelClose}
        onPointerLeave={handlePointerLeave}
        sideOffset={2}
      >
        <DropdownMenuItem
          onSelect={() => selectRole("all")}
          selected={activeRoleId === "all"}
        >
          <AlignJustify className="size-4 text-neutral-muted" />
          <span className="min-w-0 flex-1 truncate">All</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal uppercase tracking-[0.08em] text-neutral-soft">
          Roles
        </DropdownMenuLabel>
        {orderedRoles.map((role) => (
          <DropdownMenuItem
            key={role.roleId}
            onSelect={() => selectRole(role.roleId)}
            selected={activeRoleId === role.roleId}
          >
            <OrgRoleStatusDot status={role.status} />
            <span className="min-w-0 flex-1 truncate">{role.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
