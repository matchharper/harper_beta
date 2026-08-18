import type { FormEvent, HTMLAttributes, ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReviewPipelineColumnShellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  isDropTarget?: boolean;
  canDrop?: boolean;
  tone?: "default" | "accepted" | "rejected";
};

export function ReviewPipelineColumnShell({
  canDrop = false,
  children,
  className,
  collapsed = false,
  isDropTarget = false,
  tone = "default",
  ...sectionProps
}: ReviewPipelineColumnShellProps) {
  return (
    <section
      {...sectionProps}
      className={cx(
        "min-h-[560px] shrink-0 border-y border-l border-neutral-1000-a10 transition-colors",
        collapsed ? "w-14" : "w-[300px]",
        isDropTarget
          ? "bg-primary-faded/55 ring-2 ring-inset ring-primary/55"
          : canDrop
            ? "bg-primary-faded/20"
            : tone === "accepted"
              ? "bg-positive-faded"
              : tone === "rejected"
                ? "bg-critical-faded/40"
                : "bg-bg-default",
        className
      )}
    >
      {children}
    </section>
  );
}

export function ReviewPipelineColumnHeader({
  className,
  collapsed = false,
  compact = false,
  count,
  label,
  onAdd,
  onCollapse,
  onDelete,
  onEdit,
  onExpand,
  pending = false,
}: {
  className?: string;
  collapsed?: boolean;
  compact?: boolean;
  count: number;
  label: string;
  onAdd?: () => void;
  onCollapse?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onExpand?: () => void;
  pending?: boolean;
}) {
  return (
    <div
      className={cn(
        compact
          ? "border-0 bg-transparent px-2.5 py-2"
          : "border-b border-neutral-1000-a10 bg-bg-floating px-3 py-2.5",
        className
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          {onExpand ? (
            <BareButton
              type="button"
              onClick={onExpand}
              aria-label={`${label} 펼치기`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </BareButton>
          ) : null}
          <div className="max-h-[180px] truncate text-[11px] font-semibold text-neutral-primary [writing-mode:vertical-rl]">
            {label}
          </div>
          <span className="rounded-sm bg-bg-default px-1.5 py-0.5 text-[10px] text-neutral-muted">
            {count}
          </span>
        </div>
      ) : (
        <div className={cn("flex items-center gap-2 justify-between h-8")}>
          <div
            className={cn(
              "min-w-0 truncate text-[13px] text-neutral-primary",
              compact ? "font-normal" : "font-semibold"
            )}
          >
            {label}
            <span
              className={cn(
                compact
                  ? "text-[13px] ml-2 font-normal text-neutral-soft"
                  : "rounded-sm bg-bg-default px-1.5 py-0.5 text-[13px] text-neutral-muted"
              )}
            >
              {count}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-row">
            {onEdit ? (
              <BareButton
                type="button"
                onClick={onEdit}
                disabled={pending}
                aria-label={`${label} 이름 수정`}
                title="이름 수정"
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
              </BareButton>
            ) : null}
            {onDelete ? (
              <BareButton
                type="button"
                onClick={onDelete}
                disabled={pending}
                aria-label={`${label} 삭제`}
                title="삭제"
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </BareButton>
            ) : null}
            {onCollapse ? (
              <BareButton
                type="button"
                onClick={onCollapse}
                aria-label={`${label} 접기`}
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </BareButton>
            ) : null}
            {onAdd ? (
              <BareButton
                type="button"
                onClick={onAdd}
                aria-label={`${label} 뒤에 프로세스 단계 추가`}
                title="프로세스 단계 추가"
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-soft transition hover:bg-primary-faded hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
              </BareButton>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewPipelineDropTargetHint({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-primary/45 bg-primary-faded px-3 py-2 text-center text-xs font-medium text-primary">
      드롭하면 {label}로 이동
    </div>
  );
}

export function ReviewPipelineEmptyState({
  className,
}: {
  className?: string;
} = {}) {
  return (
    <div
      className={cn(
        "border border-dashed border-neutral-1000-a10 bg-bg-floating px-3 py-8 text-center text-xs text-neutral-soft",
        className
      )}
    >
      비어 있음
    </div>
  );
}

export function ReviewPipelineCardPendingState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-bg-floating/82 backdrop-blur-[1px]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-1000-a05 bg-bg-default px-2.5 py-1 text-[11px] font-medium text-neutral-muted shadow-sm">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        이동 저장 중
      </span>
    </div>
  );
}

export function ReviewPipelineColumnAddRail({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <div className="relative min-h-[560px] w-8 shrink-0 border-y border-neutral-1000-a10 bg-bg-default">
      <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-neutral-1000-a10" />
      <BareButton
        type="button"
        onClick={onClick}
        title="프로세스 추가"
        className="absolute left-1/2 top-2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-neutral-1000-a10 bg-bg-floating text-neutral-muted shadow-sm transition hover:border-primary/40 hover:bg-primary-faded hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
      </BareButton>
    </div>
  );
}

export function ReviewPipelineStageDialog({
  actionError,
  error,
  label,
  mode,
  onClose,
  onLabelChange,
  onSubmit,
  open,
  pending = false,
}: {
  actionError?: string;
  error?: string;
  label: string;
  mode: "create" | "edit";
  onClose: () => void;
  onLabelChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-md rounded-lg" hideCloseButton>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "프로세스명 수정" : "프로세스 추가"}
            </DialogTitle>
            <DialogDescription>
              {mode === "edit"
                ? "Pipeline 프로세스명을 수정합니다."
                : "연결 대기와 최종 오퍼 사이에 새 단계를 추가합니다."}
            </DialogDescription>
          </DialogHeader>
          {actionError ? (
            <div className={cx(opsTheme.errorNotice, "mt-4")}>
              {actionError}
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            <Input
              autoFocus
              value={label}
              onChange={(event) => onLabelChange(event.target.value)}
              maxLength={40}
              placeholder="예: 1차 인터뷰"
            />
            {error ? (
              <div className="text-xs text-critical">{error}</div>
            ) : null}
          </div>
          <DialogFooter className="mt-5">
            <MuteButton
              onClick={onClose}
              disabled={pending}
              size="md"
              variant="transparent"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={!label.trim() || pending}
              size="md"
              variant="dark"
              type="submit"
            >
              {pending ? "저장 중..." : mode === "edit" ? "수정" : "추가"}
            </MuteButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
