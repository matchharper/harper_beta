import Image from "next/image";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { OrgAgentChatSurface } from "@/components/org/agent/OrgAgentPanel";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { BareButton, CardButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgBoard } from "@/hooks/org/useOrg";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";

export const ORG_PENDING_CONNECTION_PAUSE_THRESHOLD = 5;

function HomeLoading() {
  return (
    <div>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-5 divide-y divide-neutral-1000-a05">
        {Array.from({ length: 3 }).map((_, rowIndex) => (
          <Skeleton className="my-3.5 h-9 w-full" key={rowIndex} />
        ))}
      </div>
    </div>
  );
}

type HiringRoleState = "active" | "ended" | "paused" | "waiting";
type HiringRoleLifecycle = "active" | "ended" | "paused";

const HIRING_ROLE_STATE_ORDER: Record<HiringRoleState, number> = {
  waiting: 0,
  active: 1,
  paused: 2,
  ended: 3,
};

const HIRING_ROLE_STATE_META: Record<
  HiringRoleState,
  {
    label: string;
    summaryTooltip: string;
  }
> = {
  active: {
    label: "진행 중",
    summaryTooltip: "현재 채용을 진행 중인 역할 수입니다.",
  },
  paused: {
    label: "중단",
    summaryTooltip: "새 후보자 추천을 중단한 역할 수예요.",
  },
  ended: {
    label: "종료",
    summaryTooltip: "채용이 종료된 역할 수입니다.",
  },
  waiting: {
    label: "연결 검토 필요",
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

function isDeletedRole(status: string | null) {
  return (
    String(status ?? "")
      .trim()
      .toLowerCase() === "deleted"
  );
}

function getHiringRoleState(
  status: string | null,
  pending: number
): HiringRoleState {
  if (getHiringRoleLifecycle(status) === "ended") return "ended";
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
  ended,
  paused,
  waiting,
}: {
  active: number;
  ended: number;
  paused: number;
  waiting: number;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <HiringStatusSummaryItem count={active} state="active" />
      <span aria-hidden="true">·</span>
      <HiringStatusSummaryItem count={paused} state="paused" />
      {ended > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <HiringStatusSummaryItem count={ended} state="ended" />
        </>
      ) : null}
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
  onClick,
}: {
  name: string;
  pending: number;
  status: string | null;
  onClick: () => void;
}) {
  const pendingTooltip =
    pending > 0
      ? `${pending}명의 후보자가 연결 결정을 기다리고 있습니다.`
      : "연결 결정을 기다리는 후보자가 없습니다.";

  return (
    <BareButton
      className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-3 py-3.5 text-left outline-none transition hover:bg-neutral-200/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 sm:grid-cols-[minmax(0,1fr)_88px]"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <OrgRoleStatusDot status={status} />
        <span className="min-w-0 truncate text-[14px] font-medium text-neutral-primary">
          {name}
        </span>
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

function formatSlackChannelName(
  channel: { channelId: string; channelName: string | null } | null
) {
  if (!channel) return null;
  const name = channel.channelName?.trim();
  if (name) return name.startsWith("#") ? name : `#${name}`;
  return `채널 ${channel.channelId}`;
}

function HomeQuickActions({
  companyLogoUrl,
  companyName,
  onOpenCompany,
  onOpenMembers,
  onOpenSlack,
  slackChannelName,
}: {
  companyLogoUrl: string | null;
  companyName: string;
  onOpenCompany: () => void;
  onOpenMembers: () => void;
  onOpenSlack: () => void;
  slackChannelName: string | null;
}) {
  const cardCs =
    "sm:min-h-[132px] min-w-0 w-full flex-col items-start gap-1 rounded-xl border-neutral-1000-a10 bg-bg-default p-4 sm:p-4 shadow-none hover:border-neutral-1000-a10 hover:bg-neutral-100";

  return (
    <div
      aria-label="Workspace 설정"
      className="mt-20 grid w-full grid-cols-1 sm:grid-cols-3 gap-3 sm:mt-14"
    >
      <CardButton className={cardCs} onClick={onOpenSlack}>
        <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-md bg-black/5">
          <Image alt="" height={18} src="/images/logos/slack.svg" width={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">Slack</span>
          <span className="line-clamp-2 text-[13px] font-light leading-4 text-black/70">
            {slackChannelName
              ? `${slackChannelName} 연결됨`
              : "팀과 함께 추천 소식을 확인하세요."}
          </span>
        </span>
      </CardButton>
      <CardButton className={cardCs} onClick={onOpenCompany}>
        <span className="mb-3 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-weak text-[12px] font-medium text-neutral-muted">
          {companyLogoUrl ? (
            <Image
              alt=""
              className="size-8 object-cover"
              height={32}
              src={companyLogoUrl}
              unoptimized
              width={32}
            />
          ) : (
            companyName.trim().slice(0, 1).toUpperCase() || "H"
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">Company</span>
          <span className="line-clamp-2 text-[13px] font-light leading-4 text-black/70">
            후보자에게 보여질 수 있는 회사 정보를 관리하세요.
          </span>
        </span>
      </CardButton>
      <CardButton className={cardCs} onClick={onOpenMembers}>
        <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-md bg-black/5">
          <UserPlus aria-hidden="true" className="size-5" strokeWidth={1.7} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">Members</span>
          <span className="line-clamp-2 text-[13px] font-light leading-4 text-black/70">
            함께 후보자를 검토할 팀원을 초대하세요.
          </span>
        </span>
      </CardButton>
    </div>
  );
}

export function OrgHomePage() {
  const router = useRouter();
  const { permissions, roles, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const homeRoles = useMemo(
    () => roles.filter((role) => !isDeletedRole(role.status)),
    [roles]
  );
  const hasNoRoles = homeRoles.length === 0;
  const boardQuery = useOrgBoard({
    enabled: !hasNoRoles,
    roleId: null,
    workspaceId,
  });
  const slackStatusQuery = useOrgSlackStatus({ workspaceId });
  const primarySlackChannel = slackStatusQuery.data?.channels[0] ?? null;
  const slackChannelName = formatSlackChannelName(primarySlackChannel);
  const board = boardQuery.data;
  const error = boardQuery.error instanceof Error ? boardQuery.error : null;
  const isLoading = boardQuery.isLoading;
  const openJobs = (roleId: string) => {
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: roleId && roleId !== "all" ? "role" : "jobs",
        roleId: roleId || "all",
        tab: roleId && roleId !== "all" ? "pipeline" : undefined,
        view: roleId && roleId !== "all" ? "pipeline" : null,
      })
    );
  };
  const openSlack = () => {
    void router.push(buildOrgHref({ orgId: workspaceId, page: "settings" }));
  };
  const openCompany = () => {
    void router.push(buildOrgHref({ orgId: workspaceId, page: "team" }));
  };
  const openMembers = () => {
    void router.push(buildOrgHref({ orgId: workspaceId, page: "member" }));
  };
  const handleRoleCreated = (createdRoleId: string) => {
    void router.replace(
      buildOrgHref({
        orgId: workspaceId,
        page: "role",
        roleId: createdRoleId,
      }),
      undefined
    );
  };
  const visibleRoleIds = useMemo(
    () => new Set(homeRoles.map((role) => role.roleId)),
    [homeRoles]
  );
  const roleCounts = useMemo(() => {
    const nextRoleCounts = new Map<
      string,
      { pending: number; total: number }
    >();
    for (const item of board?.items ?? []) {
      if (!visibleRoleIds.has(item.roleId)) continue;
      const roleCount = nextRoleCounts.get(item.roleId) ?? {
        pending: 0,
        total: 0,
      };
      roleCount.total += 1;
      if (item.stage === "pending_connection") roleCount.pending += 1;
      nextRoleCounts.set(item.roleId, roleCount);
    }
    return nextRoleCounts;
  }, [board?.items, visibleRoleIds]);

  const hiringRoles = useMemo(
    () =>
      homeRoles
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
    [homeRoles, roleCounts]
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
  const endedRoleCount = hiringRoles.filter(
    (item) => item.state === "ended"
  ).length;

  if (hasNoRoles) {
    return (
      <div className="relative h-[calc(100svh-80px)] min-h-[560px]">
        {permissions.canManageCandidates ? (
          <div aria-label="새 역할 등록 대화" className="h-full">
            <OrgAgentChatSurface
              header={<h1 className="sr-only">새 역할 등록</h1>}
              onRoleCreated={handleRoleCreated}
              purpose="role-creation"
              roleId={null}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-muted">
            역할을 등록할 권한이 없습니다.
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 z-30 bg-bg-default/90 pt-4 backdrop-blur-sm">
          <HomeQuickActions
            companyLogoUrl={workspace.logoUrl}
            companyName={workspace.companyName}
            onOpenCompany={openCompany}
            onOpenMembers={openMembers}
            onOpenSlack={openSlack}
            slackChannelName={slackChannelName}
          />
        </div>
      </div>
    );
  }

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
        <HomeLoading />
      ) : (
        <>
          <OrgSection>
            <OrgSectionHeader
              title="Hiring"
              description={
                <HiringStatusSummary
                  active={activeRoleCount}
                  ended={endedRoleCount}
                  paused={pausedRoleCount}
                  waiting={waitingRoleCount}
                />
              }
            />
            {hiringRoles.length > 0 ? (
              <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 pb-2 text-[14px] font-light text-neutral-soft sm:grid-cols-[minmax(0,1fr)_88px]">
                <span>Role</span>
                <span className="hidden text-right sm:block">연결 대기</span>
              </div>
            ) : null}
            <div className="divide-y divide-neutral-1000-a05">
              {hiringRoles.map(({ count, role }) => {
                return (
                  <JobRoleRow
                    key={role.roleId}
                    name={role.name}
                    onClick={() => openJobs(role.roleId)}
                    pending={count.pending}
                    status={role.status}
                  />
                );
              })}
              {hiringRoles.length === 0 ? (
                <div className="py-9 text-center text-sm font-light text-neutral-muted">
                  아직 등록된 Role이 없어요.
                </div>
              ) : null}
            </div>
          </OrgSection>
          <HomeQuickActions
            companyLogoUrl={workspace.logoUrl}
            companyName={workspace.companyName}
            onOpenCompany={openCompany}
            onOpenMembers={openMembers}
            onOpenSlack={openSlack}
            slackChannelName={slackChannelName}
          />
        </>
      )}
    </div>
  );
}
