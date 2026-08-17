import Image from "next/image";
import dynamic from "next/dynamic";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleAlert,
  CircleHelp,
  CircleX,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { opsTheme } from "@/components/ops/theme";
import {
  ProgressFeed,
  type ProgressFeedIcon,
  type ProgressFeedItem,
} from "@/components/progress-feed/ProgressFeed";
import { ConnectionConfirmationEmailFeedCard } from "@/components/progress-feed/ConnectionConfirmationEmailFeedCard";
import { CompanyTalentRequestFeedCard } from "@/components/progress-feed/CompanyTalentRequestFeedCard";
import { OrgIntroEmailFeedCard } from "@/components/progress-feed/OrgIntroEmailFeedCard";
import { BareButton, Button, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AcceptIntroDialog,
  StopCandidateDialog,
} from "@/components/org/OrgCandidateDecisionDialogs";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { formatKst } from "@/components/ops/career/utils";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { PendingConnectionDialog } from "@/components/review-pipeline/PendingConnectionDialog";
import {
  TalentEducationSection,
  TalentExperienceSection,
  TalentExtraSection,
} from "@/components/profile/TalentExperienceSection";
import {
  getTalentProfileLinkImageSrc,
  TalentProfileHeader,
  type TalentProfileResource,
} from "@/components/profile/TalentProfileHeader";
import { useOpsCareerDetail } from "@/hooks/ops/useOpsCareer";
import {
  useCancelOrgCompanyTalentRequest,
  useCreateOrgFeedItem,
  useDeleteOrgFeedItem,
  useOpenOrgResume,
  useUpdateOrgConnectionConfirmationEmail,
  useUpdateOrgFeedItem,
} from "@/hooks/org/useOrg";
import {
  useOrgJobsCandidateActions,
  useOrgJobsDetail,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";
import { useOrgInternalTalentSystem } from "@/hooks/org/useOrgInternalTalent";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { CareerTalentOpsProfileMemo } from "@/lib/ops/careerServer";
import { extractEmailAddress } from "@/lib/email/parse";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import type { OrgInternalTalentSystemResponse } from "@/lib/org/internalTalentTypes";
import { canStopOrgCandidateProcess } from "@/lib/org/candidateDecision";
import { getOrgTalentDetailNavigationState } from "@/lib/org/detailNavigation";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import type { OrgCompanyCriterionFitness } from "@/lib/org/companyCriteriaEvaluations";
import { cn } from "@/lib/utils";
import Face from "../common/Face";

type ResourceLinkKind =
  | "github"
  | "linkedin"
  | "portfolio"
  | "resume"
  | "other";

const RESOURCE_LINK_KIND_ORDER: Record<ResourceLinkKind, number> = {
  resume: 0,
  linkedin: 1,
  github: 2,
  portfolio: 3,
  other: 4,
};

const OrgInternalTalentPanel = dynamic(
  () => import("@/components/org/internal/OrgInternalTalentPanel"),
  {
    loading: () => (
      <div className="flex min-h-56 items-center justify-center text-[13px] font-light text-neutral-muted">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        내부 데이터를 불러오는 중
      </div>
    ),
    ssr: false,
  }
);

function TalentAvatar({ name, src }: { name: string; src?: string | null }) {
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        src={profilePicture}
        alt=""
        width={64}
        height={64}
        unoptimized
        onError={() => setFailedImageSrc(profilePicture)}
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function normalizeLinkHref(link: string) {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function formatLinkLabel(link: string) {
  try {
    const url = new URL(normalizeLinkHref(link));
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return link;
  }
}

function getResourceLinkKind(link: string): ResourceLinkKind {
  const normalized = link.trim().toLowerCase();
  if (normalized.includes("linkedin.com")) return "linkedin";
  if (normalized.includes("github.com")) return "github";
  if (
    normalized.includes("resume") ||
    normalized.includes("cv") ||
    normalized.endsWith(".pdf") ||
    normalized.endsWith(".doc") ||
    normalized.endsWith(".docx")
  ) {
    return "resume";
  }
  if (
    normalized.includes("portfolio") ||
    normalized.includes("notion.site") ||
    normalized.includes("medium.com")
  ) {
    return "portfolio";
  }
  return "other";
}

function getResourceLinkLabel(kind: ResourceLinkKind) {
  switch (kind) {
    case "linkedin":
      return "LinkedIn";
    case "github":
      return "GitHub";
    case "portfolio":
      return "Portfolio";
    case "resume":
      return "이력서";
    default:
      return "웹사이트";
  }
}

function ProfileSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <div className="mb-2 text-[12px] text-neutral-muted">{title}</div>
      {children}
    </section>
  );
}

const profileMarkdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className={opsTheme.link}>
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mt-4 text-[16px] font-medium first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 text-[15px] font-medium first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 text-[13px] font-medium first:mt-0">{children}</h3>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
};

function MarkdownProfile({ value }: { value: string }) {
  if (!value.trim()) {
    return <div className="text-[13px] text-neutral-muted">-</div>;
  }

  return (
    <div className="space-y-3 text-[13px] leading-6 text-neutral-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={profileMarkdownComponents}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

const criteriaFitnessMeta: Record<
  OrgCompanyCriterionFitness,
  {
    icon: typeof CircleCheck;
    iconClassName: string;
    label: string;
  }
> = {
  excellent: {
    icon: BadgeCheck,
    iconClassName: "bg-positive-faded text-positive",
    label: "매우 잘 맞음",
  },
  good: {
    icon: CircleCheck,
    iconClassName: "bg-positive-faded text-positive",
    label: "잘 맞음",
  },
  uncertain: {
    icon: CircleHelp,
    iconClassName: "bg-info-faded text-info",
    label: "추가 확인 필요",
  },
  bad: {
    icon: CircleX,
    iconClassName: "bg-critical-faded text-critical",
    label: "맞지 않음",
  },
};

function CompanyCriteriaEvaluations({
  evaluations,
}: {
  evaluations: OrgTalentDetailResponse["recommendation"]["criteriaEvaluations"];
}) {
  if (evaluations.length === 0) return null;

  return (
    <section
      aria-labelledby="company-criteria-evaluations-title"
      className="mt-8"
    >
      {/* <h2
        className="text-[15px] font-medium text-neutral-primary"
        id="company-criteria-evaluations-title"
      >
        평가 기준
      </h2> */}
      <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 font-normal">
        {evaluations.map((evaluation, index) => {
          const meta = criteriaFitnessMeta[evaluation.fitness];
          const Icon = meta.icon;
          return (
            <article key={`${evaluation.name}:${index}`} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-label={meta.label}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-sm",
                    meta.iconClassName
                  )}
                  role="img"
                  title={meta.label}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <h3 className="min-w-0 text-[14px] leading-5 text-black">
                  {evaluation.name}
                </h3>
              </div>
              <p className="mt-1.5 text-[13px] leading-[22px] text-black/60">
                {evaluation.content}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HarperMemoSection({
  error,
  isLoading,
  memos,
}: {
  error: Error | null;
  isLoading: boolean;
  memos: CareerTalentOpsProfileMemo[];
}) {
  const sortedMemos = [...memos].sort((left, right) =>
    (right.updatedAt ?? right.createdAt ?? "").localeCompare(
      left.updatedAt ?? left.createdAt ?? ""
    )
  );

  return (
    <InternalOnlySurface
      className="rounded-md bg-positive-faded px-4 py-4"
      showLabel={false}
    >
      <div className="relative z-20">
        <div className="text-[14px] font-medium text-neutral-primary">
          Harper 메모
        </div>
        {isLoading ? (
          <div className="mt-3 flex items-center text-[13px] text-neutral-muted">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            메모를 불러오는 중
          </div>
        ) : error ? (
          <div className="mt-3 text-[13px] leading-5 text-critical">
            {error.message}
          </div>
        ) : sortedMemos.length > 0 ? (
          <div className="mt-3 space-y-3">
            {sortedMemos.map((memo) => (
              <div key={memo.id}>
                <div className="whitespace-pre-wrap text-[14px] leading-6 text-neutral-primary">
                  {memo.content}
                </div>
                <div className="mt-1 text-[12px] text-neutral-muted">
                  {formatKst(memo.updatedAt ?? memo.createdAt)}
                  {memo.updatedBy ? ` · ${memo.updatedBy}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[13px] text-neutral-muted">
            등록된 Harper 메모가 없습니다.
          </div>
        )}
      </div>
    </InternalOnlySurface>
  );
}

function SystemActivitySummary({
  account,
  error,
  isLoading,
}: {
  account?: OrgInternalTalentSystemResponse["account"];
  error: Error | null;
  isLoading: boolean;
}) {
  const metrics = [
    { label: "가입 날짜", value: account?.createdAt },
    { label: "최근 로그인", value: account?.lastLoginAt },
    { label: "최근 사용", value: account?.lastActiveAt },
  ];

  return (
    <InternalOnlySurface
      className="rounded-sm border border-neutral-1000-a05 bg-bg-weak/70 px-3 py-2"
      showLabel={false}
    >
      <div className="relative z-20">
        {isLoading ? (
          <div className="flex items-center text-[11px] text-neutral-soft">
            <LoaderCircle className="mr-1.5 size-3 animate-spin" />
            시스템 활동을 불러오는 중
          </div>
        ) : error ? (
          <div className="text-[11px] text-neutral-soft">
            시스템 활동을 불러오지 못했습니다.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-4 text-neutral-muted">
            {metrics.map((metric) => (
              <span className="whitespace-nowrap" key={metric.label}>
                <span className="font-medium text-neutral-primary">
                  {metric.label}
                </span>{" "}
                {formatKstRelativeDate(metric.value)}
              </span>
            ))}
          </div>
        )}
      </div>
    </InternalOnlySurface>
  );
}

function ProfilePane({
  acceptDisabled,
  currentStage,
  decisionPending,
  detail,
  onAcceptClick,
  onMoveToPendingConnection,
  onRejectClick,
  onResumeClick,
}: {
  acceptDisabled?: boolean;
  currentStage: OrgTalentDetailResponse["recommendation"]["stage"];
  decisionPending?: boolean;
  detail: OrgTalentDetailResponse;
  onAcceptClick?: () => void;
  onMoveToPendingConnection?: () => void;
  onRejectClick?: () => void;
  onResumeClick: (
    kind: "storage" | "link" | "document",
    link?: string | null,
    documentId?: string | null
  ) => void;
}) {
  const name = detail.talent.name || detail.talent.email || "이름 없음";
  const registeredLinks = detail.profile.registeredLinks.length
    ? detail.profile.registeredLinks
    : detail.resume.links;
  const resourceLinks = [...registeredLinks].sort((left, right) => {
    const leftKind = getResourceLinkKind(left);
    const rightKind = getResourceLinkKind(right);
    return (
      RESOURCE_LINK_KIND_ORDER[leftKind] -
        RESOURCE_LINK_KIND_ORDER[rightKind] || left.localeCompare(right)
    );
  });
  const primaryResumeLink = resourceLinks.find(
    (link) => getResourceLinkKind(link) === "resume"
  );
  const primaryLinkedinLink = resourceLinks.find(
    (link) => getResourceLinkKind(link) === "linkedin"
  );
  const primaryResources: TalentProfileResource[] = [];

  if (detail.resume.hasStorageFile) {
    primaryResources.push({
      key: "stored-resume",
      kind: "resume",
      label: "이력서",
      onClick: () => onResumeClick("storage"),
      title: detail.resume.fileName ?? "저장된 이력서 파일",
    });
  } else if (primaryResumeLink) {
    primaryResources.push({
      key: `primary:${primaryResumeLink}`,
      kind: "resume",
      label: "이력서",
      onClick: () => onResumeClick("link", primaryResumeLink),
      title: formatLinkLabel(primaryResumeLink),
    });
  }

  if (primaryLinkedinLink) {
    primaryResources.push({
      href: normalizeLinkHref(primaryLinkedinLink),
      key: `primary:${primaryLinkedinLink}`,
      imageSrc: getTalentProfileLinkImageSrc(primaryLinkedinLink),
      kind: "linkedin",
      label: "LinkedIn",
      title: formatLinkLabel(primaryLinkedinLink),
    });
  }

  const secondaryResources: TalentProfileResource[] = [
    ...detail.profile.documents.map((document) => ({
      key: `document:${document.id}`,
      kind: "document" as const,
      label: document.fileName || "공개 문서",
      onClick: () => onResumeClick("document", null, document.id),
      title: document.fileName,
    })),
    ...resourceLinks
      .filter(
        (link) =>
          link !== primaryLinkedinLink &&
          (detail.resume.hasStorageFile || link !== primaryResumeLink)
      )
      .map((link) => {
        const kind = getResourceLinkKind(link);
        const isResumeLink = kind === "resume";
        return {
          href: isResumeLink ? undefined : normalizeLinkHref(link),
          imageSrc: isResumeLink
            ? undefined
            : getTalentProfileLinkImageSrc(link),
          key: `secondary:${link}`,
          kind: kind === "linkedin" || kind === "resume" ? kind : "link",
          label: getResourceLinkLabel(kind),
          onClick: isResumeLink ? () => onResumeClick("link", link) : undefined,
          title: formatLinkLabel(link),
        } satisfies TalentProfileResource;
      }),
  ];
  const hasProfileContent = Boolean(
    detail.profile.bio ||
    detail.profile.location ||
    detail.profile.experiences.length ||
    detail.profile.educations.length ||
    detail.profile.extras.length
  );

  return (
    <div className="min-w-0 space-y-7 px-2">
      <TalentProfileHeader
        avatar={<TalentAvatar name={name} src={detail.talent.profilePicture} />}
        headline={detail.talent.headline}
        location={detail.profile.location}
        name={name}
        primaryResources={primaryResources}
        secondaryResources={secondaryResources}
      />

      <CandidateDecisionActions
        acceptDisabled={acceptDisabled}
        candidateName={name}
        className="lg:hidden"
        currentStage={currentStage}
        decisionPending={decisionPending}
        onAcceptClick={onAcceptClick}
        onMoveToPendingConnection={onMoveToPendingConnection}
        onRejectClick={onRejectClick}
      />

      <ProfileSection title="">
        <div className="pt-2 flex items-center gap-2 text-[15px] text-neutral-900">
          <Face size={24} />
          Harper의 추천 이유
        </div>
        <div className="mt-4 mb-10">
          {detail.recommendation.fitSummary ||
          detail.recommendation.fitReasons.length > 0 ? (
            <div className="space-y-2">
              {detail.recommendation.fitSummary ? (
                <div className="border-l-2 border-primary px-3 text-[13px] leading-6 text-neutral-primary">
                  {detail.recommendation.fitSummary}
                </div>
              ) : null}
              {detail.recommendation.fitReasons.length > 0 ? (
                <ul className="space-y-1.5 text-[13px] leading-6 text-neutral-muted">
                  {detail.recommendation.fitReasons.map((reason) => (
                    <li key={reason} className="ml-4 list-disc">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="text-[13px] text-neutral-soft">-</div>
          )}
          <CompanyCriteriaEvaluations
            evaluations={detail.recommendation.criteriaEvaluations}
          />
        </div>
      </ProfileSection>

      {detail.profile.bio ? (
        <ProfileSection title="소개">
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-neutral-primary">
            {detail.profile.bio.trim()}
          </div>
        </ProfileSection>
      ) : null}

      <TalentExperienceSection experiences={detail.profile.experiences} />

      <TalentEducationSection educations={detail.profile.educations} />

      <TalentExtraSection extras={detail.profile.extras} />

      {!hasProfileContent && detail.profileMarkdown ? (
        <ProfileSection title="프로필">
          <MarkdownProfile value={detail.profileMarkdown} />
        </ProfileSection>
      ) : null}
    </div>
  );
}

function CandidateDecisionActions({
  acceptDisabled,
  candidateName,
  className,
  currentStage,
  decisionPending,
  onAcceptClick,
  onMoveToPendingConnection,
  onRejectClick,
}: {
  acceptDisabled?: boolean;
  candidateName: string;
  className?: string;
  currentStage: OrgTalentDetailResponse["recommendation"]["stage"];
  decisionPending?: boolean;
  onAcceptClick?: () => void;
  onMoveToPendingConnection?: () => void;
  onRejectClick?: () => void;
}) {
  if (currentStage === "process_stopped") return null;

  if (currentStage === "accepted") {
    if (!onMoveToPendingConnection) return null;
    return (
      <section
        aria-label="연결 대기 상태로 이동"
        className={cn("rounded-md bg-bg-weak px-4 py-4", className)}
      >
        <div className="text-[16px] font-medium text-neutral-primary">
          연결 대기 상태로 옮기시겠습니까?
        </div>
        <p className="mt-1 text-[13px] font-normal leading-5 text-neutral-muted">
          회사 측의 페이지에 현재 후보자가 표시되며, 회사 측에서 연결을 받을지
          결정하는 단계로 넘어갑니다.
        </p>
        <MuteButton
          className="mt-4"
          disabled={decisionPending}
          onClick={onMoveToPendingConnection}
          size="md"
          type="button"
          variant="primary"
        >
          연결 대기로 이동
        </MuteButton>
      </section>
    );
  }

  if (
    currentStage !== "pending_connection" &&
    canStopOrgCandidateProcess(currentStage)
  ) {
    if (!onRejectClick) return null;
    return (
      <section
        aria-label="진행 중인 후보자 연결 종료"
        className={cn("rounded-md bg-critical-faded px-4 py-4", className)}
      >
        <div className="text-[16px] font-medium text-critical">
          진행 중인 프로세스를 종료하시겠습니까?
        </div>
        <p className="mt-1 text-[13px] font-normal leading-5 text-neutral-muted">
          종료하면 현재 단계에서 프로세스를 닫고, Harper가 후보자에게 적절히
          안내합니다.
        </p>
        <MuteButton
          className="mt-4"
          disabled={decisionPending}
          onClick={onRejectClick}
          size="md"
          type="button"
          variant="warn"
        >
          연결 종료하기
        </MuteButton>
      </section>
    );
  }

  if (
    currentStage !== "pending_connection" ||
    (!onAcceptClick && !onRejectClick)
  ) {
    return null;
  }

  return (
    <section
      aria-label="후보자 연결 결정"
      className={cn("rounded-md bg-critical-faded px-4 py-4", className)}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 text-critical">
          <CircleAlert className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-medium text-critical">
            결정이 필요합니다
          </div>
          <p className="mt-1 text-[13px] font-normal leading-5 text-neutral-muted">
            {candidateName} 후보자와 연결을 진행할지 결정해 주세요.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MuteButton
          type="button"
          size="md"
          variant="primary"
          onClick={onAcceptClick}
          disabled={decisionPending || acceptDisabled || !onAcceptClick}
          className="min-h-10 w-full"
        >
          이 후보자를 만나보겠습니다
        </MuteButton>
        <MuteButton
          type="button"
          size="md"
          variant="warn"
          onClick={onRejectClick}
          disabled={decisionPending || !onRejectClick}
          className="min-h-10 w-full"
        >
          이번에는 연결받지 않겠습니다
        </MuteButton>
      </div>
    </section>
  );
}

function getOrgFeedTitle(kind: string) {
  if (kind === "org_note") return "메모";
  if (kind === "org_acceptance" || kind === "talent_recommendation_accepted") {
    return "수락";
  }
  if (kind === "org_rejection" || kind === "talent_recommendation_rejected") {
    return "거절";
  }
  if (kind === "org_stage_change") return "상태 변경";
  if (kind === "org_resume_opened") return "이력서 열람";
  return "활동";
}

function getOrgFeedIcon(kind: string): ProgressFeedIcon {
  if (kind === "org_acceptance" || kind === "talent_recommendation_accepted") {
    return "check";
  }
  if (kind === "org_rejection" || kind === "talent_recommendation_rejected") {
    return "x";
  }
  if (kind === "org_stage_change") return "note";
  if (kind === "org_resume_opened") return "eye";
  return "note";
}

function getOrgEmailAddressLabel(
  value: string | null | undefined,
  detail: OrgTalentDetailResponse
) {
  const rawValue = String(value ?? "").trim();
  const email = extractEmailAddress(rawValue)?.toLowerCase() ?? "";
  const talentEmail = detail.talent.email?.trim().toLowerCase() ?? "";
  const member = detail.members.find(
    (item) => item.email?.trim().toLowerCase() === email
  );
  const explicitName = rawValue
    .match(/^\s*([^<]+?)\s*</)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  const name =
    (email && email === talentEmail ? detail.talent.name : null) ||
    member?.name ||
    explicitName ||
    null;

  if (name && email && name.toLowerCase() !== email) {
    return `${name} · ${email}`;
  }
  return email || name || rawValue || "발신자 정보 없음";
}

function FeedPane({
  canManageCandidates,
  currentUserId,
  decisionActions,
  detail,
  internalOpsAccess,
  talentId,
  workspaceId,
}: {
  canManageCandidates: boolean;
  currentUserId?: string | null;
  decisionActions?: ReactNode;
  detail: OrgTalentDetailResponse;
  internalOpsAccess: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const { detailQuery } = useOrgJobsDetail();
  const [draft, setDraft] = useState("");
  const [pollingQueueId, setPollingQueueId] = useState<string | null>(null);
  const createFeed = useCreateOrgFeedItem();
  const updateFeed = useUpdateOrgFeedItem();
  const deleteFeed = useDeleteOrgFeedItem();
  const cancelCompanyRequest = useCancelOrgCompanyTalentRequest();
  const updateConnectionEmail = useUpdateOrgConnectionConfirmationEmail();
  const trimmedDraft = draft.trim();
  const refetchDetail = detailQuery.refetch;
  const pendingConnectionQueueId =
    updateConnectionEmail.variables?.queueId ?? null;
  const pendingCompanyRequestId =
    cancelCompanyRequest.variables?.requestId ?? null;
  const cancelCompanyRequestMutate = cancelCompanyRequest.mutate;

  useEffect(() => {
    if (!pollingQueueId) return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      const result = await refetchDetail();
      const current = result.data?.connectionConfirmationEmails.find(
        (item) => item.id === pollingQueueId
      );
      if (
        !cancelled &&
        current &&
        current.status !== "scheduled" &&
        current.status !== "sending"
      ) {
        setPollingQueueId(null);
      }
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollingQueueId, refetchDetail]);

  const pendingConnectionAction =
    updateConnectionEmail.variables?.action ?? null;
  const updateConnectionEmailMutate = updateConnectionEmail.mutate;
  const feedItems = useMemo<ProgressFeedItem[]>(
    () =>
      [
        ...detail.feed.map((item) => ({
          actor: item.actor,
          createdAt: item.createdAt,
          deletable:
            canManageCandidates &&
            item.kind === "org_note" &&
            item.companyUserId === currentUserId,
          editable:
            canManageCandidates &&
            item.kind === "org_note" &&
            item.companyUserId === currentUserId,
          icon: getOrgFeedIcon(item.kind),
          id: item.id,
          text: item.text,
          title: getOrgFeedTitle(item.kind),
        })),
        ...detail.connectionConfirmationEmails.map((item) => {
          const pendingAction =
            updateConnectionEmail.isPending &&
            pendingConnectionQueueId === item.id
              ? pendingConnectionAction
              : null;
          return {
            createdAt: item.sentAt ?? item.createdAt,
            customContent: (
              <ConnectionConfirmationEmailFeedCard
                item={item}
                onCancel={
                  canManageCandidates
                    ? () =>
                        updateConnectionEmailMutate({
                          action: "cancel",
                          queueId: item.id,
                          roleId: item.roleId ?? detail.role.roleId,
                          talentId: item.talentId,
                          workspaceId,
                        })
                    : undefined
                }
                onSendNow={
                  canManageCandidates
                    ? () =>
                        updateConnectionEmailMutate(
                          {
                            action: "send_now",
                            queueId: item.id,
                            roleId: item.roleId ?? detail.role.roleId,
                            talentId: item.talentId,
                            workspaceId,
                          },
                          {
                            onSuccess: () => setPollingQueueId(item.id),
                          }
                        )
                    : undefined
                }
                pendingAction={pendingAction}
              />
            ),
            id: `connection-email:${item.id}`,
            text: "",
          };
        }),
        ...detail.companyRequestHistory.map((item) => ({
          createdAt: item.sentAt ?? item.cancelledAt ?? item.createdAt,
          customContent: (
            <CompanyTalentRequestFeedCard
              item={item}
              onCancel={
                canManageCandidates && item.canCancel
                  ? () =>
                      cancelCompanyRequestMutate({
                        requestId: item.id,
                        roleId: item.roleId,
                        talentId: talentId ?? detail.talent.userId,
                        workspaceId,
                      })
                  : undefined
              }
              pending={
                cancelCompanyRequest.isPending &&
                pendingCompanyRequestId === item.id
              }
            />
          ),
          id: `company-request:${item.id}`,
          text: "",
        })),
        ...(internalOpsAccess
          ? detail.introEmails.map((item) => ({
              createdAt: item.createdAt,
              customContent: (
                <OrgIntroEmailFeedCard
                  item={item}
                  recipientLabels={item.toEmails.map((email) =>
                    getOrgEmailAddressLabel(email, detail)
                  )}
                  senderLabel={getOrgEmailAddressLabel(item.fromEmail, detail)}
                />
              ),
              id: `org-intro-email:${item.id}`,
              text: "",
            }))
          : []),
      ].sort((left, right) => {
        const leftTime = Date.parse(left.createdAt);
        const rightTime = Date.parse(right.createdAt);
        return (
          (Number.isFinite(rightTime) ? rightTime : 0) -
          (Number.isFinite(leftTime) ? leftTime : 0)
        );
      }),
    [
      canManageCandidates,
      cancelCompanyRequest.isPending,
      cancelCompanyRequestMutate,
      currentUserId,
      detail,
      internalOpsAccess,
      pendingCompanyRequestId,
      pendingConnectionAction,
      pendingConnectionQueueId,
      updateConnectionEmail.isPending,
      updateConnectionEmailMutate,
      talentId,
      workspaceId,
    ]
  );

  return (
    <div className="min-w-0 space-y-2.5">
      {decisionActions ? (
        <div className="sticky top-0 z-20 -mx-1 bg-bg-default px-1 pb-1">
          {decisionActions}
        </div>
      ) : null}
      <div className="text-[14px] font-medium text-neutral-primary">피드</div>
      <ProgressFeed
        actionsVariant="menu"
        deleteConfirmMessage="이 메모를 삭제할까요?"
        deleteError={
          deleteFeed.error instanceof Error ? deleteFeed.error : null
        }
        draft={draft}
        editError={updateFeed.error instanceof Error ? updateFeed.error : null}
        emptyLabel="아직 피드가 없습니다."
        items={feedItems}
        onDelete={
          canManageCandidates
            ? (item) => {
                if (deleteFeed.isPending) return;
                deleteFeed.mutate({
                  progressId: item.id,
                  workspaceId,
                });
              }
            : undefined
        }
        onDraftChange={canManageCandidates ? setDraft : undefined}
        onEdit={
          canManageCandidates
            ? async (item, text) => {
                await updateFeed.mutateAsync({
                  progressId: item.id,
                  text,
                  workspaceId,
                });
              }
            : undefined
        }
        onSubmit={
          canManageCandidates
            ? () => {
                if (!talentId || !trimmedDraft || createFeed.isPending) return;
                createFeed.mutate(
                  {
                    recommendationId: detail.recommendation.recommendationId,
                    roleId: detail.role.roleId,
                    talentId,
                    text: trimmedDraft,
                    workspaceId,
                  },
                  {
                    onSuccess: () => setDraft(""),
                  }
                );
              }
            : undefined
        }
        pendingDeleteId={deleteFeed.variables?.progressId ?? null}
        pendingEditId={updateFeed.variables?.progressId ?? null}
        pendingSubmit={createFeed.isPending}
        placeholder="이 후보자에 대한 메모를 남겨주세요. 알려주신 피드백은 다음 연결에 반영됩니다."
        submitError={
          createFeed.error instanceof Error ? createFeed.error : null
        }
      />
      {updateConnectionEmail.error ? (
        <div className={opsTheme.errorNotice}>
          {updateConnectionEmail.error instanceof Error
            ? updateConnectionEmail.error.message
            : "메일 상태를 변경하지 못했습니다."}
        </div>
      ) : null}
      {cancelCompanyRequest.error ? (
        <div className={opsTheme.errorNotice}>
          {cancelCompanyRequest.error instanceof Error
            ? cancelCompanyRequest.error.message
            : "후보자 문의를 취소하지 못했습니다."}
        </div>
      ) : null}
    </div>
  );
}

export function TalentDetailSimpleView() {
  const {
    closeTalentDetail,
    selectTalent,
    talentNavigationItems,
    talentNavigationLabel,
    workspaceId,
  } = useOrgJobsNavigation();
  const {
    activeDetailRecommendationId,
    activeDetailRoleId,
    activeDetailTalentId,
    detailOpen,
    detailQuery,
    selectedAcceptStageId,
  } = useOrgJobsDetail();
  const {
    acceptTalent,
    isCandidateStagePending,
    moveTalentToPendingConnection,
    rejectTalent,
  } = useOrgJobsCandidateActions();
  const {
    bootstrap,
    currentUser,
    currentUserEmail,
    internalOpsAccess,
    permissions,
    user,
    workspace,
  } = useOrgWorkspace();
  const detail = detailQuery.data;
  const members = detail?.members ?? bootstrap.members;
  const acceptStageId = selectedAcceptStageId;
  const canManageCandidates = permissions.canManageCandidates;
  const companyName = detail?.workspace.companyName ?? workspace.companyName;
  const currentUserId = currentUser?.userId ?? user.id;
  const decisionPending = Boolean(
    activeDetailRoleId &&
    activeDetailTalentId &&
    isCandidateStagePending({
      roleId: activeDetailRoleId,
      talentId: activeDetailTalentId,
    })
  );
  const error = detailQuery.error instanceof Error ? detailQuery.error : null;
  const isLoading = detailQuery.isLoading;
  const onAcceptCandidate = canManageCandidates ? acceptTalent : undefined;
  const onClose = closeTalentDetail;
  const onRejectCandidate = canManageCandidates ? rejectTalent : undefined;
  const onRetry = () => void detailQuery.refetch();
  const open = detailOpen;
  const talentId = activeDetailTalentId || null;
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [pendingConnectionDialogOpen, setPendingConnectionDialogOpen] =
    useState(false);
  const [mobileTab, setMobileTab] = useState<"profile" | "feed">("profile");
  const [profileTab, setProfileTab] = useState<"internal" | "profile">(
    "profile"
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [resumeRequest, setResumeRequest] = useState<{
    documentId?: string | null;
    kind: "storage" | "link" | "document";
    link?: string | null;
  } | null>(null);
  const [resumeError, setResumeError] = useState("");
  const openResume = useOpenOrgResume();
  const harperMemoQuery = useOpsCareerDetail(
    talentId,
    Boolean(open && internalOpsAccess && talentId && profileTab === "internal")
  );
  const systemActivityQuery = useOrgInternalTalentSystem({
    enabled: Boolean(
      open && internalOpsAccess && talentId && profileTab === "internal"
    ),
    talentId,
    workspaceId,
  });
  const harperMemoError =
    harperMemoQuery.error instanceof Error ? harperMemoQuery.error : null;
  const harperMemos = harperMemoQuery.data?.opsProfileMemos ?? [];
  const systemActivityError =
    systemActivityQuery.error instanceof Error
      ? systemActivityQuery.error
      : null;
  const { markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
  const onMoveToPendingConnection = canManageCandidates
    ? () => setPendingConnectionDialogOpen(true)
    : undefined;

  const handleConfirmResume = () => {
    if (!resumeRequest || !talentId) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setResumeError(
        "새 창을 열지 못했습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요."
      );
      return;
    }
    popup.opener = null;
    setResumeError("");
    openResume.mutate(
      {
        documentId: resumeRequest.documentId ?? null,
        kind: resumeRequest.kind,
        link: resumeRequest.link ?? null,
        talentId,
        workspaceId,
      },
      {
        onError: (requestError) => {
          popup.close();
          setResumeError(
            requestError instanceof Error
              ? requestError.message
              : "이력서를 열지 못했습니다. 다시 시도해 주세요."
          );
        },
        onSuccess: (payload) => {
          popup.location.href = payload.url;
          setResumeRequest(null);
          setResumeError("");
        },
      }
    );
  };

  const closeResumeDialog = () => {
    if (openResume.isPending) return;
    setResumeRequest(null);
    setResumeError("");
    openResume.reset();
  };

  if (!open) return null;

  const title =
    detail?.talent.name ||
    detail?.talent.email ||
    (isLoading ? "Talent" : "Talent");
  const subtitle = detail
    ? `${companyName} · ${detail.role.name}`
    : companyName;
  const detailNavigation = getOrgTalentDetailNavigationState(
    talentNavigationItems,
    {
      recommendationId: activeDetailRecommendationId,
      roleId: activeDetailRoleId,
      talentId: activeDetailTalentId,
    }
  );
  const navigateToTalent = (
    target: (typeof talentNavigationItems)[number] | null
  ) => {
    if (!target) return;
    markViewed(target.recommendationId);
    selectTalent(target, talentNavigationItems, talentNavigationLabel);
  };

  return (
    <>
      <div className="fixed inset-0 z-[70]">
        <BareButton
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute inset-0 h-full w-full cursor-default bg-black/35"
        />
        <div
          role="dialog"
          aria-modal="true"
          className="absolute bottom-0 right-0 top-0 flex w-full min-w-0 flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)] animate-in slide-in-from-right-6 duration-200 sm:w-[92vw] lg:w-[90vw]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3 font-normal">
            {detailNavigation ? (
              <div className="flex min-w-0 items-center gap-3">
                <div
                  aria-label={`후보자 ${detailNavigation.position} / ${detailNavigation.total}`}
                  className="inline-flex shrink-0 overflow-hidden rounded-sm bg-bg-weak font-normal"
                  role="group"
                >
                  <MuteButton
                    aria-label="이전 후보자"
                    className="rounded-none border-0 border-r border-neutral-1000-a10 shadow-none"
                    disabled={!detailNavigation.previous}
                    onClick={() => navigateToTalent(detailNavigation.previous)}
                    size="md"
                    variant="transparent"
                  >
                    <ChevronLeft aria-hidden className="size-4" />
                  </MuteButton>
                  <div
                    aria-live="polite"
                    className="flex min-w-16 items-center justify-center px-3 text-[14px] font-normal tabular-nums text-neutral-primary"
                  >
                    {detailNavigation.position} / {detailNavigation.total}
                  </div>
                  <MuteButton
                    aria-label="다음 후보자"
                    className="rounded-none border-0 border-l border-neutral-1000-a10 shadow-none"
                    disabled={!detailNavigation.next}
                    onClick={() => navigateToTalent(detailNavigation.next)}
                    size="md"
                    variant="transparent"
                  >
                    <ChevronRight aria-hidden className="size-4" />
                  </MuteButton>
                </div>
                {talentNavigationLabel ? (
                  <div
                    className="max-w-[min(40vw,320px)] truncate text-[13px] font-normal text-neutral-muted"
                    title={talentNavigationLabel}
                  >
                    {talentNavigationLabel}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0">
                <div className="truncate text-[14px] font-normal text-neutral-primary">
                  {title}
                </div>
                <div className="mt-1 truncate text-[11px] text-neutral-muted">
                  {subtitle}
                </div>
              </div>
            )}
            <MuteButton
              aria-label="닫기"
              onClick={onClose}
              size="md"
              type="button"
              variant="transparent"
            >
              <X aria-hidden className="size-4" />
            </MuteButton>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-neutral-muted">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중
            </div>
          ) : error ? (
            <OrgErrorState
              className="m-5"
              message={error.message}
              onRetry={onRetry}
            />
          ) : detail ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_560px]">
              <div className="min-h-0 overflow-y-auto">
                <div className="border-b border-neutral-1000-a05 px-5 py-3 lg:hidden">
                  <div className="flex">
                    <BareButton
                      type="button"
                      onClick={() => setMobileTab("profile")}
                      className={cn(
                        "border-b-2 px-3.5 py-2.5 text-[13px] transition",
                        mobileTab === "profile"
                          ? "border-neutral-800 font-medium text-neutral-primary"
                          : "border-transparent text-neutral-muted hover:text-neutral-primary"
                      )}
                    >
                      프로필
                    </BareButton>
                    <BareButton
                      type="button"
                      onClick={() => setMobileTab("feed")}
                      className={cn(
                        "border-b-2 px-3.5 py-2.5 text-[13px] transition",
                        mobileTab === "feed"
                          ? "border-neutral-800 font-medium text-neutral-primary"
                          : "border-transparent text-neutral-muted hover:text-neutral-primary"
                      )}
                    >
                      피드
                    </BareButton>
                  </div>
                </div>
                {internalOpsAccess ? (
                  <div
                    className={cn(
                      "border-b border-neutral-1000-a05 bg-bg-default px-5",
                      mobileTab !== "profile" && "hidden lg:block"
                    )}
                  >
                    <div className="flex">
                      <MuteButton
                        className={cn(
                          "rounded-none border-b-2 px-3 text-[13px]",
                          profileTab === "profile"
                            ? "border-neutral-1000 text-neutral-primary"
                            : "border-transparent text-neutral-muted"
                        )}
                        onClick={() => setProfileTab("profile")}
                        size="sm"
                        variant="transparent"
                      >
                        회사 공개 프로필
                      </MuteButton>
                      <MuteButton
                        className={cn(
                          "rounded-none border-b-2 px-3 text-[13px]",
                          profileTab === "internal"
                            ? "border-neutral-1000 text-neutral-primary"
                            : "border-transparent text-neutral-muted"
                        )}
                        onClick={() => setProfileTab("internal")}
                        size="sm"
                        variant="transparent"
                      >
                        Harper 내부 정보
                      </MuteButton>
                    </div>
                  </div>
                ) : null}
                <div className="p-5">
                  <div
                    className={cn(mobileTab !== "profile" && "hidden lg:block")}
                  >
                    {profileTab === "internal" && internalOpsAccess ? (
                      <div className="space-y-2">
                        <SystemActivitySummary
                          account={systemActivityQuery.data?.account}
                          error={systemActivityError}
                          isLoading={systemActivityQuery.isLoading}
                        />
                        <HarperMemoSection
                          error={harperMemoError}
                          isLoading={harperMemoQuery.isLoading}
                          memos={harperMemos}
                        />
                        <OrgInternalTalentPanel
                          talentId={detail.talent.userId}
                          workspaceId={workspaceId}
                        />
                      </div>
                    ) : (
                      <ProfilePane
                        acceptDisabled={!acceptStageId || !canManageCandidates}
                        currentStage={detail.recommendation.stage}
                        decisionPending={decisionPending}
                        detail={detail}
                        onAcceptClick={
                          canManageCandidates
                            ? () => setAcceptDialogOpen(true)
                            : undefined
                        }
                        onMoveToPendingConnection={onMoveToPendingConnection}
                        onRejectClick={
                          canManageCandidates
                            ? () => setRejectDialogOpen(true)
                            : undefined
                        }
                        onResumeClick={(kind, link, documentId) =>
                          setResumeRequest({ documentId, kind, link })
                        }
                      />
                    )}
                  </div>
                  <div
                    className={cn(
                      mobileTab !== "feed" && "hidden",
                      "lg:hidden"
                    )}
                  >
                    <FeedPane
                      canManageCandidates={canManageCandidates}
                      currentUserId={currentUserId}
                      detail={detail}
                      internalOpsAccess={internalOpsAccess}
                      talentId={talentId}
                      workspaceId={workspaceId}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden min-h-0 overflow-y-auto border-l border-neutral-1000-a05 bg-bg-default p-5 lg:block">
                <FeedPane
                  canManageCandidates={canManageCandidates}
                  currentUserId={currentUserId}
                  decisionActions={
                    <CandidateDecisionActions
                      acceptDisabled={!acceptStageId || !canManageCandidates}
                      candidateName={title}
                      currentStage={detail.recommendation.stage}
                      decisionPending={decisionPending}
                      onAcceptClick={
                        canManageCandidates
                          ? () => setAcceptDialogOpen(true)
                          : undefined
                      }
                      onMoveToPendingConnection={onMoveToPendingConnection}
                      onRejectClick={
                        canManageCandidates
                          ? () => setRejectDialogOpen(true)
                          : undefined
                      }
                    />
                  }
                  detail={detail}
                  internalOpsAccess={internalOpsAccess}
                  talentId={talentId}
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={Boolean(resumeRequest)}
        onOpenChange={(nextOpen) => !nextOpen && closeResumeDialog()}
      >
        <DialogContent
          className="z-[90] max-w-md gap-4 rounded-lg p-6"
          overlayClassName="z-[80]"
        >
          <DialogHeader>
            <DialogTitle className="text-[18px]">
              {resumeRequest?.kind === "document" ? "문서 열기" : "이력서 열기"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-1 text-[13px] leading-5 text-neutral-primary">
            이 자료는 채용 검토 목적으로만 사용하고 회사 외부에 공유하지 마세요.
          </div>
          {resumeError ? (
            <div className="text-[12px] text-critical" role="alert">
              {resumeError}
            </div>
          ) : null}
          <DialogFooter className="mt-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={closeResumeDialog}
              disabled={openResume.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleConfirmResume}
              disabled={openResume.isPending}
            >
              {openResume.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              확인 후 열기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AcceptIntroDialog
        candidateEmail={detail?.talent.email}
        candidateName={title}
        companyContactName={currentUser?.name}
        defaultContactDirectly={isInternalDomainEmail(currentUserEmail)}
        defaultEmail={currentUserEmail}
        members={members}
        open={acceptDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setAcceptDialogOpen(false)}
        onSubmit={async ({ acceptReason, contactDirectly, introEmails }) => {
          if (!acceptStageId || !onAcceptCandidate) return;
          await onAcceptCandidate({
            acceptReason,
            contactDirectly,
            introEmails,
            stage: acceptStageId,
          });
          setAcceptDialogOpen(false);
        }}
        roleTitle={detail?.role.name ?? ""}
      />

      <PendingConnectionDialog
        candidateName={title}
        onClose={() => setPendingConnectionDialogOpen(false)}
        onConfirm={async (emailMode) => {
          const request = moveTalentToPendingConnection(emailMode);
          setPendingConnectionDialogOpen(false);
          await request;
        }}
        open={pendingConnectionDialogOpen && Boolean(detail)}
        pending={decisionPending}
        recipientEmail={detail?.talent.email}
      />

      <StopCandidateDialog
        candidateName={title}
        connectionStarted={Boolean(
          detail && detail.recommendation.stage !== "pending_connection"
        )}
        open={rejectDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setRejectDialogOpen(false)}
        onSubmit={async ({ note }) => {
          if (!onRejectCandidate) return;
          await onRejectCandidate({
            stopNote: note,
          });
          setRejectDialogOpen(false);
        }}
      />
    </>
  );
}
