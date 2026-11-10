import {
  getRoleStageLabel,
  buildRoleStages,
  buildRoleOverviewCounts,
} from "@/lib/org/roleBoardSummary";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import {
  BriefcaseBusiness,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Search,
} from "lucide-react";
import { useRouter } from "next/router";
import { type ReactNode, useMemo, useState } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { opsTheme } from "@/components/ops/theme";
import { OrgRoleActionsMenu } from "@/components/org/OrgRoleActionsMenu";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { BareButton, MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useOrgJobsBoard, useOrgJobsRoleActions } from "@/hooks/org/useOrgJobs";
import { useOrgWorkspaceTodo } from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgBoardResponse, OrgRole, OrgStage, OrgStageId } from "@/lib/org/server";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import { cn } from "@/lib/utils";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import { humanizeOrgWorkMode } from "@/lib/org/pipelineStage";

/** One number of a role: a stage, or one of the lists before 파이프라인. */
type RoleCountId = OrgStageId | "company_intro" | "reviewing";

function StageCountCell({
  count,
  label,
  onClick,
  stageId,
}: {
  count: number;
  label: string;
  /** Opens the list; without it the number is all there is (Harper가 확인 중). */
  onClick?: () => void;
  stageId: RoleCountId;
}) {
  const { c } = useOrgLocale();
  const borderClassName =
    count > 0
      ? stageId === "process_stopped"
        ? "border-critical"
        : stageId === "accepted" ||
            stageId === "final_offer" ||
            stageId === "connected"
          ? "border-positive"
          : "border-primary"
      : "border-neutral-1000-a10";

  const Cell = onClick ? "button" : "div";
  return (
    <Cell
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "appearance-none bg-transparent text-left outline-none transition",
        onClick && "hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        // Two to a row below md, one row from md.
        "min-w-0 border-l-2 px-2.5 py-2.5 md:min-w-[136px] md:border-l-4 md:py-1 md:pl-2.5 md:pr-2",
        borderClassName
      )}
    >
      <div className="truncate text-[12px] leading-5 text-neutral-soft">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[18px] leading-6",
          count > 0 ? "text-neutral-primary" : "text-neutral-soft"
        )}
      >
        {count}
      </div>
      {(stageId === "pending_connection" || stageId === "company_intro") && count > 0 && (
        <div className="mt-1 text-[12px] font-medium leading-4 text-primary">
          {c("결정할 후보가 있어요", "Needs your decision")}
        </div>
      )}
    </Cell>
  );
}

function RoleMetaChip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-neutral-1000-a05 bg-bg-floating px-2.5 text-[12px] text-neutral-muted">
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
      label: getOrgRoleStatusPresentation(normalized).label,
    };
  }
  if (normalized === "active" || normalized === "open") {
    return {
      className: "bg-positive-faded text-positive",
      label: getOrgRoleStatusPresentation(normalized).label,
    };
  }
  if (normalized === "paused") {
    return {
      className: "bg-info-faded text-info",
      label: getOrgRoleStatusPresentation(normalized).label,
    };
  }
  if (normalized === "ended") {
    return {
      className: "bg-critical-faded text-critical",
      label: getOrgRoleStatusPresentation(normalized).label,
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
      className: "bg-neutral-100 text-neutral-800",
      label: getOrgRoleStatusPresentation(normalized).label,
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
  { label: getOrgRoleStatusPresentation("draft").label, value: "draft" },
  { label: getOrgRoleStatusPresentation("active").label, value: "active" },
  { label: getOrgRoleStatusPresentation("paused").label, value: "paused" },
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
  const sourceT = useOrgSourceT();
  const meta = getRoleStatusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium",
        meta.className,
        className
      )}
    >
      {sourceT(meta.label)}
    </span>
  );
}

export function OrgRolesOverview({
  board,
  embedded = false,
  formatDate,
  canManageCandidates = false,
  isLoading,
  onDeleteRole,
  onOpenList,
  onOpenRole,
  onPauseRole,
  onResumeRole,
  renderRoleControl,
  reviewingByRole,
  roleActionPending = false,
  roles,
}: {
  board: OrgBoardResponse | null | undefined;
  /** Inside Home's right column: no page box of its own. */
  embedded?: boolean;
  formatDate?: (value: string) => string;
  canManageCandidates?: boolean;
  isLoading: boolean;
  onDeleteRole?: (role: OrgRole) => void;
  onOpenRole: (role: OrgRole, view?: "pipeline" | "role") => void;
  /** Opens one of the role's two decision lists (its 후보). */
  onOpenList?: (role: OrgRole, list: "pending_connection" | "company_intro") => void;
  onPauseRole?: (role: OrgRole) => void;
  onResumeRole?: (role: OrgRole) => void;
  renderRoleControl?: (role: OrgRole) => ReactNode;
  /** People Harper is checking, per role: a number only (no list). */
  reviewingByRole?: ReadonlyMap<string, number>;
  roleActionPending?: boolean;
  roles: OrgRole[];
}) {
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const [roleStatusFilters, setRoleStatusFilters] = useState<
    RoleStatusFilterValue[]
  >([]);
  const [roleTitleQuery, setRoleTitleQuery] = useState("");
  const counts = buildRoleOverviewCounts(board?.items ?? []);
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
      ? c("Status 전체", "All statuses")
      : selectedStatusOptions.length === 1
        ? sourceT(selectedStatusOptions[0].label)
        : c("{p0} 외 {p1}", "{p0} and {p1} more", {
            p0: sourceT(selectedStatusOptions[0].label),
            p1: selectedStatusOptions.length - 1,
          });
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
  const canManageRole =
    canManageCandidates && Boolean(onDeleteRole && onPauseRole && onResumeRole);
  // Before 파이프라인: 연결 기다리는 · 연결 요청할 (the inbox rule, each opening
  // its list on the role) and Harper가 확인 중 (a number for everyone; the
  // internal accepted stage is not repeated below).
  const decisionCells = (role: OrgRole) => [
    {
      id: "pending_connection" as const,
      count: counts.get(`${role.roleId}:pending_connection`) ?? 0,
      label: ct(c, COMPANY_TERMS.stage.pending_connection),
      open: onOpenList ? () => onOpenList(role, "pending_connection") : undefined,
    },
    {
      id: "company_intro" as const,
      count: counts.get(`${role.roleId}:company_intro`) ?? 0,
      label: ct(c, COMPANY_TERMS.stage.company_intro),
      open: onOpenList ? () => onOpenList(role, "company_intro") : undefined,
    },
    {
      id: "reviewing" as const,
      count: reviewingByRole?.get(role.roleId) ?? 0,
      label: ct(c, COMPANY_TERMS.stage.accepted),
      open: undefined,
    },
  ];
  const pipelineStages = (stages: OrgStage[]) =>
    stages.filter((stage) => stage.id !== "accepted" && stage.id !== "pending_connection");

  return (
    <div>
      {/* <div className="mb-5 rounded-md">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-soft" />
            <Input
              value={roleTitleQuery}
              onChange={(event) => setRoleTitleQuery(event.target.value)}
              placeholder="Role title 검색"
              className="h-10 pl-8 text-[13px]"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BareButton
                type="button"
                className={cn(
                  "inline-flex h-10 min-w-[152px] items-center justify-between gap-2 rounded-md border px-3 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
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
                    {sourceT(option.label)}
                  </span>
                  <span className="text-[11px] text-neutral-soft">
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
              className="h-10 rounded-md px-3 text-[13px] font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            >
              초기화
            </BareButton>
          ) : null}
        </div>
      </div> */}
      <section className={cn("space-y-3", !embedded && "bg-bg-basement p-4")}>
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-medium text-neutral-primary">
            {c("역할", "Roles")}
            <span className="ml-2 text-[12px] font-normal text-neutral-muted">
              {hasActiveFilter
                ? `${filteredRoles.length} / ${roles.length}`
                : roles.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-[13px] text-neutral-muted">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            {c("불러오는 중", "Loading")}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRoles.length === 0 ? (
              <div className="flex h-32 items-center justify-center border border-neutral-1000-a05 bg-bg-floating text-[13px] text-neutral-muted">
                {c("아직 채용중인 역할이 없습니다.", "No hiring roles yet.")}
              </div>
            ) : null}
            {filteredRoles.map((role) => {
              const roleStages = buildRoleStages(board, role);
              const totalCount = totalByRole.get(role.roleId) ?? 0;
              const roleControl = renderRoleControl?.(role);
              const showRoleActions =
                canManageRole && normalizeRoleStatus(role.status) !== "draft";
              return (
                <article
                  key={role.roleId}
                  className="overflow-hidden border border-neutral-1000-a05 bg-bg-floating"
                >
                  <div className="flex flex-col gap-2 border-b border-neutral-1000-a05 px-3.5 py-3.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenRole(role)}
                          className="min-w-0 max-w-full truncate text-left text-[14px] font-medium text-neutral-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                        >
                          {role.name}
                        </button>
                      </div>
                      {roleControl || showRoleActions ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {roleControl}
                          {showRoleActions ? (
                            <OrgRoleActionsMenu
                              role={role}
                              pending={roleActionPending}
                              onEdit={(selectedRole) =>
                                onOpenRole(selectedRole)
                              }
                              onPause={onPauseRole!}
                              onResume={onResumeRole!}
                              onDelete={onDeleteRole!}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-1.5">
                      <RoleMetaChip>
                        {c("{date} 수정", "Updated {date}", {
                          date: formatDate
                            ? formatDate(role.updatedAt)
                            : formatKstRelativeDate(role.updatedAt, {
                                maxRelativeDays: 365,
                                locale,
                              }),
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
                          {sourceT(humanizeOrgWorkMode(role.workMode))}
                        </RoleMetaChip>
                      ) : null}
                      <RoleMetaChip>
                        {c(
                          "후보 {count}명",
                          totalCount === 1
                            ? "{count} candidate"
                            : "{count} candidates",
                          {
                            count: totalCount,
                          }
                        )}
                      </RoleMetaChip>
                      <RoleStatusBadge status={role.status} />
                      {normalizeRoleStatus(role.status) === "draft" && (
                        <MuteButton
                          onClick={() => onOpenRole(role)}
                          size="md"
                          variant="dark"
                        >
                          {c("이어서 작성", "Continue")}
                        </MuteButton>
                      )}
                    </div>
                  </div>

                  {normalizeRoleStatus(role.status) !== "draft" ? (
                    // One row of numbers (Home's 역할 현황 merged in): the two
                    // decision lists and Harper's checking first, each list
                    // opening on the role; then 파이프라인's stages.
                    <div className="flex flex-col md:flex-row md:overflow-x-auto">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-b border-neutral-1000-a05 px-3 py-2.5 md:flex md:shrink-0 md:items-center md:gap-4 md:border-b-0 md:border-r md:py-3">
                        {decisionCells(role).map(({ id, count, label, open }) => (
                          <div className="min-w-0" key={id}>
                            <StageCountCell
                              count={count}
                              label={label}
                              onClick={open}
                              stageId={id}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 px-3 py-2.5 md:flex md:min-w-max md:flex-1 md:items-center md:gap-4 md:py-3">
                        <div className="mb-1.5 text-[12px] text-neutral-muted md:mb-0 md:w-16 md:shrink-0">
                          {ct(c, COMPANY_TERMS.tab.pipeline)}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 md:flex md:items-center md:gap-4">
                          {pipelineStages(roleStages).map((stage) => {
                            const cell = (
                              <StageCountCell
                                count={
                                  counts.get(`${role.roleId}:${stage.id}`) ?? 0
                                }
                                label={sourceT(getRoleStageLabel(stage, role))}
                                onClick={() => onOpenRole(role, "pipeline")}
                                stageId={stage.id}
                              />
                            );
                            return stage.id === "archived" ? (
                              <InternalOnlySurface
                                className="min-w-0"
                                key={stage.id}
                                showLabel={false}
                              >
                                {cell}
                              </InternalOnlySurface>
                            ) : (
                              <div className="min-w-0" key={stage.id}>
                                {cell}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Home's 역할: every role with its numbers, in one place (the former 역할 page
 * and Home's 역할 현황 together). `roleId` narrows it to one role, as Home's
 * role filter does.
 */
export function OrgAllRolesOverview({
  embedded = false,
  roleId = null,
}: {
  embedded?: boolean;
  roleId?: string | null;
} = {}) {
  const router = useRouter();
  const { board, boardQuery } = useOrgJobsBoard();
  const { deleteRole, pauseRole, resumeRole, roleActionPending } =
    useOrgJobsRoleActions();
  const { permissions, roles: allRoles, workspace } = useOrgWorkspace();
  const roles = useMemo(
    () => (roleId ? allRoles.filter((role) => role.roleId === roleId) : allRoles),
    [allRoles, roleId]
  );
  // Harper가 확인 중 is counted with the To-do (the board does not show those people).
  const todo = useOrgWorkspaceTodo({ workspaceId: workspace.workspaceId });
  const reviewingByRole = useMemo(
    () => new Map((todo.data?.roles ?? []).map((role) => [role.roleId, role.counts.reviewing])),
    [todo.data?.roles]
  );
  const openList = (role: OrgRole, list: "pending_connection" | "company_intro") =>
    void router.push(
      buildOrgHref({
        orgId: workspace.workspaceId,
        page: "role",
        roleId: role.roleId,
        tab: "inbox",
        inboxStage: list,
      })
    );

  const openRole = (role: OrgRole, view: "pipeline" | "role" = "role") => {
    if (normalizeRoleStatus(role.status) === "draft") {
      void router.push(
        buildOrgHref({
          orgId: workspace.workspaceId,
          page: "role",
          roleId: role.roleId,
        })
      );
      return;
    }
    void router.push(
      buildOrgHref({
        orgId: workspace.workspaceId,
        page: "role",
        roleId: role.roleId,
        tab: view === "pipeline" ? "pipeline" : undefined,
        view: view === "pipeline" ? "pipeline" : undefined,
      })
    );
  };

  return (
    <OrgRolesOverview
      board={board}
      embedded={embedded}
      canManageCandidates={permissions.canManageCandidates}
      isLoading={boardQuery.isLoading}
      onDeleteRole={deleteRole}
      onOpenList={openList}
      onOpenRole={openRole}
      onPauseRole={pauseRole}
      onResumeRole={resumeRole}
      reviewingByRole={reviewingByRole}
      roleActionPending={roleActionPending}
      roles={roles}
    />
  );
}
