import { Eye } from "lucide-react";
import { useState } from "react";
import {
  TALENT_DETAIL_SHARED_TABS,
  TalentDetailSharedTabContent,
  type TalentDetailSharedTabId,
} from "@/components/ops/career/TalentDetailSharedTabs";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgInternalTalentSystem } from "@/hooks/org/useOrgInternalTalent";
import { cn } from "@/lib/utils";

type InternalTalentTab = TalentDetailSharedTabId | "system";

const INTERNAL_TABS: Array<{
  id: InternalTalentTab;
  label: string;
}> = [...TALENT_DETAIL_SHARED_TABS, { id: "system", label: "시스템 데이터" }];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function PaneLoading() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

function PaneError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-2.5 text-[13px] text-critical">
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

function SystemMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-neutral-1000-a05 py-2.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
      <div className="text-[13px] font-light text-neutral-muted">{label}</div>
      <div className="text-[13px] font-medium text-neutral-primary">
        {value}
      </div>
    </div>
  );
}

function RecommendationStats({
  label,
  stats,
}: {
  label: string;
  stats: {
    accepted: number;
    noResponse: number;
    rejected: number;
    total: number;
  };
}) {
  return (
    <div className="border-y border-neutral-1000-a05 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-neutral-primary">
          {label}
        </div>
        <Badge radius="full" size="sm" variant="faded">
          총 {stats.total}
        </Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-neutral-1000-a05">
        {[
          { label: "수락", value: stats.accepted },
          { label: "거절", value: stats.rejected },
          { label: "미응답", value: stats.noResponse },
        ].map((item) => (
          <div className="px-1.5 py-0.5" key={item.label}>
            <div className="text-[12px] font-light text-neutral-muted">
              {item.label}
            </div>
            <div className="mt-0.5 text-[14px] font-medium text-neutral-primary">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrgInternalTalentPanel({
  talentId,
  workspaceId,
}: {
  talentId: string;
  workspaceId: string;
}) {
  const [activeTab, setActiveTab] = useState<InternalTalentTab>("insights");
  const systemQuery = useOrgInternalTalentSystem({
    enabled: activeTab === "system",
    talentId,
    workspaceId,
  });

  return (
    <InternalOnlySurface
      className="min-h-[440px] border-y border-neutral-1000-a05 bg-bg-default"
      showLabel={false}
    >
      <div className="relative z-20 flex items-start gap-1.5 border-b border-neutral-1000-a10 bg-neutral-1000 px-2.5 py-2 text-neutral-00">
        <Eye className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <div className="text-[13px] font-medium">Harper 내부 전용</div>
          <div className="mt-1 text-[12px] font-light leading-5 text-neutral-00/70">
            아래 정보는 실제 회사 사용자에게 응답하거나 표시하지 않습니다.
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-neutral-1000-a05 bg-bg-default px-1.5">
        {INTERNAL_TABS.map((tab) => (
          <MuteButton
            className={cn(
              "shrink-0 rounded-none border-b-2 px-3 text-[13px]",
              activeTab === tab.id
                ? "border-neutral-1000 text-neutral-primary"
                : "border-transparent text-neutral-muted"
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            size="sm"
            variant="transparent"
          >
            {tab.label}
          </MuteButton>
        ))}
      </div>

      <div className="p-3">
        {activeTab !== "system" ? (
          <TalentDetailSharedTabContent
            activeTab={activeTab}
            userId={talentId}
          />
        ) : null}

        {activeTab === "system" ? (
          systemQuery.isLoading ? (
            <PaneLoading />
          ) : systemQuery.error || !systemQuery.data ? (
            <PaneError
              error={systemQuery.error}
              fallback="시스템 데이터를 불러오지 못했습니다."
            />
          ) : (
            <div className="space-y-5">
              <div className="border-t border-neutral-1000-a05">
                <SystemMetricRow
                  label="가입 날짜"
                  value={formatDateTime(systemQuery.data.account.createdAt)}
                />
                <SystemMetricRow
                  label="최근 로그인"
                  value={formatDateTime(systemQuery.data.account.lastLoginAt)}
                />
                <SystemMetricRow
                  label="최근 사용"
                  value={formatDateTime(systemQuery.data.account.lastActiveAt)}
                />
                <SystemMetricRow
                  label="Status"
                  value={systemQuery.data.account.status || "-"}
                />
                <SystemMetricRow
                  label="온보딩"
                  value={
                    systemQuery.data.account.isOnboardingDone
                      ? "완료"
                      : "진행 중"
                  }
                />
                <SystemMetricRow
                  label="프로필 공개"
                  value={systemQuery.data.account.profileVisibility || "-"}
                />
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                <RecommendationStats
                  label="최근 7일 External 추천"
                  stats={systemQuery.data.recent7Days.external}
                />
                <RecommendationStats
                  label="최근 7일 Internal 추천"
                  stats={systemQuery.data.recent7Days.internal}
                />
              </div>

              <div className="flex flex-wrap gap-1.5 text-[12px] font-light text-neutral-muted">
                <span className="rounded-sm bg-bg-weak px-1.5 py-0.5">
                  External 추천{" "}
                  {systemQuery.data.account.externalRecommendationsEnabled
                    ? "ON"
                    : "OFF"}
                </span>
                <span className="rounded-sm bg-bg-weak px-1.5 py-0.5">
                  Internal 추천{" "}
                  {systemQuery.data.account.internalRecommendationsEnabled
                    ? "ON"
                    : "OFF"}
                </span>
                <span className="rounded-sm bg-bg-weak px-1.5 py-0.5">
                  Status 변경{" "}
                  {formatDateTime(systemQuery.data.account.statusUpdatedAt)}
                </span>
              </div>
            </div>
          )
        ) : null}
      </div>
    </InternalOnlySurface>
  );
}
