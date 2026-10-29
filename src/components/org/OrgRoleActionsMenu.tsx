import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { LoaderCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MuteButton } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgRole } from "@/lib/org/server";
import { normalizeOrgRoleStatus } from "@/lib/org/roleStatus";
import { useOrgRoleClosurePreview } from "@/hooks/org/useOrgRoleClosurePreview";

type RoleLifecycleAction = "delete" | "pause" | "resume" | "end";

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
  onEnd,
  onStart,
  pending,
  role,
}: {
  align?: "start" | "center" | "end";
  disabled?: boolean;
  triggerClassName?: string;
  onDelete: (role: OrgRole) => void;
  onEdit?: (role: OrgRole) => void;
  onPause: (role: OrgRole) => void;
  onResume: (role: OrgRole) => void;
  onEnd?: (role: OrgRole) => void;
  onStart?: (role: OrgRole) => void;
  pending?: boolean;
  role?: OrgRole | null;
}) {
  const { c } = useOrgLocale();
  const [lifecycleAction, setLifecycleAction] =
    useState<RoleLifecycleAction | null>(null);
  const closurePreview = useOrgRoleClosurePreview({
    enabled: lifecycleAction === "end",
    roleId: role?.roleId,
    workspaceId: role?.workspaceId,
  });
  const isDisabled = disabled || pending || !role;
  const buttonClassName = cn(
    "flex h-8 w-8 items-center justify-center rounded-sm border-0 bg-black/0 text-neutral-soft outline-none transition hover:bg-black/5 hover:text-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-black/0 disabled:hover:text-neutral-soft",
    triggerClassName
  );

  if (!role) {
    return (
      <button
        type="button"
        aria-label={c("Role actions unavailable", "Role actions unavailable")}
        disabled
        className={buttonClassName}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    );
  }

  const paused = isRolePaused(role.status);
  const status = normalizeOrgRoleStatus(role.status);
  const resumable = paused || status === "ended";

  const actionLabel =
    lifecycleAction === "delete"
      ? c("삭제", "Delete")
      : lifecycleAction === "end"
        ? c("채용 종료", "End hiring")
        : lifecycleAction === "pause"
          ? c("일시 중지", "Pause")
          : c("다시 시작", "Resume");

  const confirmLifecycleAction = () => {
    if (!lifecycleAction) return;
    if (lifecycleAction === "end" && !closurePreview.ready) return;
    const action = lifecycleAction;
    setLifecycleAction(null);
    if (action === "delete") onDelete(role);
    else if (action === "pause") onPause(role);
    else if (action === "end") onEnd?.(role);
    else onResume(role);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={c("{p0} 역할 작업", "{p0} role actions", {
              p0: role.name,
            })}
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
        <DropdownMenuContent
          align={align}
          side="bottom"
          className="z-[200] w-40"
        >
          {onEdit ? (
            <DropdownMenuItem
              variant="sm"
              disabled={isDisabled}
              onSelect={() => onEdit(role)}
            >
              {c("역할 수정", "Edit role")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="sm"
            disabled={isDisabled}
            onSelect={() =>
              status === "draft" && onStart
                ? onStart(role)
                : setLifecycleAction(resumable ? "resume" : "pause")
            }
          >
            {status === "draft" && onStart
              ? c("채용 시작하기", "Start hiring")
              : resumable
                ? c("다시 시작", "Resume")
                : c("일시 중지", "Pause")}
          </DropdownMenuItem>
          {onEnd && status !== "draft" && status !== "ended" ? (
            <DropdownMenuItem
              variant="sm"
              disabled={isDisabled}
              onSelect={() => setLifecycleAction("end")}
            >
              {c("채용 종료", "End hiring")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="sm"
            disabled={isDisabled}
            tone="danger"
            onSelect={() => setLifecycleAction("delete")}
          >
            {c("역할 삭제", "Delete role")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TalentCareerModal
        open={Boolean(lifecycleAction)}
        onClose={() => setLifecycleAction(null)}
        mobileBottomSheet
        title={lifecycleAction === "end"
          ? c("“{name}” 채용을 종료할까요?", 'End hiring for “{name}”?', { name: role.name })
          : c("역할 {action}", "{action} role", { action: actionLabel })}
        description={
          <>
            {lifecycleAction === "delete"
              ? c(
                  "“{p0}” 역할을 삭제합니다. 계속할까요?",
                  'Delete the role "{p0}"?',
                  { p0: role.name }
                )
              : lifecycleAction === "end"
                ? closurePreview.description
                : lifecycleAction === "pause"
                  ? c(
                      "“{p0}” 역할의 새 후보자 연결을 일시 중지할까요?",
                      'Pause new recommendations for "{p0}"?',
                      { p0: role.name }
                    )
                  : c(
                      "“{p0}” 역할의 후보자 연결을 다시 시작할까요?",
                      'Resume recommendations for "{p0}"?',
                      { p0: role.name }
                    )}
          </>
        }
        panelClassName="max-w-sm"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              onClick={() => setLifecycleAction(null)}
              size="md"
              type="button"
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={lifecycleAction === "end" && !closurePreview.ready}
              onClick={confirmLifecycleAction}
              size="md"
              type="button"
              variant={lifecycleAction === "delete" ? "warn" : "dark"}
            >
              {actionLabel}
            </MuteButton>
          </div>
        }
      >
        {lifecycleAction === "end" && closurePreview.isError ? (
          <MuteButton onClick={() => void closurePreview.refetch()} size="md">
            {c("다시 시도", "Try again")}
          </MuteButton>
        ) : null}
      </TalentCareerModal>
    </>
  );
}
