import { memo, useState } from "react";
import Image from "next/image";
import { LoaderCircle, MessageSquareText, User } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useOpsCareerDetail } from "@/hooks/useOpsCareer";
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
import { OpsProfileMemoPanel } from "./OpsProfileMemoPanel";
import { ProfileTab } from "./ProfileTab";
import { RecommendationsTab } from "./RecommendationsTab";

type TalentDetailTabId =
  | "insights"
  | "mail"
  | "messages"
  | "profile"
  | "recommendations";

const TALENT_DETAIL_TABS = [
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

export const TalentDetail = memo(function TalentDetail({
  userId,
}: TalentDetailProps) {
  const { data: detail, isLoading, error } = useOpsCareerDetail(userId);
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const [activeTab, setActiveTab] = useState<TalentDetailTabId>("insights");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
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
        <MessageSquareText className="h-10 w-10 text-beige900/15" />
        <div className="mt-4 font-geist text-sm text-beige900/45">
          내부 데이터 제외 설정으로 숨긴 talent입니다.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-5 pt-5 pb-4 border-b border-beige900/10">
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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-beige500/60">
                  <User className="h-5 w-5 text-beige900/40" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-geist text-base font-medium text-beige900 truncate">
                  {detail.name || "이름 없음"}
                </div>
                <div className="font-geist text-xs text-beige900/50 truncate">
                  {detail.email ?? "-"}
                </div>
              </div>
            </div>
            {detail.headline ? (
              <div className="mt-2 font-geist text-sm text-beige900/65">
                {detail.headline}
              </div>
            ) : null}
            <div className="mt-2 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 font-geist text-xs text-beige900/40">
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
          <OpsProfileMemoPanel
            key={detail.userId}
            memos={
              detail.opsProfileMemos ??
              (detail.opsProfileMemo ? [detail.opsProfileMemo] : [])
            }
            userId={detail.userId}
          />
        </div>
      </div>

      <div className="flex border-b border-beige900/10">
        {TALENT_DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "px-4 py-2.5 font-geist text-sm transition",
              activeTab === tab.id
                ? "border-b-2 border-beige900 font-medium text-beige900"
                : "text-beige900/45 hover:text-beige900/70"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === "insights" ? (
          <InsightsTab
            userId={userId}
            insights={detail.insights}
            mergedChecklist={detail.mergedChecklist}
            preferences={detail.preferences}
          />
        ) : null}
        {activeTab === "messages" ? (
          <MessagesTab messages={detail.messages} />
        ) : null}
        {activeTab === "profile" ? <ProfileTab detail={detail} /> : null}
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
