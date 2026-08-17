import { useRouter } from "next/router";
import { useMemo } from "react";
import { OrgCandidateCard } from "@/components/org/OrgCandidateCard";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgBoard, useOrgBoardProfileLabels } from "@/hooks/org/useOrg";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgBoardItem } from "@/lib/org/server";
import { cn } from "@/lib/utils";

export const ORG_PENDING_CONNECTION_PAUSE_THRESHOLD = 5;

function HomeLoading({ internalOpsAccess }: { internalOpsAccess: boolean }) {
  const metricCount = internalOpsAccess ? 5 : 4;
  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-1000-a05 pb-8">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-5 overflow-hidden rounded-lg bg-neutral-200/50 px-4">
          {Array.from({ length: 2 }).map((_, rowIndex) => (
            <Skeleton className="my-3.5 h-10 w-full" key={rowIndex} />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full" />
        <div
          className={cn(
            "mt-5 grid gap-2 sm:grid-cols-2",
            internalOpsAccess ? "xl:grid-cols-5" : "lg:grid-cols-4"
          )}
        >
          {Array.from({ length: metricCount }).map((_, metricIndex) => (
            <div className="rounded-lg bg-neutral-200/50 p-4" key={metricIndex}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-4 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <Skeleton className="my-3.5 h-9 w-full" key={rowIndex} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyActionState() {
  return (
    <div className="rounded-lg bg-neutral-200/50 px-5 py-7">
      <div className="text-[14px] font-medium text-neutral-primary">
        지금 처리할 연결이 없습니다.
      </div>
      <div className="mt-1 text-sm font-light leading-5 text-neutral-muted">
        새로운 후보자가 추천되면 이곳에 가장 먼저 표시됩니다.
      </div>
    </div>
  );
}

function JobsMetric({
  internalOnly = false,
  label,
  value,
}: {
  internalOnly?: boolean;
  label: string;
  value: number;
}) {
  const content = (
    <div className="relative z-20">
      <div className="text-sm font-light text-neutral-muted">{label}</div>
      <div className="mt-1.5 text-[20px] font-medium text-neutral-primary">
        {value}
      </div>
    </div>
  );

  if (internalOnly) {
    return (
      <InternalOnlySurface
        className="rounded-lg bg-neutral-200/50 px-4 py-4 sm:px-5"
        showLabel={false}
      >
        {content}
      </InternalOnlySurface>
    );
  }

  return (
    <div className="rounded-lg bg-neutral-200/50 px-4 py-4 sm:px-5">
      {content}
    </div>
  );
}

function PendingRoleRow({
  count,
  name,
  onClick,
  paused,
}: {
  count: number;
  name: string;
  onClick: () => void;
  paused: boolean;
}) {
  return (
    <BareButton
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none transition hover:bg-neutral-1000-a05 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10"
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-neutral-primary">
          {name}
        </span>
        <span
          className={cn(
            "mt-1 block text-sm font-light leading-5",
            paused ? "text-critical" : "text-neutral-muted"
          )}
        >
          {paused
            ? "새 연결 일시 중단 · 후보자를 결정하면 자동으로 다시 시작됩니다."
            : "연결 수락 또는 거절을 기다리고 있습니다."}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-medium text-primary">
        {count}명
      </span>
    </BareButton>
  );
}

function WaitingCapacityNotice({ roleCount }: { roleCount: number }) {
  return (
    <div className="mt-3 rounded-md bg-neutral-200/50 px-4 py-3 text-sm font-light leading-5 text-neutral-muted">
      <span className="font-medium text-neutral-primary">
        새 연결이 중단된 Role이 {roleCount}개 있습니다.
      </span>{" "}
      연결 대기 후보자를 검토하면 자동으로 다시 시작됩니다.
    </div>
  );
}

function NewCandidates({
  items,
  onSelect,
  profileLabelsError,
  profileLabelsLoading,
}: {
  items: OrgBoardItem[];
  onSelect: (item: OrgBoardItem) => void;
  profileLabelsError: boolean;
  profileLabelsLoading: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-neutral-primary">
            새로 추천된 인재
          </h3>
          <p className="mt-1 text-sm font-light text-neutral-muted">
            아직 열어보지 않은 연결 대기 후보자입니다.
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-primary">
          {items.length}명
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <OrgCandidateCard
            item={item}
            key={item.recommendationId}
            onSelect={onSelect}
            profileLabelsError={profileLabelsError}
            profileLabelsLoading={profileLabelsLoading}
            viewed={false}
          />
        ))}
      </div>
    </div>
  );
}

type HiringRoleState = "active" | "paused" | "waiting";
type HiringRoleLifecycle = "active" | "ended" | "paused";

const HIRING_ROLE_STATE_ORDER: Record<HiringRoleState, number> = {
  waiting: 0,
  active: 1,
  paused: 2,
};

const HIRING_ROLE_STATE_META: Record<
  HiringRoleState,
  {
    label: string;
    rowTooltip: string;
    summaryTooltip: string;
  }
> = {
  active: {
    label: "active",
    rowTooltip: "현재 채용을 진행 중인 역할입니다.",
    summaryTooltip: "현재 채용을 진행 중인 역할 수입니다.",
  },
  paused: {
    label: "paused",
    rowTooltip: "현재 채용이 일시 중지된 역할입니다.",
    summaryTooltip: "현재 채용이 일시 중지된 역할 수입니다.",
  },
  waiting: {
    label: "waiting",
    rowTooltip: `연결 대기 후보자가 ${ORG_PENDING_CONNECTION_PAUSE_THRESHOLD}명 이상이라 새 연결이 잠시 중단된 역할입니다.`,
    summaryTooltip: `연결 대기 후보자가 ${ORG_PENDING_CONNECTION_PAUSE_THRESHOLD}명 이상인 역할 수입니다.`,
  },
};

function getHiringRoleLifecycle(status: string | null): HiringRoleLifecycle {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  if (["paused", "on_hold"].includes(normalized)) return "paused";
  if (
    ["ended", "closed", "expired", "inactive", "deleted", "archived"].includes(
      normalized
    )
  ) {
    return "ended";
  }
  return "active";
}

function getHiringRoleState(
  status: string | null,
  pending: number
): HiringRoleState {
  if (pending >= ORG_PENDING_CONNECTION_PAUSE_THRESHOLD) return "waiting";
  return getHiringRoleLifecycle(status) === "paused" ? "paused" : "active";
}

function HiringStatusSummaryItem({
  count,
  state,
}: {
  count: number;
  state: HiringRoleState;
}) {
  const meta = HIRING_ROLE_STATE_META[state];
  return (
    <Tooltips side="top" text={meta.summaryTooltip}>
      <span className="inline-flex items-center text-neutral-muted">
        <span>
          {count} {meta.label}
        </span>
      </span>
    </Tooltips>
  );
}

function HiringStatusSummary({
  active,
  paused,
  waiting,
}: {
  active: number;
  paused: number;
  waiting: number;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <HiringStatusSummaryItem count={active} state="active" />
      <span aria-hidden="true">·</span>
      <HiringStatusSummaryItem count={paused} state="paused" />
      {waiting > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <HiringStatusSummaryItem count={waiting} state="waiting" />
        </>
      ) : null}
    </span>
  );
}

function JobRoleRow({
  name,
  pending,
  status,
  state,
  total,
  onClick,
}: {
  name: string;
  pending: number;
  status: string | null;
  state: HiringRoleState;
  total: number;
  onClick: () => void;
}) {
  const statusMeta = HIRING_ROLE_STATE_META[state];
  const roleStatus = getOrgRoleStatusPresentation(status);
  const roleTooltip =
    state === "waiting"
      ? statusMeta.rowTooltip
      : `현재 역할 상태는 ${roleStatus.label}입니다.`;
  const pendingTooltip =
    pending > 0
      ? `${pending}명의 후보자가 연결 결정을 기다리고 있습니다.`
      : "연결 결정을 기다리는 후보자가 없습니다.";

  return (
    <BareButton
      className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-3 py-3.5 text-left outline-none transition hover:bg-neutral-200/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 sm:grid-cols-[minmax(0,1fr)_88px_88px]"
      onClick={onClick}
      type="button"
    >
      <Tooltips side="top" text={roleTooltip}>
        <span className="flex min-w-0 items-center gap-2">
          <OrgRoleStatusDot status={status} />
          <span className="min-w-0 truncate text-[14px] font-medium text-neutral-primary">
            {name}
          </span>
        </span>
      </Tooltips>
      <span className="text-right text-sm font-light text-neutral-muted">
        {total}명
      </span>
      <Tooltips side="top" text={pendingTooltip}>
        <span
          className={cn(
            "hidden text-right text-sm sm:block",
            pending > 0
              ? "font-medium text-primary"
              : "font-light text-neutral-soft"
          )}
        >
          {pending > 0 ? `${pending}명 대기` : "대기 없음"}
        </span>
      </Tooltips>
    </BareButton>
  );
}

export function OrgHomePage() {
  const router = useRouter();
  const { currentUserEmail, internalOpsAccess, roles, workspace } =
    useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const boardQuery = useOrgBoard({ roleId: null, workspaceId });
  const board = boardQuery.data;
  const error = boardQuery.error instanceof Error ? boardQuery.error : null;
  const isLoading = boardQuery.isLoading;
  const { hasHydrated, markViewed, viewedRecommendationIds } =
    useOrgViewedRecommendations({
      currentUserEmail,
      workspaceId,
    });
  const openJobs = (roleId: string) => {
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: "jobs",
        roleId: roleId || "all",
        view: roleId && roleId !== "all" ? "pipeline" : null,
      })
    );
  };
  const openCandidate = (item: OrgBoardItem) => {
    markViewed(item.recommendationId);
    void router.push(
      buildOrgHref({
        detail: {
          recommendationId: item.recommendationId,
          roleId: item.roleId,
          talentId: item.talentId,
        },
        orgId: workspaceId,
        page: "jobs",
        roleId: item.roleId,
        view: "pipeline",
      })
    );
  };
  const visibleRoles = useMemo(
    () =>
      roles.filter((role) => getHiringRoleLifecycle(role.status) !== "ended"),
    [roles]
  );
  const visibleRoleIds = useMemo(
    () => new Set(visibleRoles.map((role) => role.roleId)),
    [visibleRoles]
  );
  const pendingItems = useMemo(
    () =>
      (board?.items ?? [])
        .filter(
          (item) =>
            visibleRoleIds.has(item.roleId) &&
            item.stage === "pending_connection"
        )
        .sort(
          (left, right) =>
            new Date(left.recommendedAt).getTime() -
            new Date(right.recommendedAt).getTime()
        ),
    [board?.items, visibleRoleIds]
  );
  const pendingByRole = useMemo(() => {
    const result = new Map<string, OrgBoardItem[]>();
    for (const item of pendingItems) {
      const current = result.get(item.roleId) ?? [];
      current.push(item);
      result.set(item.roleId, current);
    }
    return result;
  }, [pendingItems]);
  const pendingRoles = useMemo(
    () =>
      visibleRoles.flatMap((role) => {
        const count = pendingByRole.get(role.roleId)?.length ?? 0;
        return count > 0
          ? [
              {
                count,
                paused: count >= ORG_PENDING_CONNECTION_PAUSE_THRESHOLD,
                role,
              },
            ]
          : [];
      }),
    [pendingByRole, visibleRoles]
  );
  const unseenPending = useMemo(
    () =>
      hasHydrated
        ? pendingItems
            .filter(
              (item) => !viewedRecommendationIds?.has(item.recommendationId)
            )
            .slice(0, 5)
        : [],
    [hasHydrated, pendingItems, viewedRecommendationIds]
  );
  const unseenRecommendationIds = useMemo(
    () => unseenPending.map((item) => item.recommendationId),
    [unseenPending]
  );
  const profileLabelsQuery = useOrgBoardProfileLabels({
    enabled: hasHydrated && unseenRecommendationIds.length > 0,
    recommendationIds: unseenRecommendationIds,
    workspaceId,
  });
  const unseenPendingWithProfileLabels = useMemo(() => {
    if (!profileLabelsQuery.data) return unseenPending;
    const labelsByTalentId = new Map(
      profileLabelsQuery.data.items.map(
        (item) => [item.talentId, item] as const
      )
    );
    return unseenPending.map((item) => {
      const labels = labelsByTalentId.get(item.talentId);
      if (!labels) return item;
      return {
        ...item,
        talent: {
          ...item.talent,
          recentCompanies: labels.recentCompanies,
          recentSchools: labels.recentSchools,
        },
      };
    });
  }, [profileLabelsQuery.data, unseenPending]);
  const { currentStageCounts, roleCounts } = useMemo(() => {
    const nextRoleCounts = new Map<
      string,
      { pending: number; total: number }
    >();
    const nextStageCounts = new Map<string, number>();
    for (const item of board?.items ?? []) {
      if (!visibleRoleIds.has(item.roleId)) continue;
      nextStageCounts.set(
        item.stage,
        (nextStageCounts.get(item.stage) ?? 0) + 1
      );
      const roleCount = nextRoleCounts.get(item.roleId) ?? {
        pending: 0,
        total: 0,
      };
      roleCount.total += 1;
      if (item.stage === "pending_connection") roleCount.pending += 1;
      nextRoleCounts.set(item.roleId, roleCount);
    }
    return {
      currentStageCounts: nextStageCounts,
      roleCounts: nextRoleCounts,
    };
  }, [board?.items, visibleRoleIds]);

  const hiringRoles = useMemo(
    () =>
      visibleRoles
        .map((role) => {
          const count = roleCounts.get(role.roleId) ?? {
            pending: 0,
            total: 0,
          };
          return {
            count,
            role,
            state: getHiringRoleState(role.status, count.pending),
          };
        })
        .sort((left, right) => {
          const stateOrder =
            HIRING_ROLE_STATE_ORDER[left.state] -
            HIRING_ROLE_STATE_ORDER[right.state];
          if (stateOrder !== 0) return stateOrder;

          const leftCreatedAt = Date.parse(left.role.createdAt);
          const rightCreatedAt = Date.parse(right.role.createdAt);
          const leftHasCreatedAt = Number.isFinite(leftCreatedAt);
          const rightHasCreatedAt = Number.isFinite(rightCreatedAt);
          if (leftHasCreatedAt && rightHasCreatedAt) {
            const createdAtOrder = rightCreatedAt - leftCreatedAt;
            if (createdAtOrder !== 0) return createdAtOrder;
          } else if (leftHasCreatedAt !== rightHasCreatedAt) {
            return leftHasCreatedAt ? -1 : 1;
          }

          return left.role.roleId.localeCompare(right.role.roleId);
        }),
    [roleCounts, visibleRoles]
  );
  const activeRoleCount = hiringRoles.filter(
    (item) => item.state === "active"
  ).length;
  const pausedRoleCount = hiringRoles.filter(
    (item) => item.state === "paused"
  ).length;
  const waitingRoleCount = hiringRoles.filter(
    (item) => item.state === "waiting"
  ).length;

  return (
    <div className="space-y-8">
      <OrgPageHeader title="Home" />

      {error ? (
        <OrgErrorState
          message={error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}

      {isLoading ? (
        <HomeLoading internalOpsAccess={internalOpsAccess} />
      ) : (
        <>
          <OrgSection>
            <OrgSectionHeader
              actions={
                <MuteButton
                  onClick={() => openJobs("all")}
                  size="md"
                  variant="transparent"
                >
                  전체 보기
                </MuteButton>
              }
              title="Hiring"
              description={
                <HiringStatusSummary
                  active={activeRoleCount}
                  paused={pausedRoleCount}
                  waiting={waitingRoleCount}
                />
              }
            />
            <div className="grid md:grid-cols-[minmax(0,1fr)_240px] grid-cols-1 gap-6">
              <div>
                {hiringRoles.length > 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 pb-2 text-[14px] font-light text-neutral-soft sm:grid-cols-[minmax(0,1fr)_88px_88px]">
                    <span>Role</span>
                    <span className="text-right">총 연결</span>
                    <span className="hidden text-right sm:block">
                      연결 대기
                    </span>
                  </div>
                ) : null}
                <div className="divide-y divide-neutral-1000-a05">
                  {hiringRoles.map(({ count, role, state }) => {
                    return (
                      <JobRoleRow
                        key={role.roleId}
                        name={role.name}
                        onClick={() => openJobs(role.roleId)}
                        pending={count.pending}
                        status={role.status}
                        state={state}
                        total={count.total}
                      />
                    );
                  })}
                  {hiringRoles.length === 0 ? (
                    <div className="py-9 text-center text-sm font-light text-neutral-muted">
                      등록된 Job이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={cn("flex flex-col gap-2")}>
                {/* <JobsMetric label="진행 중인 역할" value={roles.length} /> */}
                <JobsMetric
                  label="연결 대기"
                  value={currentStageCounts.get("pending_connection") ?? 0}
                />
                <JobsMetric
                  label="진행중"
                  value={currentStageCounts.get("connected") ?? 0}
                />
                <JobsMetric
                  label="프로세스 중단"
                  value={currentStageCounts.get("process_stopped") ?? 0}
                />
                {internalOpsAccess ? (
                  <JobsMetric
                    internalOnly
                    label="수락 후 대기"
                    value={currentStageCounts.get("accepted") ?? 0}
                  />
                ) : null}
              </div>
            </div>
          </OrgSection>
          <OrgSection>
            <OrgSectionHeader
              description={
                pendingItems.length > 0
                  ? "오래 기다린 후보자부터 연결 여부를 결정해 주세요."
                  : "새로운 연결 제안이 생기면 이곳에서 바로 확인할 수 있습니다."
              }
              title="지금 필요한 액션"
            />
            {pendingRoles.length > 0 ? (
              <div className="overflow-hidden rounded-lg bg-neutral-200/50">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
                  <span className="text-sm font-light text-neutral-muted">
                    연결 결정 대기
                  </span>
                  <span className="text-[15px] font-medium text-primary">
                    {pendingItems.length}명
                  </span>
                </div>
                <div className="divide-y divide-neutral-1000-a05">
                  {pendingRoles.map(({ count, paused, role }) => (
                    <PendingRoleRow
                      count={count}
                      key={role.roleId}
                      name={role.name}
                      onClick={() => openJobs(role.roleId)}
                      paused={paused}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyActionState />
            )}
            {waitingRoleCount > 0 ? (
              <WaitingCapacityNotice roleCount={waitingRoleCount} />
            ) : null}
            {hasHydrated ? (
              <NewCandidates
                items={unseenPendingWithProfileLabels}
                onSelect={openCandidate}
                profileLabelsError={profileLabelsQuery.isError}
                profileLabelsLoading={profileLabelsQuery.isPending}
              />
            ) : null}
          </OrgSection>
        </>
      )}
    </div>
  );
}
