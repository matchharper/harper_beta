import { BriefcaseBusiness, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  getTalentEngagementLabels,
  getTalentCareerMoveIntentLabel,
} from "@/lib/talentNetworkApplication";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
} from "./ui/CareerPrimitives";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerRecentOpportunity,
} from "./types";
import OpportunityListCard from "./history/OpportunityListCard";
import HistoryOpportunityInfoModal from "./history/HistoryOppotunityInfoModal";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const formatMatchedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const isWithinLastWeek = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= ONE_WEEK_MS;
};

const createRecentOpportunityCardItem = ({
  historyItem,
  recentItem,
}: {
  historyItem?: CareerHistoryOpportunity;
  recentItem: CareerRecentOpportunity;
}): CareerHistoryOpportunity => {
  if (historyItem) return historyItem;

  return {
    clickedAt: null,
    companyDescription: null,
    companyHomepageUrl: recentItem.href ?? null,
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    companyName: recentItem.companyName,
    description: recentItem.summary,
    dismissedAt: null,
    employmentTypes: recentItem.engagementType ? [recentItem.engagementType] : [],
    externalJdUrl: recentItem.href ?? null,
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: recentItem.href ?? null,
    id: recentItem.id,
    isAccepted: false,
    isInternal: recentItem.opportunityType !== CareerOpportunityType.ExternalJd,
    kind: recentItem.kind,
    location: recentItem.location,
    opportunityType: recentItem.opportunityType,
    postedAt: null,
    recommendedAt: recentItem.matchedAt,
    recommendationReasons: [],
    roleId: `recent-${recentItem.id}`,
    savedStage: null,
    sourceJobId: null,
    sourceProvider: null,
    sourceType:
      recentItem.opportunityType === CareerOpportunityType.ExternalJd
        ? "external"
        : "internal",
    status: "active",
    title: recentItem.title,
    viewedAt: null,
    workMode: null,
  };
};

const PreferenceRow = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) => (
  <div className="py-2 first:pt-0 last:pb-0">
    <div className="text-[13px] leading-5 text-beige900/45">{label}</div>
    <div className="mt-2 text-[15px] leading-7 text-beige900">{value}</div>
    {hint ? (
      <div className="mt-1 text-[13px] leading-5 text-beige900/45">{hint}</div>
    ) : null}
  </div>
);

const CareerHomePanel = ({
  onOpenChat,
  onOpenHistory,
  onOpenProfile,
}: {
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
}) => {
  const {
    user,
    userChatCount,
    talentProfile,
    talentPreferences,
    networkApplication,
    recentOpportunities,
    historyOpportunities,
  } = useCareerSidebarContext();
  const [infoOpportunityType, setInfoOpportunityType] =
    useState<CareerOpportunityType | null>(null);

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const engagementLabels = useMemo(
    () => getTalentEngagementLabels(talentPreferences?.engagementTypes ?? []),
    [talentPreferences?.engagementTypes]
  );

  const careerMoveIntentLabel =
    talentPreferences?.careerMoveIntentLabel ??
    getTalentCareerMoveIntentLabel(talentPreferences?.careerMoveIntent) ??
    "아직 설정되지 않았습니다.";

  const historyOpportunityById = useMemo(
    () => new Map(historyOpportunities.map((item) => [item.id, item])),
    [historyOpportunities]
  );

  const recentWeeklyOpportunities = useMemo(
    () =>
      recentOpportunities
        .filter((item) => isWithinLastWeek(item.matchedAt))
        .sort(
          (left, right) =>
            Date.parse(right.matchedAt) - Date.parse(left.matchedAt)
        )
        .slice(0, 4)
        .map((item) =>
          createRecentOpportunityCardItem({
            recentItem: item,
            historyItem: historyOpportunityById.get(item.id),
          })
        ),
    [historyOpportunityById, recentOpportunities]
  );

  const startButtonLabel =
    userChatCount > 0 ? "대화 이어가기" : "대화 시작하기";

  return (
    <div className="space-y-16 mt-16">
      <section className="">
        <div className="max-w-[720px]">
          <h2 className="mt-4 font-hedvig font-semibold text-[1.4rem] leading-none text-beige900 sm:text-[1.8rem]">
            Welcome, {displayName}!
          </h2>
          <p className="mt-4 max-w-[620px] text-[15px] leading-7 text-beige900/65">
            Harper와 짧게 대화를 이어가면 지금 보고 싶은 역할, 팀, 이직 타이밍을
            더 정확하게 정리할 수 있습니다.
          </p>
          {networkApplication?.selectedRole ? (
            <div className="mt-5 inline-flex rounded-full border border-beige900/10 bg-beige100/70 px-3 py-1.5 text-sm text-beige900/70">
              현재 보고 싶은 역할: {networkApplication.selectedRole}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <CareerPrimaryButton
              onClick={onOpenChat}
              className="h-11 gap-2 px-5"
            >
              <MessageSquareText className="h-4 w-4" />
              {startButtonLabel}
            </CareerPrimaryButton>
            <CareerSecondaryButton
              onClick={onOpenProfile}
              className="h-11 gap-2 px-5"
            >
              <BriefcaseBusiness className="h-4 w-4" />
              Preference 보기
            </CareerSecondaryButton>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h3 className="font-hedvig text-[1.6rem] font-medium leading-none text-beige900">
          My Preference
        </h3>
        <div className="mt-6">
          <PreferenceRow
            label="선호하는 형태"
            value={
              engagementLabels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {engagementLabels.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-beige900/10 bg-beige100/65 px-3 py-1 text-[13px] leading-5 text-beige900/75"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                "아직 설정되지 않았습니다."
              )
            }
          />
          <PreferenceRow label="이직 의향" value={careerMoveIntentLabel} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="pb-4">
          <div className="font-hedvig text-[1.4rem] font-medium leading-none text-beige900">
            최근 추천된 기회
          </div>
        </div>

        {recentWeeklyOpportunities.length > 0 ? (
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {recentWeeklyOpportunities.map((item) => (
              <OpportunityListCard
                key={item.id}
                item={item}
                pending={false}
                action={
                  <span className="text-[12px] leading-5 text-beige900/45">
                    {formatMatchedAt(item.recommendedAt)}
                  </span>
                }
                onOpenDetail={onOpenHistory}
                onOpenOpportunityInfo={setInfoOpportunityType}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-beige900/12 bg-white/25 px-4 py-4 text-[15px] font-normal leading-7 text-beige900/45">
            아직 새로 추천된 기회가 아직 없습니다. 새 매칭이 생기면 여기에 최대
            4개까지 표시됩니다.
          </div>
        )}
      </section>

      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
      />
    </div>
  );
};

export default CareerHomePanel;
