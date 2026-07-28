import { LoaderCircle } from "lucide-react";
import { memo } from "react";
import {
  useOpsCareerDetail,
  useOpsCareerInsights,
  useOpsCareerMessages,
} from "@/hooks/ops/useOpsCareer";
import type { CareerTalentDetailResponse } from "@/lib/ops/careerServer";
import { InsightsTab } from "./InsightsTab";
import { MailTab } from "./MailTab";
import { MatchingTab } from "./MatchingTab";
import { MessagesTab } from "./MessagesTab";
import { RecommendationsTab } from "./RecommendationsTab";

export type TalentDetailSharedTabId =
  | "insights"
  | "mail"
  | "matching"
  | "messages"
  | "recommendations";

export const TALENT_DETAIL_SHARED_TABS = [
  { id: "insights", label: "인사이트" },
  { id: "messages", label: "대화 내역" },
  { id: "mail", label: "메일" },
  { id: "recommendations", label: "추천" },
  { id: "matching", label: "매칭" },
] as const satisfies readonly {
  id: TalentDetailSharedTabId;
  label: string;
}[];

function TalentTabLoading() {
  return (
    <div className="flex items-center justify-center py-14">
      <LoaderCircle className="size-5 animate-spin text-neutral-soft" />
    </div>
  );
}

function TalentTabError({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  return (
    <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-2.5 text-[13px] text-critical">
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

export const TalentInsightsTab = memo(function TalentInsightsTab({
  userId,
}: {
  userId: string;
}) {
  const insightsQuery = useOpsCareerInsights(userId);

  if (insightsQuery.isLoading) return <TalentTabLoading />;
  if (insightsQuery.error || !insightsQuery.data) {
    return (
      <TalentTabError
        error={insightsQuery.error}
        fallback="인사이트를 불러오지 못했습니다."
      />
    );
  }

  return (
    <InsightsTab
      key={userId}
      insights={insightsQuery.data.insights}
      mergedChecklist={insightsQuery.data.mergedChecklist}
      preferences={insightsQuery.data.preferences}
      userId={userId}
    />
  );
});

export const TalentMessagesTab = memo(function TalentMessagesTab({
  userId,
}: {
  userId: string;
}) {
  const messagesQuery = useOpsCareerMessages(userId);

  if (messagesQuery.isLoading) return <TalentTabLoading />;
  if (messagesQuery.error || !messagesQuery.data) {
    return (
      <TalentTabError
        error={messagesQuery.error}
        fallback="대화 내역을 불러오지 못했습니다."
      />
    );
  }

  return <MessagesTab key={userId} messages={messagesQuery.data.messages} />;
});

export const TalentMailTab = memo(function TalentMailTab({
  detail,
  userId,
}: {
  detail?: CareerTalentDetailResponse | null;
  userId: string;
}) {
  const detailQuery = useOpsCareerDetail(userId, !detail);
  const resolvedDetail = detail ?? detailQuery.data;

  if (!detail && detailQuery.isLoading) return <TalentTabLoading />;
  if ((!detail && detailQuery.error) || !resolvedDetail) {
    return (
      <TalentTabError
        error={detailQuery.error}
        fallback="메일 정보를 불러오지 못했습니다."
      />
    );
  }

  return <MailTab key={resolvedDetail.userId} detail={resolvedDetail} />;
});

export const TalentRecommendationsTab = memo(function TalentRecommendationsTab({
  userId,
}: {
  userId: string;
}) {
  return <RecommendationsTab key={userId} userId={userId} />;
});

export const TalentMatchingTab = memo(function TalentMatchingTab({
  userId,
}: {
  userId: string;
}) {
  return <MatchingTab key={userId} userId={userId} />;
});

export function TalentDetailSharedTabContent({
  activeTab,
  detail,
  userId,
}: {
  activeTab: TalentDetailSharedTabId;
  detail?: CareerTalentDetailResponse | null;
  userId: string;
}) {
  if (activeTab === "insights") {
    return <TalentInsightsTab userId={userId} />;
  }
  if (activeTab === "messages") {
    return <TalentMessagesTab userId={userId} />;
  }
  if (activeTab === "mail") {
    return <TalentMailTab detail={detail} userId={userId} />;
  }
  if (activeTab === "recommendations") {
    return <TalentRecommendationsTab userId={userId} />;
  }
  return <TalentMatchingTab userId={userId} />;
}
