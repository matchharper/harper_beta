import { ArrowRight, BriefcaseBusiness, HeartHandshake } from "lucide-react";
import { useMemo, useState } from "react";
import { useCareerHistoryContext } from "@/components/career/CareerSidebarContext";
import { ActionButton } from "@/components/ui/button";
import { getHistoryOpportunityBucket } from "@/hooks/career/careerSessionData";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import React from "react";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const compareRecommendedAtDesc = (
  left: { recommendedAt: string },
  right: { recommendedAt: string }
) => Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt);

const InternalRoleDecisionBanner = ({
  className,
  onConfirm,
  variant,
}: {
  className?: string;
  onConfirm: (roleId: string | null) => void;
  variant: "desktop" | "mobile";
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const [renderedAt] = useState(() => Date.now());
  const { historyOpportunities, historyOpportunityCounts } =
    useCareerHistoryContext();

  const pendingInternalRoles = useMemo(
    () =>
      historyOpportunities
        .filter(
          (item) =>
            getHistoryOpportunityBucket(item) === "new" &&
            (item.sourceType === "internal" || item.isInternal)
        )
        .sort(compareRecommendedAtDesc),
    [historyOpportunities]
  );
  const pendingCount = Math.max(
    historyOpportunityCounts.newInternal,
    pendingInternalRoles.length
  );

  if (pendingCount === 0) return null;

  const primaryRole = pendingInternalRoles[0] ?? null;
  const roleTitle =
    primaryRole?.title.trim() ||
    t(
      "career.home.internal_role_decision_banner.fallback_role",
      "새로운 내부 연결 제안"
    );
  const companyName = primaryRole?.companyName.trim() ?? "";
  const roleTitleWithCompany = companyName
    ? `${roleTitle} at ${companyName}`
    : roleTitle;
  const recommendedAt = primaryRole
    ? Date.parse(primaryRole.recommendedAt)
    : Number.NaN;
  const showWeekOldDescription =
    Number.isFinite(recommendedAt) && renderedAt - recommendedAt >= ONE_WEEK_MS;
  const additionalCount = pendingCount - 1;
  const message =
    additionalCount > 0
      ? t(
          "career.home.internal_role_decision_banner.multiple",
          "{role} 및 {count}개에 대한 결정이 필요합니다.",
          {
            values: {
              count: additionalCount,
              role: roleTitleWithCompany,
            },
          }
        )
      : t(
          "career.home.internal_role_decision_banner.single",
          "{role}에 대한 결정이 필요합니다.",
          {
            values: {
              role: roleTitleWithCompany,
            },
          }
        );
  const weekOldDescription = showWeekOldDescription
    ? [
        t(
          "career.common.internal_connection_acceptance_modal.community_title",
          "Harper는 서로의 시간을 존중하는 멤버들의 커뮤니티입니다."
        ),
        t(
          "career.home.internal_role_decision_banner.week_old_description",
          "빠른 응답과 적절한 피드백은 회사들이 Harper의 추천 인재를 특별히 신뢰하는 이유입니다. 회원님의 응답과 참여 이력은 이후 기회 매칭에 반영되어 빠르게 결정해주실 수록 좋습니다. 거절하신 뒤에도 채용이 종료되지 않았다면 다시 연결을 요청할 수 있습니다."
        ),
      ].join("\n\n")
    : null;

  return (
    <section
      data-testid="internal-role-decision-banner"
      className={cn(
        "cursor-pointer group flex w-full items-start gap-2 rounded-lg border border-neutral-1000/5 bg-primary-faded/60 p-2 text-primary hover:bg-primary-faded transition-colors",
        showWeekOldDescription && "items-start",
        className
      )}
      onClick={() => {
        logCareerEvent(
          variant === "mobile"
            ? "click_mobile_home_internal_role_decision"
            : "click_home_internal_role_decision"
        );
        onConfirm(primaryRole?.roleId ?? null);
      }}
    >
      <span
        aria-hidden="true"
        className="flex p-1 shrink-0 items-center justify-center rounded-md bg-primary text-neutral-00"
      >
        <HeartHandshake className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <div className="flex flex-row w-full items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="break-words mt-1 text-[13px] font-normal leading-4">
            {message}
          </p>
          {weekOldDescription ? (
            <p className="mt-2 whitespace-pre-line break-words text-[12px] font-normal leading-5 text-primary/80">
              {weekOldDescription}
            </p>
          ) : null}
        </div>
        <ActionButton
          actionVariant="secondary"
          className={cn(
            "mt-0 p-0 h-6 md:h-6 shrink-0 border-neutral-00/20 text-xs md:px-2 bg-transparent md:bg-neutral-00/50 text-primary"
          )}
        >
          <span className="hidden md:block">
            {t("career.home.internal_role_decision_banner.confirm", "확인하기")}
          </span>
          <ArrowRight className="h-4 w-4" />
        </ActionButton>
      </div>
    </section>
  );
};

export default React.memo(InternalRoleDecisionBanner);
