import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import {
  isOrgRoleCountedAsActive,
  getOrgRoleStatusPresentation,
} from "@/lib/org/roleStatus";
import type { CompanyDashboard } from "@/lib/ops/companyDashboardTypes";
import type { OpsOpportunityWorkspaceRecord } from "@/lib/ops/opportunity";

export function CompanyDirectoryRow({
  workspace,
  summary,
  onSelect,
  summaryError = false,
}: {
  workspace: OpsOpportunityWorkspaceRecord;
  summary?: CompanyDashboard["companies"][number];
  onSelect: () => void;
  summaryError?: boolean;
}) {
  const active =
    summary?.roles.filter((role) => isOrgRoleCountedAsActive(role.status)) ??
    [];
  const rest =
    summary?.roles.filter((role) => !isOrgRoleCountedAsActive(role.status)) ??
    [];
  return (
    <article className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-neutral-1000-a10 py-3">
      <MuteButton
        variant="transparent"
        className="h-8 w-8 self-start p-0"
        aria-label={`${workspace.companyName} 상세 보기`}
        onClick={onSelect}
      >
        {workspace.logoUrl ? (
          <Image
            src={workspace.logoUrl}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center text-base font-medium text-neutral-muted"
          >
            {workspace.companyName.trim().slice(0, 1) || "?"}
          </span>
        )}
      </MuteButton>
      <div className="contents">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <MuteButton
            variant="transparent"
            onClick={onSelect}
            className="h-auto min-w-0 max-w-full whitespace-normal rounded-none px-0 text-left text-neutral-primary hover:bg-transparent"
          >
            <span className="text-base font-medium">
              {workspace.companyName}
            </span>
            {workspace.hasSlackConnection && (
              <Image
                alt="Slack 연결됨"
                src="/images/logos/slack.svg"
                width={14}
                height={14}
              />
            )}
          </MuteButton>
          <div className="flex gap-5 text-xs text-neutral-muted">
            <span>팀원 {workspace.memberCount}</span>
            <span>
              채용 중 {summary ? active.length : workspace.activeRoleCount}
            </span>
          </div>
        </div>
        <div className="col-span-2 grid min-w-0 gap-3 sm:col-span-1 sm:col-start-2 lg:grid-cols-[1fr_1fr]">
          <div>
            {!summary && (
              <p className="py-1 text-xs text-neutral-muted">
                {summaryError
                  ? "요약을 불러오지 못했습니다."
                  : "역할·활동 요약을 불러오는 중입니다."}
              </p>
            )}
            {active.map((role) => (
              <div
                key={role.id}
                className="space-y-1 border-b border-neutral-1000-a05 py-2 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="font-medium">{role.name}</span>
                  <ResponsiveLightTooltip
                    trigger={
                      <span>
                        {role.hiringStartedAt
                          ? `${role.hiringStartBasis === "status_change" ? "채용 상태 변경" : "채용 시작"} ${formatOpsCompanyDate(role.hiringStartedAt)}`
                          : "시작일 기록 없음"}
                      </span>
                    }
                    triggerClassName="py-0 text-xs text-neutral-muted"
                    mobileAriaLabel="채용 시작일 기준"
                  >
                    {role.hiringStartBasis === "activation"
                      ? "저장된 최초 채용 시작 실행의 생성 시각입니다."
                      : "채용 시작 실행 기록이 없어 최근 상태 변경일을 표시합니다. 재개나 우선순위 변경 시 갱신될 수 있어 최초 채용 시작일과 다를 수 있습니다."}
                  </ResponsiveLightTooltip>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-muted">
                  {(role.candidateCounts ?? [])
                    .filter(
                      (stage) =>
                        stage.count > 0 ||
                        ["recommended", "connected", "ended"].includes(stage.id)
                    )
                    .map((stage) => (
                      <span key={stage.id}>
                        {stage.label}{" "}
                        <span className="font-medium tabular-nums text-neutral-primary">
                          {stage.count}
                        </span>
                      </span>
                    ))}
                  <span className="text-neutral-muted">
                    전체{" "}
                    {(role.candidateCounts ?? []).reduce(
                      (sum, stage) => sum + stage.count,
                      0
                    )}
                    명
                  </span>
                </div>
              </div>
            ))}
            {summary && !active.length && (
              <p className="py-1 text-xs text-neutral-muted">
                채용 중인 역할이 없습니다.
              </p>
            )}
            {!!rest.length && (
              <details className="group mt-1 text-xs text-neutral-muted">
                <summary className="flex cursor-pointer list-none items-center gap-1 py-1 [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    aria-hidden
                    className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                  />
                  더보기 · 작성 중{" "}
                  {rest.filter((r) => r.status === "draft").length} · 종료됨{" "}
                  {rest.filter((r) => r.status === "ended").length} · 정지됨{" "}
                  {rest.filter((r) => r.status === "paused").length}
                </summary>
                {rest.map((role) => (
                  <div
                    className="flex items-baseline justify-between gap-3 py-1"
                    key={role.id}
                  >
                    <span>{role.name}</span>
                    <span>
                      {getOrgRoleStatusPresentation(role.status).label}
                    </span>
                  </div>
                ))}
              </details>
            )}
          </div>
          <div className="border-neutral-1000-a05 lg:border-l lg:pl-4">
            <p className="mb-1 text-xs text-neutral-muted">최근 주요 활동</p>
            {summary?.activities.map((item) => (
              <div
                key={item.id}
                className="flex items-baseline justify-between gap-3 py-0.5 text-xs"
              >
                <span
                  className="min-w-0 break-words sm:truncate"
                  title={item.title}
                >
                  {item.title}
                </span>
                <time
                  className="shrink-0 text-neutral-muted"
                  title={formatOpsCompanyDate(item.occurredAt)}
                >
                  {formatOpsCompanyDate(item.occurredAt)}
                </time>
              </div>
            ))}
            {summary && !summary.activities.length && (
              <p className="text-xs text-neutral-muted">
                기록된 주요 활동이 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
