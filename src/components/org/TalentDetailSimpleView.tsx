import Image from "next/image";
import dynamic from "next/dynamic";
import { CircleAlert, ExternalLink, LoaderCircle, X } from "lucide-react";
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
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  useCreateOrgFeedItem,
  useDeleteOrgFeedItem,
  useOpenOrgResume,
  useUpdateOrgFeedItem,
} from "@/hooks/org/useOrg";
import type {
  OrgMember,
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
  "border-b border-neutral-1000-a05 px-0 py-3 last:border-b-0";

const OrgInternalTalentPanel = dynamic(
  () => import("@/components/org/internal/OrgInternalTalentPanel"),
  {
    loading: () => (
      <div className="flex min-h-56 items-center justify-center text-[11px] font-light text-neutral-muted">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        내부 데이터를 불러오는 중
      </div>
    ),
    ssr: false,
  }
);

function TalentAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={64}
        height={64}
        unoptimized
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

function ResourceRow({
  caption,
  href,
  label,
  onClick,
}: {
  caption: string;
  href?: string;
  label: string;
  onClick?: () => void;
}) {
  const className = cx(
    profileItemClass,
    "flex w-full items-center justify-between gap-3 bg-black/4 px-3 text-left text-[13px] transition hover:bg-black/8"
  );

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex flex-row items-center gap-1.5">
          <span className="block font-normal font-sm text-neutral-primary">
            {label}
          </span>
          <span className="block max-w-[600px] truncate text-[12px] text-neutral-muted">
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
    <blockquote className="mt-2 border-l-2 border-neutral-1000-a10 pl-2.5 text-neutral-muted first:mt-0 [&_p]:mt-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-bg-weak px-1 py-0.5 font-mono text-[11px] text-neutral-primary">
      {children}
    </code>
  ),
  em: ({ children }) => (
    <em className="italic text-neutral-muted">{children}</em>
  ),
  h1: ({ children }) => (
    <h4 className="mt-2.5 text-[13px] font-medium text-neutral-primary first:mt-0">
      {children}
    </h4>
  ),
  h2: ({ children }) => (
    <h4 className="mt-2.5 text-[13px] font-medium text-neutral-primary first:mt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h4 className="mt-2.5 text-[12px] font-medium text-neutral-primary first:mt-0">
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

function ProfileDescriptionMarkdown({ value }: { value?: string | null }) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  return (
    <div className="mt-2 max-w-none text-[13px] leading-6 text-neutral-muted">
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
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-start gap-3">
        <TalentAvatar name={name} src={detail.talent.profilePicture} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-neutral-primary">
            {name}
          </div>
          <div className="mt-1 truncate text-[13px] text-neutral-muted">
            {detail.talent.email ?? "-"}
          </div>
          {detail.talent.headline ? (
            <div className="mt-2 text-[13px] leading-6 text-neutral-primary">
              {detail.talent.headline}
            </div>
          ) : null}
        </div>
      </div>

      <CandidateDecisionActions
        acceptDisabled={acceptDisabled}
        candidateName={name}
        className="lg:hidden"
        decisionPending={decisionPending}
        onAcceptClick={onAcceptClick}
        onRejectClick={onRejectClick}
      />

      <ProfileSection title="추천 이유">
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
      </ProfileSection>

      <ProfileSection title="등록 자료">
        <div className="space-y-2">
          {detail.resume.hasStorageFile ? (
            <ResourceRow
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
            <div
              className={cx(profileItemClass, "text-[13px] text-neutral-soft")}
            >
              등록된 자료가 없습니다.
            </div>
          ) : null}
        </div>
      </ProfileSection>

      {detail.profile.bio ? (
        <ProfileSection title="소개">
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-neutral-primary">
            {detail.profile.bio.trim()}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.location ? (
        <ProfileSection title="위치">
          <div className="text-[13px] text-neutral-primary">
            {detail.profile.location}
          </div>
        </ProfileSection>
      ) : null}

      {detail.profile.experiences.length > 0 ? (
        <ProfileSection title="경력">
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
                    <div className="min-w-0 text-[13px] font-medium text-neutral-primary">
                      {experience.role || "역할 미상"}
                    </div>
                    {period ? (
                      <div className="shrink-0 text-[11px] text-neutral-soft">
                        {period}
                      </div>
                    ) : null}
                  </div>
                  {companyMeta ? (
                    <div className="mt-1 text-[12px] text-neutral-muted">
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
        <ProfileSection title="학력">
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
                    <div className="min-w-0 text-[13px] font-medium text-neutral-primary">
                      {education.school || "학교 미상"}
                    </div>
                    {period ? (
                      <div className="shrink-0 text-[11px] text-neutral-soft">
                        {period}
                      </div>
                    ) : null}
                  </div>
                  {educationMeta ? (
                    <div className="mt-1 text-[12px] text-neutral-muted">
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
                  <div className="min-w-0 text-[13px] font-medium text-neutral-primary">
                    {extra.title || "제목 없음"}
                  </div>
                  {extra.date ? (
                    <div className="shrink-0 text-[11px] text-neutral-soft">
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

function CandidateDecisionActions({
  acceptDisabled,
  candidateName,
  className,
  decisionPending,
  onAcceptClick,
  onRejectClick,
}: {
  acceptDisabled?: boolean;
  candidateName: string;
  className?: string;
  decisionPending?: boolean;
  onAcceptClick?: () => void;
  onRejectClick?: () => void;
}) {
  if (!onAcceptClick && !onRejectClick) return null;

  return (
    <section
      aria-label="후보자 연결 결정"
      className={cx("border-y border-critical/20 py-4", className)}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 text-critical">
          <CircleAlert className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-medium text-critical">
            결정이 필요합니다
          </div>
          <p className="mt-1 text-[12px] font-normal leading-5 text-neutral-muted">
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
          이번에는 거절하겠습니다
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

function FeedPane({
  canManageCandidates,
  currentUserId,
  decisionActions,
  detail,
  talentId,
  workspaceId,
}: {
  canManageCandidates: boolean;
  currentUserId?: string | null;
  decisionActions?: ReactNode;
  detail: OrgTalentDetailResponse;
  talentId?: string | null;
  workspaceId: string;
}) {
  const [draft, setDraft] = useState("");
  const createFeed = useCreateOrgFeedItem();
  const updateFeed = useUpdateOrgFeedItem();
  const deleteFeed = useDeleteOrgFeedItem();
  const trimmedDraft = draft.trim();
  const feedItems: ProgressFeedItem[] = detail.feed.map((item) => ({
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
  }));

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
    </div>
  );
}

export function TalentDetailSimpleView({
  acceptStageId,
  canManageCandidates = true,
  companyName,
  currentUserEmail,
  currentUserId,
  decisionPending,
  detail,
  error,
  internalOpsAccess = false,
  isLoading,
  members = [],
  onAcceptCandidate,
  onClose,
  onRejectCandidate,
  onRetry,
  open,
  talentId,
  workspaceId,
}: {
  acceptStageId?: OrgStageId | null;
  canManageCandidates?: boolean;
  companyName: string;
  currentUserEmail?: string | null;
  currentUserId?: string | null;
  decisionPending?: boolean;
  detail?: OrgTalentDetailResponse | null;
  error?: Error | null;
  internalOpsAccess?: boolean;
  isLoading?: boolean;
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
  onAcceptCandidate?: (args: {
    acceptReason: string | null;
    contactDirectly: boolean;
    introEmails: string[];
    stage: OrgStageId;
  }) => Promise<void>;
  onClose: () => void;
  onRejectCandidate?: (options: OrgStageChangeOptions) => void | Promise<void>;
  onRetry?: () => void;
  open: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"profile" | "feed">("profile");
  const [profileTab, setProfileTab] = useState<"internal" | "profile">(
    "profile"
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [resumeRequest, setResumeRequest] = useState<{
    kind: "storage" | "link";
    link?: string | null;
  } | null>(null);
  const [resumeError, setResumeError] = useState("");
  const openResume = useOpenOrgResume();

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
              <div className="truncate text-[14px] font-medium text-neutral-primary">
                {title}
              </div>
              <div className="mt-1 truncate text-[11px] text-neutral-muted">
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
                      className={cx(
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
                      className={cx(
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
                    className={cx(
                      "border-b border-neutral-1000-a05 bg-bg-default px-5",
                      mobileTab !== "profile" && "hidden lg:block"
                    )}
                  >
                    <div className="flex">
                      <MuteButton
                        className={cx(
                          "rounded-none border-b-2 px-3 text-[12px]",
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
                        className={cx(
                          "rounded-none border-b-2 px-3 text-[12px]",
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
                    className={cx(mobileTab !== "profile" && "hidden lg:block")}
                  >
                    {profileTab === "internal" && internalOpsAccess ? (
                      <OrgInternalTalentPanel
                        currentRecommendationId={
                          detail.recommendation.recommendationId
                        }
                        talentId={detail.talent.userId}
                        workspaceId={workspaceId}
                      />
                    ) : (
                      <ProfilePane
                        acceptDisabled={!acceptStageId || !canManageCandidates}
                        decisionPending={decisionPending}
                        detail={detail}
                        onAcceptClick={
                          canManageCandidates
                            ? () => setAcceptDialogOpen(true)
                            : undefined
                        }
                        onRejectClick={
                          canManageCandidates
                            ? () => setRejectDialogOpen(true)
                            : undefined
                        }
                        onResumeClick={(kind, link) =>
                          setResumeRequest({ kind, link })
                        }
                      />
                    )}
                  </div>
                  <div
                    className={cx(
                      mobileTab !== "feed" && "hidden",
                      "lg:hidden"
                    )}
                  >
                    <FeedPane
                      canManageCandidates={canManageCandidates}
                      currentUserId={currentUserId}
                      detail={detail}
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
                      decisionPending={decisionPending}
                      onAcceptClick={
                        canManageCandidates
                          ? () => setAcceptDialogOpen(true)
                          : undefined
                      }
                      onRejectClick={
                        canManageCandidates
                          ? () => setRejectDialogOpen(true)
                          : undefined
                      }
                    />
                  }
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
        onOpenChange={(nextOpen) => !nextOpen && closeResumeDialog()}
      >
        <DialogContent
          className="z-[90] max-w-md gap-4 rounded-lg p-6"
          overlayClassName="z-[80]"
        >
          <DialogHeader>
            <DialogTitle className="text-[18px]">이력서 열기</DialogTitle>
          </DialogHeader>
          <div className="mt-1 text-[13px] leading-5 text-neutral-primary">
            이 자료는 채용 검토 목적으로만 사용하고 회사 외부에 공유하지
            마세요.
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
        candidateName={title}
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
      />

      <StopCandidateDialog
        candidateName={title}
        defaultReason="company"
        open={rejectDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setRejectDialogOpen(false)}
        onSubmit={async ({ note }) => {
          if (!onRejectCandidate) return;
          await onRejectCandidate({
            stopNote: note,
            stopReason: "company",
          });
          setRejectDialogOpen(false);
        }}
      />
    </>
  );
}
