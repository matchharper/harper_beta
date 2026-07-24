import { Check, Clock3, Eye, LoaderCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { InsightsTab } from "@/components/ops/career/InsightsTab";
import { MessagesTab } from "@/components/ops/career/MessagesTab";
import {
  recommendationSourceClass,
  recommendationSourceLabel,
} from "@/components/ops/career/utils";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOpsCareerInsights,
  useOpsCareerMessages,
  useOpsCareerRecommendations,
} from "@/hooks/ops/useOpsCareer";
import { useOrgInternalTalentSystem } from "@/hooks/org/useOrgInternalTalent";
import type { CareerTalentRecommendationItem } from "@/lib/ops/careerServer";
import { cn } from "@/lib/utils";

type InternalTalentTab = "insights" | "messages" | "recommendations" | "system";

const INTERNAL_TABS: Array<{
  id: InternalTalentTab;
  label: string;
}> = [
  { id: "insights", label: "인사이트" },
  { id: "recommendations", label: "다른 추천" },
  { id: "messages", label: "대화 내역" },
  { id: "system", label: "시스템 데이터" },
];

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
    <div className="rounded-md border border-critical/20 bg-critical-faded px-2.5 py-2 text-[11px] text-critical">
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

function responseMeta(item: CareerTalentRecommendationItem) {
  const feedback = String(item.feedback ?? "").toLowerCase();
  if (
    feedback === "like" ||
    feedback === "positive" ||
    item.savedStage === "accepted"
  ) {
    return {
      className: "bg-positive-faded text-positive",
      icon: Check,
      label: "수락",
    };
  }
  if (
    feedback === "dislike" ||
    feedback === "negative" ||
    item.savedStage === "rejected"
  ) {
    return {
      className: "bg-critical-faded text-critical",
      icon: X,
      label: "거절",
    };
  }
  return {
    className: "bg-bg-weak text-neutral-muted",
    icon: Clock3,
    label: "미응답",
  };
}

function RecommendationRow({ item }: { item: CareerTalentRecommendationItem }) {
  const response = responseMeta(item);
  const ResponseIcon = response.icon;
  return (
    <article className="border-b border-neutral-1000-a05 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-neutral-primary">
            {item.companyName} · {item.roleName}
          </div>
          <div className="mt-1 text-[10px] font-light text-neutral-soft">
            {formatDateTime(item.recommendedAt)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              recommendationSourceClass(item.sourceType)
            )}
          >
            {recommendationSourceLabel(item.sourceType)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              response.className
            )}
          >
            <ResponseIcon className="size-3" />
            {response.label}
          </span>
        </div>
      </div>
      {item.fitSummary ? (
        <p className="mt-1.5 line-clamp-2 text-[10px] font-light leading-4 text-neutral-muted">
          {item.fitSummary}
        </p>
      ) : null}
      {item.feedbackReason ? (
        <p className="mt-1.5 border-l-2 border-neutral-1000-a10 pl-2 text-[10px] font-light leading-4 text-neutral-muted">
          {item.feedbackReason}
        </p>
      ) : null}
    </article>
  );
}

function SystemMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-neutral-1000-a05 py-2.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
      <div className="text-[10px] font-light text-neutral-muted">{label}</div>
      <div className="text-[12px] font-medium text-neutral-primary">
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
        <div className="text-[11px] font-medium text-neutral-primary">
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
            <div className="text-[10px] font-light text-neutral-muted">
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
  currentRecommendationId,
  talentId,
  workspaceId,
}: {
  currentRecommendationId?: string | null;
  talentId: string;
  workspaceId: string;
}) {
  const [activeTab, setActiveTab] = useState<InternalTalentTab>("insights");
  const insightsQuery = useOpsCareerInsights(
    talentId,
    activeTab === "insights"
  );
  const messagesQuery = useOpsCareerMessages(
    talentId,
    activeTab === "messages"
  );
  const recommendationsQuery = useOpsCareerRecommendations(
    talentId,
    20,
    activeTab === "recommendations"
  );
  const systemQuery = useOrgInternalTalentSystem({
    enabled: activeTab === "system",
    talentId,
    workspaceId,
  });
  const recommendations = useMemo(
    () =>
      (recommendationsQuery.data?.pages ?? [])
        .flatMap((page) => page.recommendations)
        .filter((item) => item.recommendationId !== currentRecommendationId),
    [currentRecommendationId, recommendationsQuery.data?.pages]
  );

  return (
    <InternalOnlySurface
      className="min-h-[440px] border-y border-neutral-1000-a05 bg-bg-default"
      showLabel={false}
    >
      <div className="relative z-20 flex items-start gap-1.5 border-b border-neutral-1000-a10 bg-neutral-1000 px-2.5 py-2 text-neutral-00">
        <Eye className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <div className="text-[11px] font-medium">Harper 내부 전용</div>
          <div className="mt-0.5 text-[10px] font-light text-neutral-00/65">
            아래 정보는 실제 회사 사용자에게 응답하거나 표시하지 않습니다.
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-neutral-1000-a05 bg-bg-default px-1.5">
        {INTERNAL_TABS.map((tab) => (
          <MuteButton
            className={cn(
              "shrink-0 rounded-none border-b-2 px-2.5 text-[10px]",
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
        {activeTab === "insights" ? (
          insightsQuery.isLoading ? (
            <PaneLoading />
          ) : insightsQuery.error || !insightsQuery.data ? (
            <PaneError
              error={insightsQuery.error}
              fallback="인사이트를 불러오지 못했습니다."
            />
          ) : (
            <InsightsTab
              insights={insightsQuery.data.insights}
              mergedChecklist={insightsQuery.data.mergedChecklist}
              preferences={insightsQuery.data.preferences}
              userId={talentId}
            />
          )
        ) : null}

        {activeTab === "messages" ? (
          messagesQuery.isLoading ? (
            <PaneLoading />
          ) : messagesQuery.error || !messagesQuery.data ? (
            <PaneError
              error={messagesQuery.error}
              fallback="대화 내역을 불러오지 못했습니다."
            />
          ) : (
            <MessagesTab messages={messagesQuery.data.messages} />
          )
        ) : null}

        {activeTab === "recommendations" ? (
          recommendationsQuery.isLoading ? (
            <PaneLoading />
          ) : recommendationsQuery.error ? (
            <PaneError
              error={recommendationsQuery.error}
              fallback="추천 내역을 불러오지 못했습니다."
            />
          ) : recommendations.length > 0 ? (
            <div className="space-y-1.5">
              {recommendations.map((item) => (
                <RecommendationRow item={item} key={item.recommendationId} />
              ))}
              {recommendationsQuery.hasNextPage ? (
                <MuteButton
                  className="w-full"
                  disabled={recommendationsQuery.isFetchingNextPage}
                  onClick={() => void recommendationsQuery.fetchNextPage()}
                  size="sm"
                >
                  {recommendationsQuery.isFetchingNextPage ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  더 보기
                </MuteButton>
              ) : null}
            </div>
          ) : (
            <div className="py-9 text-center text-[11px] font-light text-neutral-muted">
              다른 추천 내역이 없습니다.
            </div>
          )
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

              <div className="flex flex-wrap gap-1.5 text-[10px] font-light text-neutral-muted">
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
