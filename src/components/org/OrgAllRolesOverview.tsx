import {
  BriefcaseBusiness,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Search,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { OrgRoleActionsMenu } from "@/components/org/OrgRoleActionsMenu";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  const connected = stages.find((stage) => stage.id === "connected");
  const customStages = stages.filter((stage) => stage.roleId === role.roleId);
  const finalOffer = stages.find((stage) => stage.id === "final_offer");
  const stopped = stages.find((stage) => stage.id === "process_stopped");

  return [pending, connected, ...customStages, finalOffer, stopped].filter(
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
        : stageId === "final_offer" || stageId === "connected"
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
      {stageId === "pending_connection" && count > 0 && (
        <div className="mt-1 text-[12px] font-medium leading-4 text-primary">
          결정이 필요합니다.
        </div>
      )}
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

function normalizeRoleStatus(status: string | null | undefined) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "open") return "active";
  if (normalized === "on_hold") return "paused";
  if (
    normalized === "closed" ||
    normalized === "expired" ||
    normalized === "inactive"
  ) {
    return "ended";
  }
  if (normalized === "pending") return "draft";
  return normalized || "none";
}

function getRoleStatusMeta(status: string | null | undefined) {
  const normalized = normalizeRoleStatus(status);

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
  if (normalized === "paused") {
    return {
      className: "bg-info-faded text-info",
      label: "중단",
    };
  }
  if (normalized === "ended") {
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
  if (normalized === "none") {
    return {
      className: "bg-bg-weak text-neutral-muted",
      label: "상태 없음",
    };
  }
  return {
    className: "bg-bg-weak text-neutral-muted",
    label: normalized,
  };
}

const ROLE_STATUS_FILTER_OPTIONS = [
  { label: "진행중", value: "active" },
  { label: "중단", value: "paused" },
] as const;

type RoleStatusFilterValue =
  (typeof ROLE_STATUS_FILTER_OPTIONS)[number]["value"];

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
  onDeleteRole,
  onEditRole,
  onPauseRole,
  onResumeRole,
  onRoleSelect,
  roleActionPending,
  roles,
}: {
  board?: OrgBoardResponse | null;
  error?: Error | null;
  isLoading?: boolean;
  onDeleteRole: (role: OrgRole) => void;
  onEditRole: (roleId: string) => void;
  onPauseRole: (role: OrgRole) => void;
  onResumeRole: (role: OrgRole) => void;
  onRoleSelect: (roleId: string) => void;
  roleActionPending?: boolean;
  roles: OrgRole[];
}) {
  const [roleStatusFilters, setRoleStatusFilters] = useState<
    RoleStatusFilterValue[]
  >([]);
  const [roleTitleQuery, setRoleTitleQuery] = useState("");
  const counts = buildCounts(board?.items ?? []);
  const totalByRole = new Map<string, number>();
  for (const item of board?.items ?? []) {
    totalByRole.set(item.roleId, (totalByRole.get(item.roleId) ?? 0) + 1);
  }
  const roleStatusCounts = useMemo(
    () =>
      ROLE_STATUS_FILTER_OPTIONS.reduce(
        (acc, option) => {
          acc[option.value] = roles.filter(
            (role) => normalizeRoleStatus(role.status) === option.value
          ).length;
          return acc;
        },
        {} as Record<RoleStatusFilterValue, number>
      ),
    [roles]
  );
  const selectedStatusOptions = ROLE_STATUS_FILTER_OPTIONS.filter((option) =>
    roleStatusFilters.includes(option.value)
  );
  const selectedStatusLabel =
    selectedStatusOptions.length === 0
      ? "Status 전체"
      : selectedStatusOptions.length === 1
        ? selectedStatusOptions[0].label
        : `${selectedStatusOptions[0].label} 외 ${
            selectedStatusOptions.length - 1
          }`;
  const toggleRoleStatusFilter = (
    value: RoleStatusFilterValue,
    checked: boolean
  ) => {
    setRoleStatusFilters((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((item) => item !== value);
    });
  };
  const filteredRoles = useMemo(() => {
    const normalizedTitleQuery = roleTitleQuery.trim().toLowerCase();
    return roles.filter((role) => {
      const roleStatus = normalizeRoleStatus(role.status);
      if (
        roleStatusFilters.length > 0 &&
        !roleStatusFilters.some(
          (selectedStatus) => selectedStatus === roleStatus
        )
      ) {
        return false;
      }
      if (!normalizedTitleQuery) return true;
      return role.name.toLowerCase().includes(normalizedTitleQuery);
    });
  }, [roleStatusFilters, roleTitleQuery, roles]);
  const hasActiveFilter =
    roleStatusFilters.length > 0 || roleTitleQuery.trim().length > 0;

  return (
    <div>
      <div className="rounded-md mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-soft" />
            <Input
              value={roleTitleQuery}
              onChange={(event) => setRoleTitleQuery(event.target.value)}
              placeholder="Role title 검색"
              className="h-9 pl-8 text-xs"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BareButton
                type="button"
                className={cx(
                  "inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
                  roleStatusFilters.length > 0
                    ? "border-primary/30 bg-primary-faded text-primary"
                    : "border-neutral-1000-a10 bg-bg-floating text-neutral-muted hover:border-neutral-400 hover:bg-bg-weak"
                )}
              >
                <span className="truncate">{selectedStatusLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </BareButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {ROLE_STATUS_FILTER_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={roleStatusFilters.includes(option.value)}
                  className="gap-2"
                  indicatorPosition="right"
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => {
                    toggleRoleStatusFilter(option.value, checked === true);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  <span className="text-[10px] text-neutral-soft">
                    {roleStatusCounts[option.value] ?? 0}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasActiveFilter ? (
            <BareButton
              type="button"
              onClick={() => {
                setRoleTitleQuery("");
                setRoleStatusFilters([]);
              }}
              className="h-8 rounded-md px-2.5 text-xs font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            >
              초기화
            </BareButton>
          ) : null}
        </div>
      </div>
      <section className="space-y-3 bg-bg-basement p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-primary">
            Roles
            <span className="ml-2 text-xs font-normal text-neutral-muted">
              {hasActiveFilter
                ? `${filteredRoles.length} / ${roles.length}`
                : roles.length}
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
            {filteredRoles.length === 0 ? (
              <div className="flex h-32 items-center justify-center border border-neutral-1000-a05 bg-bg-floating text-sm text-neutral-muted">
                조건에 맞는 Role이 없습니다.
              </div>
            ) : null}
            {filteredRoles.map((role) => {
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
                      <OrgRoleActionsMenu
                        role={role}
                        pending={roleActionPending}
                        onEdit={(selectedRole) =>
                          onEditRole(selectedRole.roleId)
                        }
                        onPause={onPauseRole}
                        onResume={onResumeRole}
                        onDelete={onDeleteRole}
                      />
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
    </div>
  );
}
