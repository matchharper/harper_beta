import { AlignJustify, ChevronDown } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { MuteButton } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

function getRoleDotClassName(status: string | null) {
  const normalized = normalizeOrgRoleStatus(status);
  if (normalized === "ended") return "bg-critical";
  if (normalized === "paused") return "bg-info";
  if (normalized === "top_priority") return "bg-primary";
  return "bg-positive";
}

export function OrgRolePicker() {
  const { activeRole, activeRoleId, changeRole } = useOrgJobsNavigation();
  const { roles } = useOrgWorkspace();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
        {roles.map((role) => (
          <DropdownMenuItem
            key={role.roleId}
            onSelect={() => selectRole(role.roleId)}
            selected={activeRoleId === role.roleId}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                getRoleDotClassName(role.status)
              )}
            />
            <span className="min-w-0 flex-1 truncate">{role.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
