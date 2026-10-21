import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
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
  getProfileCareerSummary,
} from "@/lib/org/profileCareerSummary";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import { OrgCriteriaEvaluation } from "./OrgCriteriaEvaluation";
import styles from "./OrgTalentProfile.module.css";

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
            ? "size-16 rounded-full object-cover"
            : "size-11 rounded-full object-cover"
        }
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-bg-weak font-medium text-neutral-muted ${large ? "size-16 text-xl" : "size-11 text-xs"}`}
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

export function OrgTalentProfile({
  detail,
  onResumeClick,
  review = false,
  footer,
}: {
  detail: OrgTalentDetailResponse;
  review?: boolean;
  footer?: ReactNode;
  onResumeClick: (
    kind: "storage" | "link" | "document",
    link?: string | null,
    documentId?: string | null
  ) => void;
}) {
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const sectionPrefix = useId();
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
      headline={detail.talent.headline}
      name={name}
      primaryResources={primaryResources}
      secondaryResources={secondaryResources}
    />
  );
  if (review) {
    const sections = [
      {
        key: "summary",
        label: c("요약", "Summary"),
        content: (
          <>
            {detail.companyPresentation ? (
              <>
                <p className="text-[15px] leading-7">
                  {detail.companyPresentation.tldr}
                </p>
                {detail.companyPresentation.harperNote && (
                  <div className="mt-5 border-l-2 border-neutral-1000-a10 pl-4">
                    <p className="mb-1 text-xs font-medium text-neutral-muted">
                      Harper Note
                    </p>
                    <p className="text-sm leading-6">
                      {detail.companyPresentation.harperNote}
                    </p>
                  </div>
                )}
              </>
            ) : detail.recommendation.fitReason ? (
              <MarkdownProfile
                value={convertSlackCandidateIntroToWebMarkdown(
                  detail.recommendation.fitReason
                )}
              />
            ) : null}
            <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 @min-[650px]/review:grid-cols-3">
              {[
                [c("위치", "Location"), detail.profile.location?.trim()],
                [
                  c("경력", "Experience"),
                  formatProfileDuration(careerSummary.experienceMonths, locale),
                ],
                [
                  c("마지막 이직", "Last job change"),
                  formatProfileDuration(
                    careerSummary.lastMoveMonths,
                    locale,
                    true
                  ),
                ],
              ]
                .filter(([, value]) => value && value !== "—")
                .map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-neutral-muted">{label}</dt>
                    <dd className="mt-1 break-words text-sm leading-6">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </>
        ),
      },
      ...(criteriaEvaluations.length
        ? [
            {
              key: "criteria",
              label: c("평가 기준", "Criteria"),
              content: (
                <div className="grid gap-x-6 gap-y-3 @min-[650px]/review:grid-cols-2">
                  {criteriaEvaluations.map((evaluation) => (
                    <OrgCriteriaEvaluation
                      key={evaluation.name}
                      evaluation={evaluation}
                    />
                  ))}
                </div>
              ),
            },
          ]
        : []),
      ...(detail.profile.bio?.trim()
        ? [
            {
              key: "bio",
              label: c("소개", "Bio"),
              content: (
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {detail.profile.bio.trim()}
                </p>
              ),
            },
          ]
        : []),
      ...(detail.profile.experiences.length
        ? [
            {
              key: "experience",
              label: c("경력", "Experience"),
              content: (
                <TalentExperienceSection
                  experiences={detail.profile.experiences}
                />
              ),
              ownsHeading: true,
            },
          ]
        : []),
      ...(detail.profile.educations.length
        ? [
            {
              key: "education",
              label: c("학력", "Education"),
              content: (
                <TalentEducationSection
                  educations={detail.profile.educations}
                />
              ),
              ownsHeading: true,
            },
          ]
        : []),
      ...(detail.profile.extras.length
        ? [
            {
              key: "extras",
              label: c("기타 활동", "More"),
              content: <TalentExtraSection extras={detail.profile.extras} />,
              ownsHeading: true,
            },
          ]
        : []),
      ...(!hasProfileContent && detail.profileMarkdown
        ? [
            {
              key: "profile",
              label: c("프로필", "Profile"),
              content: <MarkdownProfile value={detail.profileMarkdown} />,
            },
          ]
        : []),
      ...(footer
        ? [
            {
              key: "notes",
              label: c("메모", "Notes"),
              content: footer,
              ownsHeading: true,
            },
          ]
        : []),
    ];
    return (
      <div className={styles.review}>
        {header}
        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 @min-[850px]/review:mt-8 @min-[850px]/review:grid-cols-[104px_minmax(0,1fr)] @min-[850px]/review:gap-8">
          <nav
            aria-label={c("프로필 항목", "Profile sections")}
            className="sticky -top-5 z-10 flex gap-1 overflow-x-auto bg-bg-default py-3 @min-[850px]/review:top-0 @min-[850px]/review:flex-col @min-[850px]/review:self-start @min-[850px]/review:py-0"
          >
            {sections.map((section) => (
              <MuteButton
                key={section.key}
                variant="transparent"
                size="sm"
                className="shrink-0 justify-start"
                onClick={() =>
                  document
                    .getElementById(`${sectionPrefix}-${section.key}`)
                    ?.scrollIntoView({ block: "start" })
                }
              >
                {section.label}
              </MuteButton>
            ))}
          </nav>
          <div className="min-w-0 space-y-9">
            {sections.map((section) => (
              <div
                key={section.key}
                id={`${sectionPrefix}-${section.key}`}
                className="scroll-mt-16 @min-[850px]/review:scroll-mt-4"
              >
                {!("ownsHeading" in section && section.ownsHeading) && (
                  <h2 className="mb-4 text-base font-medium">
                    {section.label}
                  </h2>
                )}
                {section.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-7 px-2">
      {header}

      {detail.companyPresentation ? (
        <>
          <ProfileSection title="TL;DR">
            {detail.companyPresentation.tldr}
          </ProfileSection>
          {detail.companyPresentation.harperNote ? (
            <ProfileSection title="Harper Note">
              {detail.companyPresentation.harperNote}
            </ProfileSection>
          ) : null}
        </>
      ) : detail.recommendation.fitReason ? (
        <ProfileSection
          title={c("Harper의 추천 이유", "Why Harper recommends")}
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
            value: formatProfileDuration(
              careerSummary.experienceMonths,
              locale
            ),
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
            <dd className="mt-2 flex items-start gap-2 text-[15px] leading-6 text-neutral-primary">
              <Icon aria-hidden className="mt-1 size-4 shrink-0" />
              <span className="min-w-0 break-words">{value}</span>
            </dd>
          </div>
        ))}
      </dl>

      {criteriaEvaluations.length > 0 ? (
        <ProfileSection title="">
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {criteriaEvaluations.map((evaluation) => (
              <OrgCriteriaEvaluation
                evaluation={evaluation}
                key={evaluation.name}
              />
            ))}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.bio ? (
        <ProfileSection title={c("소개", "Intro")}>
          {detail.profile.bio.trim()}
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
    </div>
  );
}
