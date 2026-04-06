import { ArrowRight, BriefcaseBusiness, MessageSquareText } from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  getTalentEngagementLabels,
  getTalentCareerMoveIntentLabel,
} from "@/lib/talentNetworkApplication";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
  careerCx,
} from "./ui/CareerPrimitives";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const formatMatchedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatOpportunityKind = (kind: "match" | "recommendation") =>
  kind === "match" ? "매칭" : "추천";

const isWithinLastWeek = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= ONE_WEEK_MS;
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
  onOpenProfile,
}: {
  onOpenChat: () => void;
  onOpenProfile: () => void;
}) => {
  const {
    user,
    userChatCount,
    talentProfile,
    talentPreferences,
    networkApplication,
    recentOpportunities,
  } = useCareerSidebarContext();

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

  const recentWeeklyOpportunities = useMemo(
    () =>
      recentOpportunities
        .filter((item) => isWithinLastWeek(item.matchedAt))
        .sort(
          (left, right) =>
            Date.parse(right.matchedAt) - Date.parse(left.matchedAt)
        )
        .slice(0, 4),
    [recentOpportunities]
  );

  const startButtonLabel =
    userChatCount > 0 ? "대화 이어가기" : "대화 시작하기";

  return (
    <div className="space-y-16 mt-16">
      <section className="">
        <div className="max-w-[720px]">
          <h2 className="mt-4 font-halant font-semibold text-[1.4rem] leading-none text-beige900 sm:text-[1.8rem]">
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
        <h3 className="font-halant text-[1.6rem] font-medium leading-none text-beige900">
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
          <div className="font-halant text-[1.4rem] font-medium leading-none text-beige900">
            최근 추천된 기회
          </div>
        </div>

        {recentWeeklyOpportunities.length > 0 ? (
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {recentWeeklyOpportunities.map((item) => (
              <a
                key={item.id}
                href={item.href ?? undefined}
                target={item.href ? "_blank" : undefined}
                rel={item.href ? "noreferrer" : undefined}
                className={careerCx(
                  "rounded-[18px] border border-beige900/10 bg-white/45 px-5 py-5 transition-colors",
                  item.href ? "hover:border-beige900/25" : ""
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-beige900/10 bg-beige100/65 px-3 py-1 text-[12px] text-beige900/55">
                    {formatOpportunityKind(item.kind)}
                  </span>
                  <span className="text-[12px] text-beige900/40">
                    {formatMatchedAt(item.matchedAt)}
                  </span>
                </div>
                <div className="mt-4 text-[20px] leading-6 text-beige900">
                  {item.title}
                </div>
                <div className="mt-1 text-[14px] leading-6 text-beige900/50">
                  {item.companyName}
                </div>
                {item.summary ? (
                  <p className="mt-3 text-[14px] leading-6 text-beige900/65">
                    {item.summary}
                  </p>
                ) : null}
                {item.location || item.engagementType ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.location ? (
                      <span className="rounded-full border border-beige900/10 bg-white/60 px-3 py-1 text-[12px] text-beige900/60">
                        {item.location}
                      </span>
                    ) : null}
                    {item.engagementType ? (
                      <span className="rounded-full border border-beige900/10 bg-white/60 px-3 py-1 text-[12px] text-beige900/60">
                        {item.engagementType}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {item.href ? (
                  <div className="mt-5 inline-flex items-center gap-1 text-sm text-beige900/65">
                    자세히 보기
                    <ArrowRight className="h-4 w-4" />
                  </div>
                ) : null}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-beige900/12 bg-white/25 px-4 py-4 text-[15px] font-normal leading-7 text-beige900/45">
            아직 새로 추천된 기회가 아직 없습니다. 새 매칭이 생기면 여기에 최대
            4개까지 표시됩니다.
          </div>
        )}
      </section>
    </div>
  );
};

export default CareerHomePanel;
