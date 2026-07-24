import Image from "next/image";
import { useMemo } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import type { OrgBoardItem, OrgBoardResponse, OrgRole } from "@/lib/org/server";

export const ORG_PENDING_CONNECTION_PAUSE_THRESHOLD = 5;

function candidateName(item: OrgBoardItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

function PendingCandidateButton({
  item,
  onSelect,
}: {
  item: OrgBoardItem;
  onSelect: (item: OrgBoardItem) => void;
}) {
  const name = candidateName(item);
  return (
    <BareButton
      className="flex w-full items-center gap-3 px-3 py-3.5 text-left outline-none transition hover:bg-neutral-1000-a05 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10"
      onClick={() => onSelect(item)}
    >
      {item.talent.profilePicture ? (
        <Image
          alt=""
          className="size-8 shrink-0 rounded-full object-cover"
          height={32}
          src={item.talent.profilePicture}
          unoptimized
          width={32}
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-neutral-primary">
          {name}
        </span>
        <span className="mt-1 block truncate text-[12px] font-light text-neutral-soft">
          {item.roleName || "Role"} ·{" "}
          {formatKstRelativeDate(item.recommendedAt)}
        </span>
      </span>
    </BareButton>
  );
}

function HomeLoading() {
  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-1000-a05 pb-8">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-5 overflow-hidden rounded-lg bg-bg-weak px-4">
          {Array.from({ length: 2 }).map((_, rowIndex) => (
            <Skeleton className="my-3.5 h-10 w-full" key={rowIndex} />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full" />
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, metricIndex) => (
            <div className="rounded-lg bg-bg-weak p-4" key={metricIndex}>
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
    <div className="rounded-lg bg-bg-weak px-5 py-7">
      <div className="text-[14px] font-medium text-neutral-primary">
        지금 처리할 연결이 없습니다.
      </div>
      <div className="mt-1 text-[12px] font-light leading-5 text-neutral-muted">
        새로운 후보자가 추천되면 이곳에 가장 먼저 표시됩니다.
      </div>
    </div>
  );
}

function JobsMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-bg-weak px-4 py-4 sm:px-5">
      <div className="text-[12px] font-light text-neutral-muted">{label}</div>
      <div className="mt-1.5 text-[20px] font-medium text-neutral-primary">
        {value}
      </div>
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
          className={`mt-1 block text-[12px] font-light leading-5 ${
            paused ? "text-critical" : "text-neutral-muted"
          }`}
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

function PausedConnectionNotice({ roleCount }: { roleCount: number }) {
  return (
    <div className="mt-3 rounded-md bg-bg-weak px-4 py-3 text-[12px] font-light leading-5 text-neutral-muted">
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
}: {
  items: OrgBoardItem[];
  onSelect: (item: OrgBoardItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-neutral-primary">
            새로 추천된 인재
          </h3>
          <p className="mt-1 text-[12px] font-light text-neutral-muted">
            아직 열어보지 않은 연결 대기 후보자입니다.
          </p>
        </div>
        <span className="shrink-0 text-[12px] font-medium text-primary">
          {items.length}명
        </span>
      </div>
      <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
        {items.map((item) => (
          <PendingCandidateButton
            item={item}
            key={item.recommendationId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function JobRoleRow({
  name,
  pending,
  total,
  onClick,
}: {
  name: string;
  pending: number;
  total: number;
  onClick: () => void;
}) {
  return (
    <BareButton
      className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-3 px-3 py-3.5 text-left outline-none transition hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 sm:grid-cols-[minmax(0,1fr)_88px_88px]"
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 truncate text-[14px] font-medium text-neutral-primary">
        {name}
      </span>
      <span className="text-right text-[12px] font-light text-neutral-muted">
        {total}명
      </span>
      <span
        className={`hidden text-right text-[12px] sm:block ${
          pending > 0
            ? "font-medium text-primary"
            : "font-light text-neutral-soft"
        }`}
      >
        {pending > 0 ? `${pending}명 대기` : "대기 없음"}
      </span>
    </BareButton>
  );
}

export function OrgHomePage({
  board,
  currentUserEmail,
  error,
  isLoading,
  onCandidateSelect,
  onJobsOpen,
  onRetry,
  onRoleSelect,
  roles,
  workspaceId,
}: {
  board?: OrgBoardResponse | null;
  currentUserEmail?: string | null;
  error?: Error | null;
  isLoading?: boolean;
  onCandidateSelect: (item: OrgBoardItem) => void;
  onJobsOpen: () => void;
  onRetry: () => void;
  onRoleSelect: (roleId: string) => void;
  roles: OrgRole[];
  workspaceId: string;
}) {
  const { hasHydrated, viewedRecommendationIds } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
  const pendingItems = useMemo(
    () =>
      (board?.items ?? [])
        .filter((item) => item.stage === "pending_connection")
        .sort(
          (left, right) =>
            new Date(left.recommendedAt).getTime() -
            new Date(right.recommendedAt).getTime()
        ),
    [board?.items]
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
      roles.flatMap((role) => {
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
    [pendingByRole, roles]
  );
  const pausedRoleCount = pendingRoles.filter((item) => item.paused).length;
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
  const activeRoles = useMemo(
    () =>
      roles.filter((role) =>
        ["active", "open", "top_priority"].includes(
          String(role.status ?? "active").toLowerCase()
        )
      ),
    [roles]
  );
  const { roleCounts, stageCounts } = useMemo(() => {
    const nextRoleCounts = new Map<
      string,
      { pending: number; total: number }
    >();
    const nextStageCounts = new Map<string, number>();
    for (const item of board?.items ?? []) {
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
      roleCounts: nextRoleCounts,
      stageCounts: nextStageCounts,
    };
  }, [board?.items]);

  return (
    <div className="space-y-8">
      <OrgPageHeader
        description="연결을 기다리는 인재와 진행 중인 채용을 한눈에 확인하세요."
        title="Home"
      />

      {error ? (
        <OrgErrorState message={error.message} onRetry={onRetry} />
      ) : null}

      {isLoading ? (
        <HomeLoading />
      ) : (
        <>
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
              <div className="overflow-hidden rounded-lg bg-bg-weak">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
                  <span className="text-[12px] font-light text-neutral-muted">
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
                      onClick={() => onRoleSelect(role.roleId)}
                      paused={paused}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyActionState />
            )}
            {pausedRoleCount > 0 ? (
              <PausedConnectionNotice roleCount={pausedRoleCount} />
            ) : null}
            {hasHydrated ? (
              <NewCandidates
                items={unseenPending}
                onSelect={onCandidateSelect}
              />
            ) : null}
          </OrgSection>

          <OrgSection>
            <OrgSectionHeader
              actions={
                <MuteButton
                  onClick={onJobsOpen}
                  size="md"
                  variant="transparent"
                >
                  전체 보기
                </MuteButton>
              }
              description="Role별 후보자 진행 상황의 요약입니다."
              title="진행 중인 Jobs"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <JobsMetric label="진행 중 Role" value={activeRoles.length} />
              <JobsMetric
                label="연결됨"
                value={stageCounts.get("connected") ?? 0}
              />
              <JobsMetric
                label="최종 오퍼"
                value={stageCounts.get("final_offer") ?? 0}
              />
            </div>
            {activeRoles.length > 0 ? (
              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_72px] gap-3 px-3 pb-2 text-[11px] font-light text-neutral-soft sm:grid-cols-[minmax(0,1fr)_88px_88px]">
                <span>Role</span>
                <span className="text-right">후보자</span>
                <span className="hidden text-right sm:block">연결 대기</span>
              </div>
            ) : null}
            <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
              {activeRoles.slice(0, 5).map((role) => {
                const count = roleCounts.get(role.roleId) ?? {
                  pending: 0,
                  total: 0,
                };
                return (
                  <JobRoleRow
                    key={role.roleId}
                    name={role.name}
                    onClick={() => onRoleSelect(role.roleId)}
                    pending={count.pending}
                    total={count.total}
                  />
                );
              })}
              {activeRoles.length === 0 ? (
                <div className="py-9 text-center text-[12px] font-light text-neutral-muted">
                  진행 중인 Job이 없습니다.
                </div>
              ) : null}
            </div>
          </OrgSection>
        </>
      )}
    </div>
  );
}
