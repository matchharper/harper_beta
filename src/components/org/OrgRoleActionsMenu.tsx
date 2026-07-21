import {
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgRole } from "@/lib/org/server";

function isRolePaused(status: string | null | undefined) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return normalized === "paused" || normalized === "on_hold";
}

export function OrgRoleActionsMenu({
  align = "end",
  disabled,
  triggerClassName,
  onDelete,
  onEdit,
  onPause,
  onResume,
  pending,
  role,
}: {
  align?: "start" | "center" | "end";
  disabled?: boolean;
  triggerClassName?: string;
  onDelete: (role: OrgRole) => void;
  onEdit: (role: OrgRole) => void;
  onPause: (role: OrgRole) => void;
  onResume: (role: OrgRole) => void;
  pending?: boolean;
  role?: OrgRole | null;
}) {
  const isDisabled = disabled || pending || !role;
  const buttonClassName = cn(
    "flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-black/0 text-neutral-soft outline-none transition hover:bg-black/5 hover:text-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-black/0 disabled:hover:text-neutral-soft",
    triggerClassName
  );

  if (!role) {
    return (
      <button
        type="button"
        aria-label="Role actions unavailable"
        disabled
        className={buttonClassName}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    );
  }

  const paused = isRolePaused(role.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${role.name} role actions`}
          disabled={isDisabled}
          className={buttonClassName}
        >
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40">
        <DropdownMenuItem
          variant="sm"
          disabled={isDisabled}
          onSelect={() => onEdit(role)}
        >
          <Pencil className="h-4 w-4" />
          역할 수정
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="sm"
          disabled={isDisabled}
          onSelect={() => (paused ? onResume(role) : onPause(role))}
        >
          {paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          {paused ? "Resume" : "Pause"}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="sm"
          disabled={isDisabled}
          tone="danger"
          onSelect={() => onDelete(role)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
