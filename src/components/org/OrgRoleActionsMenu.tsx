import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { LoaderCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgRole } from "@/lib/org/server";

type RoleLifecycleAction = "delete" | "pause" | "resume";

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
  const t = useOrgT();
  const [lifecycleAction, setLifecycleAction] =
    useState<RoleLifecycleAction | null>(null);
  const isDisabled = disabled || pending || !role;
  const buttonClassName = cn(
    "flex h-8 w-8 items-center justify-center rounded-sm border-0 bg-black/0 text-neutral-soft outline-none transition hover:bg-black/5 hover:text-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-black/0 disabled:hover:text-neutral-soft",
    triggerClassName
  );

  if (!role) {
    return (
      <button
        type="button"
        aria-label={t("OrgRoleActionsMenu.44fb80c9", "Role actions unavailable")}
        disabled
        className={buttonClassName}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    );
  }

  const paused = isRolePaused(role.status);

  const actionLabel =
    lifecycleAction === "delete"
      ? t("OrgRoleActionsMenu.afe7c956", "삭제")
      : lifecycleAction === "pause"
        ? t("OrgRoleActionsMenu.3daa9fe3", "일시 중지")
        : t("OrgRoleActionsMenu.deabb863", "다시 시작");

  const confirmLifecycleAction = () => {
    if (!lifecycleAction) return;
    const action = lifecycleAction;
    setLifecycleAction(null);
    if (action === "delete") onDelete(role);
    else if (action === "pause") onPause(role);
    else onResume(role);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("OrgRoleActionsMenu.31f058fc", "{p0} 역할 작업", { p0: role.name })}
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
            {t("OrgRoleActionsMenu.9f7830df", "역할 수정")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="sm"
            disabled={isDisabled}
            onSelect={() => setLifecycleAction(paused ? "resume" : "pause")}
          >
            {paused
              ? t("OrgRoleActionsMenu.deabb863", "다시 시작")
              : t("OrgRoleActionsMenu.3daa9fe3", "일시 중지")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="sm"
            disabled={isDisabled}
            tone="danger"
            onSelect={() => setLifecycleAction("delete")}
          >
            {t("OrgRoleActionsMenu.71e516b3", "역할 삭제")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={Boolean(lifecycleAction)}
        onOpenChange={(open) => !open && setLifecycleAction(null)}
      >
        <DialogContent className="max-w-sm gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">
              {t("OrgRoleActionsMenu.98238b00", "역할")}
              {actionLabel}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {lifecycleAction === "delete"
                ? t("OrgRoleActionsMenu.881904c4", "“{p0}” 역할을 삭제합니다. 계속할까요?", { p0: role.name })
                : lifecycleAction === "pause"
                  ? t("OrgRoleActionsMenu.f0433675", "“{p0}” 역할의 새 후보자 연결을 일시 중지할까요?", { p0: role.name })
                  : t("OrgRoleActionsMenu.11685c0d", "“{p0}” 역할의 후보자 연결을 다시 시작할까요?", { p0: role.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              onClick={() => setLifecycleAction(null)}
              size="md"
              type="button"
            >
              {t("OrgRoleActionsMenu.3c93b478", "취소")}
            </MuteButton>
            <MuteButton
              onClick={confirmLifecycleAction}
              size="md"
              type="button"
              variant={lifecycleAction === "delete" ? "warn" : "dark"}
            >
              {actionLabel}
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
