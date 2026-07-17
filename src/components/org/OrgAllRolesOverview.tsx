import { BriefcaseBusiness, LoaderCircle, MapPin, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { Button } from "@/components/ui/button";
import type {
  OrgBoardItem,
  OrgBoardResponse,
  OrgRole,
  OrgStage,
  OrgStageId,
} from "@/lib/org/server";

function getRoleStageLabel(stage: OrgStage, role: OrgRole) {
  const prefix = `${role.name} · `;
  return stage.label.startsWith(prefix)
    ? stage.label.slice(prefix.length)
    : stage.label;
}

function buildRoleStages(
  board: OrgBoardResponse | null | undefined,
  role: OrgRole
) {
  const stages = board?.stages ?? [];
  const pending = stages.find((stage) => stage.id === "pending_connection");
  const customStages = stages.filter((stage) => stage.roleId === role.roleId);
  const finalOffer = stages.find((stage) => stage.id === "final_offer");
  const stopped = stages.find((stage) => stage.id === "process_stopped");

  return [pending, ...customStages, finalOffer, stopped].filter(
    (stage): stage is OrgStage => Boolean(stage)
  );
}

function buildCounts(items: OrgBoardItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.roleId}:${item.stage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function StageCountCell({
  count,
  label,
  onClick,
  stageId,
}: {
  count: number;
  label: string;
  onClick: () => void;
  stageId: OrgStageId;
}) {
  const borderClassName =
    count > 0
      ? stageId === "process_stopped"
        ? "border-critical"
        : stageId === "final_offer"
          ? "border-positive"
          : "border-primary"
      : "border-neutral-1000-a10";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "min-w-[132px] appearance-none border-l-4 bg-transparent py-1 pl-2.5 pr-2 text-left outline-none transition hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        borderClassName
      )}
    >
      <div className="truncate text-[11px] leading-4 text-neutral-soft">
        {label}
      </div>
      <div
        className={cx(
          "mt-1 text-lg leading-6",
          count > 0 ? "text-neutral-primary" : "text-neutral-soft"
        )}
      >
        {count}
      </div>
    </button>
  );
}

function RoleMetaChip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-neutral-1000-a05 bg-bg-floating px-2 text-[11px] text-neutral-muted">
      {children}
    </span>
  );
}

function getRoleStatusMeta(status: string | null | undefined) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "top_priority") {
    return {
      className: "bg-primary-faded text-primary",
      label: "최우선",
    };
  }
  if (normalized === "active" || normalized === "open") {
    return {
      className: "bg-positive-faded text-positive",
      label: "진행중",
    };
  }
  if (normalized === "paused" || normalized === "on_hold") {
    return {
      className: "bg-info-faded text-info",
      label: "중단",
    };
  }
  if (
    normalized === "ended" ||
    normalized === "closed" ||
    normalized === "expired" ||
    normalized === "inactive"
  ) {
    return {
      className: "bg-critical-faded text-critical",
      label: "종료",
    };
  }
  if (normalized === "deleted") {
    return {
      className: "bg-critical-faded text-critical",
      label: "삭제",
    };
  }
  if (normalized === "archived") {
    return {
      className: "bg-bg-weak text-neutral-muted",
      label: "보관",
    };
  }
  if (normalized === "draft" || normalized === "pending") {
    return {
      className: "bg-info-faded text-info",
      label: "준비중",
    };
  }
  return {
    className: "bg-bg-weak text-neutral-muted",
    label: normalized || "상태 없음",
  };
}

function RoleStatusBadge({
  className,
  status,
}: {
  className?: string;
  status: string | null | undefined;
}) {
  const meta = getRoleStatusMeta(status);
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-medium",
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function OrgAllRolesOverview({
  board,
  error,
  isLoading,
  onEditRole,
  onRoleSelect,
  roles,
}: {
  board?: OrgBoardResponse | null;
  error?: Error | null;
  isLoading?: boolean;
  onEditRole: (roleId: string) => void;
  onRoleSelect: (roleId: string) => void;
  roles: OrgRole[];
}) {
  const counts = buildCounts(board?.items ?? []);
  const totalByRole = new Map<string, number>();
  for (const item of board?.items ?? []) {
    totalByRole.set(item.roleId, (totalByRole.get(item.roleId) ?? 0) + 1);
  }

  return (
    <section className="space-y-2 bg-bg-basement p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-neutral-primary">
          Roles
          <span className="ml-2 text-xs font-normal text-neutral-muted">
            {roles.length}
          </span>
        </div>
      </div>

      {error ? (
        <div className={opsTheme.errorNotice}>{error.message}</div>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-sm text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const roleStages = buildRoleStages(board, role);
            const totalCount = totalByRole.get(role.roleId) ?? 0;
            return (
              <article
                key={role.roleId}
                className="overflow-hidden border border-neutral-1000-a05 bg-bg-floating"
              >
                <div className="flex flex-col gap-2 border-b border-neutral-1000-a05 px-3 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRoleSelect(role.roleId)}
                        className="min-w-0 max-w-full truncate text-left text-base font-semibold text-neutral-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                      >
                        {role.name}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => onEditRole(role.roleId)}
                      className="shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-1.5">
                    <RoleMetaChip>
                      Open{" "}
                      {formatKstRelativeDate(role.updatedAt, {
                        maxRelativeDays: 365,
                      })}
                    </RoleMetaChip>
                    {role.locationText ? (
                      <RoleMetaChip>
                        <MapPin className="h-3 w-3" />
                        {role.locationText}
                      </RoleMetaChip>
                    ) : null}
                    {role.workMode ? (
                      <RoleMetaChip>
                        <BriefcaseBusiness className="h-3 w-3" />
                        {role.workMode}
                      </RoleMetaChip>
                    ) : null}
                    <RoleMetaChip>{totalCount}명</RoleMetaChip>
                    <RoleStatusBadge status={role.status} />
                  </div>
                </div>

                <div className="flex min-h-[64px] overflow-x-auto">
                  <div className="flex w-[112px] shrink-0 flex-col justify-center gap-1 border-r border-neutral-1000-a05 px-3 text-xs text-neutral-muted">
                    <div className="flex justify-between gap-2">
                      <span>총계</span>
                      <span className="font-medium text-neutral-primary">
                        {totalCount}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>중단</span>
                      <span className="font-medium text-neutral-primary">
                        {counts.get(`${role.roleId}:process_stopped`) ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-max flex-1 items-center gap-4 px-3 py-3">
                    {roleStages.map((stage) => (
                      <StageCountCell
                        key={stage.id}
                        count={counts.get(`${role.roleId}:${stage.id}`) ?? 0}
                        label={getRoleStageLabel(stage, role)}
                        onClick={() => onRoleSelect(role.roleId)}
                        stageId={stage.id}
                      />
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
