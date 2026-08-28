import { memo, useState } from "react";
import Image from "next/image";
import { LoaderCircle, MessageSquareText, User } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useOpsCareerDetail,
  useOpsCareerProfile,
} from "@/hooks/ops/useOpsCareer";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import {
  externalRecommendationBadgeClass,
  externalRecommendationLabel,
  formatRegisteredLinkLabel,
  formatKst,
  getLinkedinProfileUrl,
  getResumeFileDisplayName,
  normalizeRegisteredLinkHref,
  onboardingStatusBadgeClass,
  onboardingStatusLabel,
  profileVisibilityBadgeClass,
  profileVisibilityLabel,
  talentStatusBadgeClass,
  talentStatusLabel,
} from "./utils";
import { OpsProfileMemoFeed } from "./OpsProfileMemoFeed";
import { ProfileTab } from "./ProfileTab";
import {
  TALENT_DETAIL_SHARED_TABS,
  TalentDetailSharedTabContent,
  type TalentDetailSharedTabId,
} from "./TalentDetailSharedTabs";
import { TalentProgressFeed } from "./TalentProgressFeed";
import {
  TalentGeneralTagsPanel,
  TalentRoleTagsPanel,
} from "./TalentRoleTagsPanel";
import { BareButton } from "@/components/ui/button";
import {
  getTalentProfileLinkImageSrc,
  TalentProfileHeader,
  type TalentProfileResource,
} from "@/components/profile/TalentProfileHeader";
import type {
  CareerTalentOpsProfileMemo,
  CareerTalentProfileResponse,
} from "@/lib/ops/careerServer";

type TalentDetailTabId = "all_feed" | "profile" | TalentDetailSharedTabId;

const TALENT_DETAIL_TABS = [
  { id: "all_feed", label: "전체 피드" },
  ...TALENT_DETAIL_SHARED_TABS.slice(0, 2),
  { id: "profile", label: "프로필" },
  ...TALENT_DETAIL_SHARED_TABS.slice(2),
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
      {/* <TalentGeneralTagsPanel userId={userId} /> */}
      <OpsProfileMemoFeed memos={memos} userId={userId} />
      <TalentRoleTagsPanel userId={userId} />
      <section className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-neutral-primary">
            전체 기록
          </div>
        </div>
        <TalentProgressFeed talentId={userId} showRoleContext />
      </section>
    </div>
  );
}

function TalentProfileTab({
  data,
  error,
  isLoading,
}: {
  data?: CareerTalentProfileResponse;
  error: unknown;
  isLoading: boolean;
}) {
  if (isLoading) return <TabLoading />;
  if (error || !data) {
    return <TabError error={error} fallback="프로필을 불러오지 못했습니다." />;
  }
  return <ProfileTab detail={data} />;
}

function getRegisteredResourceKind(link: string) {
  const normalized = link.trim().toLowerCase();
  if (normalized.includes("linkedin.com")) return "linkedin" as const;
  if (
    normalized.includes("resume") ||
    normalized.includes("cv") ||
    normalized.endsWith(".pdf") ||
    normalized.endsWith(".doc") ||
    normalized.endsWith(".docx")
  ) {
    return "resume" as const;
  }
  return "link" as const;
}

function getRegisteredResourceLabel(link: string) {
  const normalized = link.toLowerCase();
  if (normalized.includes("github.com")) return "GitHub";
  if (
    normalized.includes("portfolio") ||
    normalized.includes("notion.site") ||
    normalized.includes("medium.com")
  ) {
    return "Portfolio";
  }
  if (getRegisteredResourceKind(link) === "resume") return "이력서";
  return "웹사이트";
}

function getProfileResources(profile?: CareerTalentProfileResponse) {
  const primaryResources: TalentProfileResource[] = [];
  const secondaryResources: TalentProfileResource[] = [];
  if (!profile) return { primaryResources, secondaryResources };

  const linkedinUrl = getLinkedinProfileUrl(profile.registeredLinks);
  const registeredResumeUrl = profile.registeredLinks.find(
    (link) => getRegisteredResourceKind(link) === "resume"
  );
  const resumeFileDisplayName = getResumeFileDisplayName(profile);

  if (resumeFileDisplayName) {
    primaryResources.push({
      disabled: !profile.resumeDownloadUrl,
      href: profile.resumeDownloadUrl ?? undefined,
      key: "stored-resume",
      kind: "resume",
      label: "이력서",
      title: profile.resumeDownloadUrl
        ? resumeFileDisplayName
        : `${resumeFileDisplayName} · 열기 링크 없음`,
    });
  } else if (registeredResumeUrl) {
    primaryResources.push({
      href: normalizeRegisteredLinkHref(registeredResumeUrl),
      key: `primary:${registeredResumeUrl}`,
      kind: "resume",
      label: "이력서",
      title: formatRegisteredLinkLabel(registeredResumeUrl),
    });
  }

  if (linkedinUrl) {
    primaryResources.push({
      href: normalizeRegisteredLinkHref(linkedinUrl),
      imageSrc: getTalentProfileLinkImageSrc(linkedinUrl),
      key: `primary:${linkedinUrl}`,
      kind: "linkedin",
      label: "LinkedIn",
      title: formatRegisteredLinkLabel(linkedinUrl),
    });
  }

  profile.registeredLinks
    .filter(
      (link) =>
        link !== linkedinUrl &&
        (resumeFileDisplayName || link !== registeredResumeUrl)
    )
    .forEach((link) => {
      secondaryResources.push({
        href: normalizeRegisteredLinkHref(link),
        imageSrc: getTalentProfileLinkImageSrc(link),
        key: `secondary:${link}`,
        kind: getRegisteredResourceKind(link),
        label: getRegisteredResourceLabel(link),
        title: formatRegisteredLinkLabel(link),
      });
    });

  return { primaryResources, secondaryResources };
}

export const TalentDetail = memo(function TalentDetail({
  userId,
}: TalentDetailProps) {
  const { data: detail, isLoading, error } = useOpsCareerDetail(userId);
  const profileQuery = useOpsCareerProfile(userId);
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

  const { primaryResources, secondaryResources } = getProfileResources(
    profileQuery.data
  );

  return (
    <div>
      <div className="px-5 pt-5 pb-4 border-b border-neutral-1000-a05">
        <TalentProfileHeader
          avatar={
            detail.profilePicture ? (
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
            )
          }
          headline={detail.headline}
          location={profileQuery.data?.location}
          name={detail.name || "이름 없음"}
          primaryResources={primaryResources}
          secondaryResources={secondaryResources}
        />
        <div className="mt-3 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-soft">
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
          <span>가입: {formatKst(detail.createdAt)}</span>
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
              {profileVisibilityLabel(detail.preferences?.profileVisibility)}
            </span>
          </span>
          <span>
            외부 추천:{" "}
            <span
              className={cx(
                "rounded px-1.5 py-0.5 font-medium",
                externalRecommendationBadgeClass(
                  detail.getExternalRecommendation
                )
              )}
            >
              {externalRecommendationLabel(detail.getExternalRecommendation)}
            </span>
          </span>
          <span>
            활성 상태:{" "}
            <span
              className={cx(
                "rounded px-1.5 py-0.5 font-medium",
                talentStatusBadgeClass(detail.status)
              )}
            >
              {talentStatusLabel(detail.status)}
            </span>
          </span>
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
        {activeTab === "profile" ? (
          <TalentProfileTab
            data={profileQuery.data}
            error={profileQuery.error}
            isLoading={profileQuery.isLoading}
          />
        ) : null}
        {activeTab !== "all_feed" && activeTab !== "profile" ? (
          <TalentDetailSharedTabContent
            activeTab={activeTab}
            detail={detail}
            userId={detail.userId}
          />
        ) : null}
      </div>
    </div>
  );
});
