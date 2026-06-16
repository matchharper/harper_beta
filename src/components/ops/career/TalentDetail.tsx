import { memo, useState } from "react";
import Image from "next/image";
import { LoaderCircle, MessageSquareText, User } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useOpsCareerDetail,
  useOpsCareerInsights,
  useOpsCareerMessages,
  useOpsCareerProfile,
} from "@/hooks/useOpsCareer";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import {
  formatKst,
  onboardingStatusBadgeClass,
  onboardingStatusLabel,
  profileVisibilityBadgeClass,
  profileVisibilityLabel,
} from "./utils";
import { InsightsTab } from "./InsightsTab";
import { MailTab } from "./MailTab";
import { MessagesTab } from "./MessagesTab";
import { OpsProfileMemoFeed } from "./OpsProfileMemoFeed";
import { ProfileTab } from "./ProfileTab";
import { RecommendationsTab } from "./RecommendationsTab";
import { TalentProgressFeed } from "./TalentProgressFeed";
import {
  TalentGeneralTagsPanel,
  TalentRoleTagsPanel,
} from "./TalentRoleTagsPanel";
import { BareButton } from "@/components/ui/button";
import type { CareerTalentOpsProfileMemo } from "@/lib/opsCareerServer";

type TalentDetailTabId =
  | "all_feed"
  | "insights"
  | "mail"
  | "messages"
  | "profile"
  | "recommendations";

const TALENT_DETAIL_TABS = [
  { id: "all_feed", label: "전체 피드" },
  { id: "insights", label: "인사이트" },
  { id: "messages", label: "대화 내역" },
  { id: "profile", label: "프로필" },
  { id: "mail", label: "메일" },
  { id: "recommendations", label: "추천" },
] as const satisfies readonly {
  id: TalentDetailTabId;
  label: string;
}[];

type TalentDetailProps = {
  userId: string;
};

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-14">
      <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
    </div>
  );
}

function TabError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className={opsTheme.errorNotice}>
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

function TalentAllFeedTab({
  memos,
  userId,
}: {
  memos: CareerTalentOpsProfileMemo[];
  userId: string;
}) {
  return (
    <div className="space-y-4">
      <TalentGeneralTagsPanel userId={userId} />
      <OpsProfileMemoFeed memos={memos} userId={userId} />
      <TalentRoleTagsPanel userId={userId} />
      <section className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-neutral-primary">
            전체 Progress
          </div>
        </div>
        <TalentProgressFeed talentId={userId} showRoleContext />
      </section>
    </div>
  );
}

function TalentInsightsTab({ userId }: { userId: string }) {
  const { data, error, isLoading } = useOpsCareerInsights(userId);
  if (isLoading) return <TabLoading />;
  if (error || !data) {
    return (
      <TabError error={error} fallback="인사이트를 불러오지 못했습니다." />
    );
  }
  return (
    <InsightsTab
      userId={userId}
      insights={data.insights}
      mergedChecklist={data.mergedChecklist}
      preferences={data.preferences}
    />
  );
}

function TalentMessagesTab({ userId }: { userId: string }) {
  const { data, error, isLoading } = useOpsCareerMessages(userId);
  if (isLoading) return <TabLoading />;
  if (error || !data) {
    return (
      <TabError error={error} fallback="대화 내역을 불러오지 못했습니다." />
    );
  }
  return <MessagesTab messages={data.messages} />;
}

function TalentProfileTab({ userId }: { userId: string }) {
  const { data, error, isLoading } = useOpsCareerProfile(userId);
  if (isLoading) return <TabLoading />;
  if (error || !data) {
    return <TabError error={error} fallback="프로필을 불러오지 못했습니다." />;
  }
  return <ProfileTab detail={data} />;
}

export const TalentDetail = memo(function TalentDetail({
  userId,
}: TalentDetailProps) {
  const { data: detail, isLoading, error } = useOpsCareerDetail(userId);
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const [activeTab, setActiveTab] = useState<TalentDetailTabId>("all_feed");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={cx(opsTheme.errorNotice, "m-4")}>
        {error instanceof Error
          ? error.message
          : "데이터를 불러오지 못했습니다."}
      </div>
    );
  }

  if (isEmailExcludedByOpsInternalTerms(detail.email, emailExclusionTerms)) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <MessageSquareText className="h-10 w-10 text-neutral-soft" />
        <div className="mt-4 text-sm text-neutral-muted">
          내부 데이터 제외 설정으로 숨긴 talent입니다.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-5 pt-5 pb-4 border-b border-neutral-1000-a05">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {detail.profilePicture ? (
                <Image
                  src={detail.profilePicture}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-weak">
                  <User className="h-5 w-5 text-neutral-soft" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-base font-medium text-neutral-primary truncate">
                  {detail.name || "이름 없음"}
                </div>
                <div className="text-xs text-neutral-muted truncate">
                  {detail.email ?? "-"}
                </div>
              </div>
            </div>
            {detail.headline ? (
              <div className="mt-2 text-sm text-neutral-muted">
                {detail.headline}
              </div>
            ) : null}
            <div className="mt-2 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-soft">
              <span>
                온보딩:{" "}
                <span
                  className={cx(
                    "rounded px-1.5 py-0.5 font-medium",
                    onboardingStatusBadgeClass(detail.isOnboardingDone)
                  )}
                >
                  {onboardingStatusLabel(detail.isOnboardingDone)}
                </span>
              </span>
              <span>마지막 대화: {formatKst(detail.lastConversationAt)}</span>
              <span>
                공개 범위:{" "}
                <span
                  className={cx(
                    "rounded px-1.5 py-0.5 font-medium",
                    profileVisibilityBadgeClass(
                      detail.preferences?.profileVisibility
                    )
                  )}
                >
                  {profileVisibilityLabel(
                    detail.preferences?.profileVisibility
                  )}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-neutral-1000-a05">
        {TALENT_DETAIL_TABS.map((tab) => (
          <BareButton
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "px-4 py-2.5 text-sm transition",
              activeTab === tab.id
                ? "border-b-2 border-neutral-800 font-medium text-neutral-primary"
                : "text-neutral-muted hover:text-neutral-muted"
            )}
          >
            {tab.label}
          </BareButton>
        ))}
      </div>

      <div className="p-5">
        {activeTab === "all_feed" ? (
          <TalentAllFeedTab
            memos={
              detail.opsProfileMemos ??
              (detail.opsProfileMemo ? [detail.opsProfileMemo] : [])
            }
            userId={detail.userId}
          />
        ) : null}
        {activeTab === "insights" ? (
          <TalentInsightsTab userId={detail.userId} />
        ) : null}
        {activeTab === "messages" ? (
          <TalentMessagesTab userId={detail.userId} />
        ) : null}
        {activeTab === "profile" ? (
          <TalentProfileTab userId={detail.userId} />
        ) : null}
        {activeTab === "mail" ? (
          <MailTab key={detail.userId} detail={detail} />
        ) : null}
        {activeTab === "recommendations" ? (
          <RecommendationsTab key={detail.userId} userId={detail.userId} />
        ) : null}
      </div>
    </div>
  );
});
