import Image from "next/image";
import {
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  Github,
  GraduationCap,
  Linkedin,
  Link2,
  LoaderCircle,
  MapPin,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  ProgressFeed,
  type ProgressFeedIcon,
  type ProgressFeedItem,
} from "@/components/progress-feed/ProgressFeed";
import { BareButton, Button } from "@/components/ui/button";
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
import { useCreateOrgFeedItem, useOpenOrgResume } from "@/hooks/org/useOrg";
import type {
  OrgStageChangeOptions,
  OrgStageId,
  OrgTalentDetailResponse,
} from "@/lib/org/server";

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

const profileItemClass =
  "rounded-md bg-bg-floating px-0 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_75%,transparent)]";

function TalentAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={64}
        height={64}
        unoptimized
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-weak text-sm font-semibold text-neutral-muted">
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

function ResourceIcon({ kind }: { kind: ResourceLinkKind }) {
  if (kind === "linkedin") return <Linkedin className="h-3.5 w-3.5" />;
  if (kind === "github") return <Github className="h-3.5 w-3.5" />;
  if (kind === "resume") return <FileText className="h-3.5 w-3.5" />;
  return <Link2 className="h-3.5 w-3.5" />;
}

function ProfileSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-neutral-muted">
        {icon ? <span className="text-neutral-soft">{icon}</span> : null}
        {title}
      </div>
      {children}
    </section>
  );
}

function ResourceRow({
  caption,
  href,
  kind,
  label,
  onClick,
}: {
  caption: string;
  href?: string;
  kind: ResourceLinkKind;
  label: string;
  onClick?: () => void;
}) {
  const className = cx(
    profileItemClass,
    "flex w-full items-center justify-between gap-3 text-left text-sm transition bg-bg-weak"
  );
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-neutral-soft">
          <ResourceIcon kind={kind} />
        </span>
        <span className="min-w-0 flex flex-row gap-2 items-center">
          <span className="block font-medium text-neutral-primary">
            {label}
          </span>
          <span className="block text-xs text-neutral-muted max-w-[600px] truncate">
            {caption}
          </span>
        </span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
    </>
  );

  if (onClick) {
    return (
      <BareButton type="button" onClick={onClick} className={className}>
        {content}
      </BareButton>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={caption}
    >
      {content}
    </a>
  );
}

function formatPeriod(start?: string | null, end?: string | null) {
  if (!start && !end) return "";
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - 현재`;
  return end ?? "";
}

const profileMarkdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className={opsTheme.link}>
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mt-5 text-lg font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 text-base font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-sm font-semibold first:mt-0">{children}</h3>
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

const profileDescriptionMarkdownComponents: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-neutral-primary underline decoration-neutral-1000-a20 underline-offset-2 transition hover:text-neutral-muted"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-neutral-1000-a10 pl-3 text-neutral-muted first:mt-0 [&_p]:mt-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-bg-weak px-1 py-0.5 font-mono text-[12px] text-neutral-primary">
      {children}
    </code>
  ),
  em: ({ children }) => (
    <em className="italic text-neutral-muted">{children}</em>
  ),
  h1: ({ children }) => (
    <h4 className="mt-3 text-sm font-semibold text-neutral-primary first:mt-0">
      {children}
    </h4>
  ),
  h2: ({ children }) => (
    <h4 className="mt-3 text-sm font-semibold text-neutral-primary first:mt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h4 className="mt-3 text-[13px] font-semibold text-neutral-primary first:mt-0">
      {children}
    </h4>
  ),
  li: ({ children }) => <li className="pl-1 [&_p]:mt-0">{children}</li>,
  ol: ({ children }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
  ),
  p: ({ children }) => (
    <p className="mt-2 whitespace-pre-wrap first:mt-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-primary">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
};

function MarkdownProfile({ value }: { value: string }) {
  if (!value.trim()) {
    return <div className="text-sm text-neutral-muted">-</div>;
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

function ProfileDescriptionMarkdown({ value }: { value?: string | null }) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  return (
    <div className="mt-2 max-w-none text-[13px] leading-5 text-neutral-muted">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={profileDescriptionMarkdownComponents}
      >
        {trimmedValue}
      </ReactMarkdown>
    </div>
  );
}

function ProfilePane({
  acceptDisabled,
  decisionPending,
  detail,
  onAcceptClick,
  onRejectClick,
  onResumeClick,
}: {
  acceptDisabled?: boolean;
  decisionPending?: boolean;
  detail: OrgTalentDetailResponse;
  onAcceptClick?: () => void;
  onRejectClick?: () => void;
  onResumeClick: (kind: "storage" | "link", link?: string | null) => void;
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
  const hasProfileContent = Boolean(
    detail.profile.bio ||
    detail.profile.location ||
    detail.profile.experiences.length ||
    detail.profile.educations.length ||
    detail.profile.extras.length
  );

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <TalentAvatar name={name} src={detail.talent.profilePicture} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-medium text-neutral-primary">
              {name}
            </div>
            <div className="mt-1 truncate text-sm text-neutral-muted">
              {detail.talent.email ?? "-"}
            </div>
            {detail.talent.headline ? (
              <div className="mt-2 text-sm leading-5 text-neutral-primary">
                {detail.talent.headline}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button
            type="button"
            size="sm"
            onClick={onAcceptClick}
            disabled={decisionPending || acceptDisabled || !onAcceptClick}
            className="w-full sm:w-auto bg-primary text-white"
          >
            이 후보자를 만나보겠습니다.
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onRejectClick}
            disabled={decisionPending || !onRejectClick}
            className="w-full sm:w-auto border-red-500"
          >
            이 후보자는 거절하겠습니다.
          </Button>
        </div>
      </div>

      <ProfileSection title="추천 이유">
        {detail.recommendation.fitSummary ||
        detail.recommendation.fitReasons.length > 0 ? (
          <div className="space-y-2">
            {detail.recommendation.fitSummary ? (
              <div className="border-l-2 border-primary px-3 text-sm leading-6 text-neutral-primary">
                {detail.recommendation.fitSummary}
              </div>
            ) : null}
            {detail.recommendation.fitReasons.length > 0 ? (
              <ul className="space-y-1.5 text-sm leading-6 text-neutral-muted">
                {detail.recommendation.fitReasons.map((reason) => (
                  <li key={reason} className="ml-4 list-disc">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-neutral-soft">-</div>
        )}
      </ProfileSection>

      <ProfileSection title="등록 자료">
        <div className="space-y-2">
          {detail.resume.hasStorageFile ? (
            <ResourceRow
              kind="resume"
              label="이력서"
              caption={detail.resume.fileName ?? "저장된 이력서 파일"}
              onClick={() => onResumeClick("storage")}
            />
          ) : null}
          {resourceLinks.map((link) => {
            const kind = getResourceLinkKind(link);
            const isResumeLink = kind === "resume";
            return (
              <ResourceRow
                key={link}
                kind={kind}
                label={getResourceLinkLabel(kind)}
                caption={formatLinkLabel(link)}
                href={isResumeLink ? undefined : normalizeLinkHref(link)}
                onClick={
                  isResumeLink ? () => onResumeClick("link", link) : undefined
                }
              />
            );
          })}
          {!detail.resume.hasStorageFile && resourceLinks.length === 0 ? (
            <div className={cx(profileItemClass, "text-sm text-neutral-soft")}>
              등록된 자료가 없습니다.
            </div>
          ) : null}
        </div>
      </ProfileSection>

      {detail.profile.bio ? (
        <ProfileSection title="소개">
          <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
            {detail.profile.bio.trim()}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.location ? (
        <ProfileSection title="위치" icon={<MapPin className="h-3.5 w-3.5" />}>
          <div className="text-sm text-neutral-primary">
            {detail.profile.location}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.experiences.length > 0 ? (
        <ProfileSection
          title="경력"
          icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}
        >
          <div className="space-y-2">
            {detail.profile.experiences.map((experience, index) => {
              const period = formatPeriod(
                experience.startDate,
                experience.endDate
              );
              const companyMeta = [
                experience.companyName,
                experience.employmentType,
                experience.companyLocation,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={index} className={profileItemClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-neutral-primary">
                      {experience.role || "역할 미상"}
                    </div>
                    {period ? (
                      <div className="shrink-0 text-xs text-neutral-soft">
                        {period}
                      </div>
                    ) : null}
                  </div>
                  {companyMeta ? (
                    <div className="mt-1 text-[13px] text-neutral-muted">
                      {companyMeta}
                    </div>
                  ) : null}
                  <ProfileDescriptionMarkdown value={experience.description} />
                </div>
              );
            })}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.educations.length > 0 ? (
        <ProfileSection
          title="학력"
          icon={<GraduationCap className="h-3.5 w-3.5" />}
        >
          <div className="space-y-2">
            {detail.profile.educations.map((education, index) => {
              const period = formatPeriod(
                education.startDate,
                education.endDate
              );
              const educationMeta = [education.degree, education.field]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={index} className={profileItemClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-neutral-primary">
                      {education.school || "학교 미상"}
                    </div>
                    {period ? (
                      <div className="shrink-0 text-xs text-neutral-soft">
                        {period}
                      </div>
                    ) : null}
                  </div>
                  {educationMeta ? (
                    <div className="mt-1 text-[13px] text-neutral-muted">
                      {educationMeta}
                    </div>
                  ) : null}
                  <ProfileDescriptionMarkdown value={education.description} />
                </div>
              );
            })}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.extras.length > 0 ? (
        <ProfileSection title="기타">
          <div className="space-y-2">
            {detail.profile.extras.map((extra, index) => (
              <div key={index} className={profileItemClass}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm font-medium text-neutral-primary">
                    {extra.title || "제목 없음"}
                  </div>
                  {extra.date ? (
                    <div className="shrink-0 text-xs text-neutral-soft">
                      {extra.date}
                    </div>
                  ) : null}
                </div>
                <ProfileDescriptionMarkdown value={extra.description} />
              </div>
            ))}
          </div>
        </ProfileSection>
      ) : null}

      {!hasProfileContent && detail.profileMarkdown ? (
        <ProfileSection title="프로필">
          <MarkdownProfile value={detail.profileMarkdown} />
        </ProfileSection>
      ) : null}
    </div>
  );
}

function getOrgFeedTitle(kind: string) {
  if (kind === "org_note") return "메모";
  if (kind === "org_stage_change") return "상태 변경";
  if (kind === "org_resume_opened") return "이력서 열람";
  return "활동";
}

function getOrgFeedIcon(kind: string): ProgressFeedIcon {
  if (kind === "org_stage_change") return "sparkles";
  if (kind === "org_resume_opened") return "eye";
  return "note";
}

function getOrgFeedActorLabel(
  actor: OrgTalentDetailResponse["feed"][number]["actor"]
) {
  if (!actor) return "자동 기록";
  return actor.name || actor.email || "멤버";
}

function FeedPane({
  detail,
  talentId,
  workspaceId,
}: {
  detail: OrgTalentDetailResponse;
  talentId?: string | null;
  workspaceId: string;
}) {
  const [draft, setDraft] = useState("");
  const createFeed = useCreateOrgFeedItem();
  const trimmedDraft = draft.trim();
  const feedItems: ProgressFeedItem[] = detail.feed.map((item) => ({
    actorLabel: getOrgFeedActorLabel(item.actor),
    createdAt: item.createdAt,
    icon: getOrgFeedIcon(item.kind),
    id: item.id,
    roleContext: item.roleName,
    text: item.text,
    title: getOrgFeedTitle(item.kind),
  }));

  return (
    <div className="min-w-0 space-y-3">
      <div className="text-sm font-semibold text-neutral-primary">피드</div>
      <ProgressFeed
        draft={draft}
        emptyLabel="아직 피드가 없습니다."
        items={feedItems}
        onDraftChange={setDraft}
        onSubmit={() => {
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
        }}
        pendingSubmit={createFeed.isPending}
        placeholder="이 후보자에 대한 메모를 남겨주세요."
        submitError={
          createFeed.error instanceof Error ? createFeed.error : null
        }
      />
    </div>
  );
}

export function TalentDetailSimpleView({
  acceptStageId,
  companyName,
  currentUserEmail,
  decisionPending,
  detail,
  error,
  isLoading,
  onAcceptCandidate,
  onClose,
  onRejectCandidate,
  open,
  talentId,
  workspaceId,
}: {
  acceptStageId?: OrgStageId | null;
  companyName: string;
  currentUserEmail?: string | null;
  decisionPending?: boolean;
  detail?: OrgTalentDetailResponse | null;
  error?: Error | null;
  isLoading?: boolean;
  onAcceptCandidate?: (args: {
    acceptReason: string | null;
    introEmails: string[];
    stage: OrgStageId;
  }) => Promise<void>;
  onClose: () => void;
  onRejectCandidate?: (options: OrgStageChangeOptions) => void;
  open: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"profile" | "feed">("profile");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [resumeRequest, setResumeRequest] = useState<{
    kind: "storage" | "link";
    link?: string | null;
  } | null>(null);
  const openResume = useOpenOrgResume();

  const handleConfirmResume = () => {
    if (!resumeRequest || !talentId) return;
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    openResume.mutate(
      {
        kind: resumeRequest.kind,
        link: resumeRequest.link ?? null,
        talentId,
        workspaceId,
      },
      {
        onError: () => {
          popup?.close();
        },
        onSuccess: (payload) => {
          if (popup) {
            popup.location.href = payload.url;
          } else {
            window.open(payload.url, "_blank", "noopener,noreferrer");
          }
          setResumeRequest(null);
        },
      }
    );
  };

  if (!open) return null;

  const title =
    detail?.talent.name ||
    detail?.talent.email ||
    (isLoading ? "Talent" : "Talent");
  const subtitle = detail
    ? `${companyName} · ${detail.role.name}`
    : companyName;

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
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-neutral-primary">
                {title}
              </div>
              <div className="mt-0.5 truncate text-xs text-neutral-muted">
                {subtitle}
              </div>
            </div>
            <BareButton
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </BareButton>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-muted">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중
            </div>
          ) : error ? (
            <div className={cx(opsTheme.errorNotice, "m-5")}>
              {error.message}
            </div>
          ) : detail ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px]">
              <div className="min-h-0 overflow-y-auto">
                <div className="border-b border-neutral-1000-a05 px-5 py-3 lg:hidden">
                  <div className="flex">
                    <BareButton
                      type="button"
                      onClick={() => setMobileTab("profile")}
                      className={cx(
                        "border-b-2 px-4 py-2.5 text-sm transition",
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
                      className={cx(
                        "border-b-2 px-4 py-2.5 text-sm transition",
                        mobileTab === "feed"
                          ? "border-neutral-800 font-medium text-neutral-primary"
                          : "border-transparent text-neutral-muted hover:text-neutral-primary"
                      )}
                    >
                      피드
                    </BareButton>
                  </div>
                </div>
                <div className="p-5">
                  <div
                    className={cx(mobileTab !== "profile" && "hidden lg:block")}
                  >
                    <ProfilePane
                      acceptDisabled={!acceptStageId}
                      decisionPending={decisionPending}
                      detail={detail}
                      onAcceptClick={() => setAcceptDialogOpen(true)}
                      onRejectClick={() => setRejectDialogOpen(true)}
                      onResumeClick={(kind, link) =>
                        setResumeRequest({ kind, link })
                      }
                    />
                  </div>
                  <div
                    className={cx(
                      mobileTab !== "feed" && "hidden",
                      "lg:hidden"
                    )}
                  >
                    <FeedPane
                      detail={detail}
                      talentId={talentId}
                      workspaceId={workspaceId}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden min-h-0 overflow-y-auto border-l border-neutral-1000-a05 bg-bg-basement p-5 lg:block">
                <FeedPane
                  detail={detail}
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
        onOpenChange={(nextOpen) => !nextOpen && setResumeRequest(null)}
      >
        <DialogContent
          className="z-[90] max-w-md rounded-lg"
          overlayClassName="z-[80]"
        >
          <DialogHeader>
            <DialogTitle>이력서 열기</DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-sm leading-6 text-neutral-primary">
            해당 자료는 {companyName}측에만 전달된 개인 자료로, 절대 외부에
            공개되어서는 안됩니다. 외부에 공유될 시 책임은 {companyName}에
            있습니다.
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setResumeRequest(null)}
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
        candidateName={title}
        defaultEmail={currentUserEmail}
        open={acceptDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setAcceptDialogOpen(false)}
        onSubmit={async ({ acceptReason, introEmails }) => {
          if (!acceptStageId || !onAcceptCandidate) return;
          await onAcceptCandidate({
            acceptReason,
            introEmails,
            stage: acceptStageId,
          });
          setAcceptDialogOpen(false);
        }}
      />

      <StopCandidateDialog
        candidateName={title}
        defaultReason="company"
        open={rejectDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setRejectDialogOpen(false)}
        onSubmit={({ note }) => {
          if (!onRejectCandidate) return;
          onRejectCandidate({ stopNote: note, stopReason: "company" });
          setRejectDialogOpen(false);
        }}
      />
    </>
  );
}
