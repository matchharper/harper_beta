import Image from "next/image";
import { useState, type ReactNode } from "react";
import { BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { opsTheme } from "@/components/ops/theme";
import { ProfileSection } from "@/components/profile/ProfileSection";
import {
  TalentEducationSection,
  TalentExperienceSection,
  TalentExtraSection,
} from "@/components/profile/TalentExperienceSection";
import {
  TalentProfileHeader,
  getTalentProfileLinkImageSrc,
  type TalentProfileResource,
} from "@/components/profile/TalentProfileHeader";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { convertSlackCandidateIntroToWebMarkdown } from "@/lib/org/agent/navigationMarkdown";
import {
  formatProfileDuration,
  formatProfileExperience,
  getProfileCareerSummary,
} from "@/lib/org/profileCareerSummary";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import { OrgCareerLineage } from "./OrgCareerLineage";
import { OrgCriteriaEvaluation } from "./OrgCriteriaEvaluation";

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

function TalentAvatar({
  name,
  src,
  large = false,
}: {
  name: string;
  src?: string | null;
  large?: boolean;
}) {
  const { c } = useOrgLocale();
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        src={profilePicture}
        alt={c("", "")}
        width={64}
        height={64}
        unoptimized
        onError={() => setFailedImageSrc(profilePicture)}
        className={
          large
            ? "size-12 rounded-full object-cover"
            : "size-11 rounded-full object-cover"
        }
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-bg-weak font-medium text-neutral-muted ${large ? "size-12 text-lg" : "size-11 text-xs"}`}
    >
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
    <h3 className="mt-3 text-sm font-medium first:mt-0">{children}</h3>
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
    return <div className="text-sm text-neutral-800">-</div>;
  }

  return (
    <div className="space-y-3 text-sm leading-6 text-neutral-primary">
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

export type OrgTalentProfileContentProps = {
  detail: Pick<
    OrgTalentDetailResponse,
    | "talent"
    | "profile"
    | "resume"
    | "profileMarkdown"
    | "criteriaEvaluations"
    | "companyPresentation"
  > & {
    recommendation?: Pick<
      OrgTalentDetailResponse["recommendation"],
      "fitReason"
    >;
  };
  review?: boolean;
  footer?: ReactNode;
  onResumeClick: (
    kind: "storage" | "link" | "document",
    link?: string | null,
    documentId?: string | null
  ) => void;
};

export function OrgTalentProfile({
  detail,
  onResumeClick,
  review = false,
  footer,
}: Omit<OrgTalentProfileContentProps, "detail"> & {
  detail: OrgTalentDetailResponse;
}) {
  return (
    <OrgTalentProfileContent
      detail={detail}
      onResumeClick={onResumeClick}
      review={review}
      footer={footer}
    />
  );
}

/** "Role at Company" for the job the person holds now, newest first. */
function currentRoleLine(
  experiences: OrgTalentDetailResponse["profile"]["experiences"]
) {
  const current = experiences
    .filter((experience) => !experience.endDate)
    .sort((left, right) =>
      (right.startDate ?? "").localeCompare(left.startDate ?? "")
    )[0];
  const role = current?.role?.trim();
  const company = current?.companyName?.trim();
  if (role && company) return `${role} at ${company}`;
  return role || company || null;
}

/** Shared professional profile body; a preview carries no invented recommendation. */
export function OrgTalentProfileContent({
  detail,
  onResumeClick,
  review = false,
  footer,
}: OrgTalentProfileContentProps) {
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const name =
    detail.talent.name || detail.talent.email || c("이름 없음", "No name");
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
      label: c("이력서", "Resume"),
      onClick: () => onResumeClick("storage"),
      title:
        detail.resume.fileName ?? c("저장된 이력서 파일", "Saved resume file"),
    });
  } else if (primaryResumeLink) {
    primaryResources.push({
      key: `primary:${primaryResumeLink}`,
      kind: "resume",
      label: c("이력서", "Resume"),
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
      label: c("LinkedIn", "LinkedIn"),
      title: formatLinkLabel(primaryLinkedinLink),
    });
  }

  const secondaryResources: TalentProfileResource[] = [
    ...detail.profile.documents.map((document) => ({
      key: `document:${document.id}`,
      kind: "document" as const,
      label: document.fileName || c("공개 문서", "Public document"),
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
          label: sourceT(getResourceLinkLabel(kind)),
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
  const criteriaEvaluations =
    detail.criteriaEvaluations ??
    detail.companyPresentation?.criteriaEvaluations ??
    [];
  const careerSummary = getProfileCareerSummary(detail.profile.experiences);
  const currentRole = currentRoleLine(detail.profile.experiences);

  const header = (
    <TalentProfileHeader
      variant={review ? "review" : "default"}
      avatar={
        <TalentAvatar
          name={name}
          src={detail.talent.profilePicture}
          large={review}
        />
      }
      headline={currentRole ?? detail.talent.headline}
      name={name}
      primaryResources={primaryResources}
      secondaryResources={secondaryResources}
    />
  );

  return (
    <div className="min-w-0 max-w-full space-y-7 px-4 md:px-2 [overflow-wrap:anywhere]">
      {header}

      <OrgCareerLineage
        educations={detail.profile.educations}
        experiences={detail.profile.experiences}
      />

      {detail.companyPresentation ? (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 gap-y-6 my-8 mb-12">
            {[
              {
                label: c("위치", "Location"),
                icon: MapPin,
                value: detail.profile.location?.trim() || "—",
              },
              {
                label: c("경력", "Experience"),
                icon: CalendarDays,
                value: formatProfileExperience(careerSummary, locale),
              },
              {
                label: c("마지막 이직", "Last job change"),
                icon: BriefcaseBusiness,
                value: formatProfileDuration(
                  careerSummary.lastMoveMonths,
                  locale,
                  true
                ),
              },
            ].map(({ label, icon: Icon, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-[14px] font-normal text-neutral-primary">
                  {label}
                </dt>
                <dd className="mt-2 flex items-start gap-2 text-[14px] text-neutral-800">
                  <Icon aria-hidden className="mt-1 size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{value}</span>
                </dd>
              </div>
            ))}
          </dl>
          <ProfileSection title="TL;DR">
            {detail.companyPresentation.tldr}
          </ProfileSection>
          {detail.companyPresentation.harperNote ? (
            <ProfileSection title="Harper Note">
              <MarkdownProfile value={detail.companyPresentation.harperNote} />
            </ProfileSection>
          ) : null}
        </>
      ) : detail.recommendation?.fitReason ? (
        <ProfileSection
          title={c(
            "Harper의 추천 이유",
            "Why Harper recommends this candidate"
          )}
        >
          <div className="mt-4 mb-10 border-l-2 border-primary px-3">
            <MarkdownProfile
              value={convertSlackCandidateIntroToWebMarkdown(
                detail.recommendation.fitReason
              )}
            />
          </div>
        </ProfileSection>
      ) : null}

      {criteriaEvaluations.length > 0 ? (
        <ProfileSection title={c("기준", "Criteria")}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {criteriaEvaluations.map((evaluation) => (
              <OrgCriteriaEvaluation
                evaluation={evaluation}
                key={evaluation.name}
                showContent
              />
            ))}
          </div>
        </ProfileSection>
      ) : null}

      <TalentExperienceSection experiences={detail.profile.experiences} />

      <TalentEducationSection educations={detail.profile.educations} />

      <TalentExtraSection extras={detail.profile.extras} />

      {!hasProfileContent && detail.profileMarkdown ? (
        <ProfileSection title={c("프로필", "Profile")}>
          <MarkdownProfile value={detail.profileMarkdown} />
        </ProfileSection>
      ) : null}
      {footer}
    </div>
  );
}
