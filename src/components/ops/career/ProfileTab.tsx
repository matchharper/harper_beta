import { memo, useMemo, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useIngestCareerProfile } from "@/hooks/ops/useOpsCareer";
import type {
  CareerTalentProfileResponse,
  CareerTalentProfileIngestSource,
} from "@/lib/ops/careerServer";
import {
  formatKst,
  formatRegisteredLinkLabel,
  getLinkedinProfileUrl,
  getResumeFileDisplayName,
  normalizeRegisteredLinkHref,
} from "./utils";
import { BareButton } from "@/components/ui/button";
import {
  TalentEducationSection,
  TalentExperienceSection,
  TalentExtraSection,
} from "@/components/profile/TalentExperienceSection";

type ProfileTabProps = {
  detail: CareerTalentProfileResponse;
};

export const ProfileTab = memo(function ProfileTab({
  detail,
}: ProfileTabProps) {
  const experiences = (detail.structuredProfile?.experiences ?? []) as Array<{
    company_logo?: string | null;
    company_location?: string | null;
    company_name?: string;
    description?: string | null;
    employment_type?: string | null;
    end_date?: string;
    role?: string;
    start_date?: string;
  }>;
  const educations = (detail.structuredProfile?.educations ?? []) as Array<{
    degree?: string | null;
    description?: string | null;
    end_date?: string | null;
    field?: string | null;
    school?: string | null;
    start_date?: string | null;
  }>;
  const extras = (detail.structuredProfile?.extras ?? []) as Array<{
    date?: string | null;
    description?: string | null;
    title?: string | null;
  }>;
  const registeredLinks = detail.registeredLinks;
  const resumeFileDisplayName = getResumeFileDisplayName(detail);
  const hasResumeFile = Boolean(resumeFileDisplayName);
  const hasResumeText = Boolean(detail.resumeTextAvailable);
  const canIngestResume = hasResumeFile || hasResumeText;
  const linkedinUrl = useMemo(
    () => getLinkedinProfileUrl(registeredLinks),
    [registeredLinks]
  );
  const ingestProfileMutation = useIngestCareerProfile(detail.userId);
  const pendingIngestSource = ingestProfileMutation.isPending
    ? (ingestProfileMutation.variables?.source ?? "linkedin")
    : null;
  const isLinkedinIngestPending = pendingIngestSource === "linkedin";
  const isResumeIngestPending = pendingIngestSource === "resume";
  const [ingestStatus, setIngestStatus] = useState<{
    text: string;
    type: "success" | "error";
    userId: string;
  } | null>(null);
  const visibleIngestStatus =
    ingestStatus?.userId === detail.userId ? ingestStatus : null;

  function handleIngestProfile(source: CareerTalentProfileIngestSource) {
    if (ingestProfileMutation.isPending) return;
    if (source === "linkedin" && !linkedinUrl) return;
    if (source === "resume" && !canIngestResume) return;

    const confirmMessage =
      source === "resume"
        ? "저장된 이력서로 프로필 정보를 다시 추출해 talent_* 테이블을 갱신합니다."
        : "등록된 LinkedIn 링크로 프로필 정보를 가져와 talent_* 테이블을 갱신합니다.";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIngestStatus(null);
    ingestProfileMutation.mutate(
      { source },
      {
        onSuccess: (result) => {
          const stats = result.ingestion.stats;
          const sourceLabel =
            result.ingestion.source === "resume" ? "이력서" : "LinkedIn";
          const resumeSourceLabel =
            result.ingestion.resumeTextSource === "stored_resume_file"
              ? " · 저장 파일 파싱"
              : result.ingestion.resumeTextSource === "stored_resume_text"
                ? " · 저장 텍스트 사용"
                : "";
          setIngestStatus({
            userId: detail.userId,
            type: "success",
            text: `${sourceLabel} 완료${resumeSourceLabel}: 경력 ${stats.experiencesSaved}개, 학력 ${stats.educationsSaved}개, 기타 ${stats.extrasSaved}개 저장`,
          });
        },
        onError: (error) => {
          setIngestStatus({
            userId: detail.userId,
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "프로필 정보를 가져오지 못했습니다.",
          });
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className="flex items-center justify-between gap-3">
          <div className={cx(opsTheme.eyebrow)}>등록 자료</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {linkedinUrl ? (
              <BareButton
                type="button"
                onClick={() => handleIngestProfile("linkedin")}
                disabled={ingestProfileMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5 shrink-0",
                  ingestProfileMutation.isPending &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {isLinkedinIngestPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    가져오는 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    LinkedIn으로 프로필 생성
                  </>
                )}
              </BareButton>
            ) : null}
            {canIngestResume ? (
              <BareButton
                type="button"
                onClick={() => handleIngestProfile("resume")}
                disabled={ingestProfileMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5 shrink-0",
                  ingestProfileMutation.isPending &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {isResumeIngestPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    추출 중...
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5" />
                    이력서로 프로필 생성
                  </>
                )}
              </BareButton>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-neutral-muted">
                <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
                <span>이력서 파일</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  hasResumeFile
                    ? "bg-positive-faded text-positive"
                    : "bg-bg-weak text-neutral-muted"
                )}
              >
                {hasResumeFile ? "있음" : "없음"}
              </span>
            </div>
            {resumeFileDisplayName ? (
              detail.resumeDownloadUrl ? (
                <a
                  href={detail.resumeDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-neutral-muted underline-offset-2 transition hover:text-neutral-primary hover:underline"
                  title={resumeFileDisplayName}
                >
                  <span className="min-w-0 truncate">
                    {resumeFileDisplayName}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-neutral-soft" />
                </a>
              ) : (
                <div
                  className="mt-1 truncate text-xs text-neutral-muted"
                  title={resumeFileDisplayName}
                >
                  {resumeFileDisplayName} · 열기 링크 없음
                </div>
              )
            ) : (
              <div className="mt-1 truncate text-xs text-neutral-muted">
                저장된 파일 없음
              </div>
            )}
          </div>

          <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-neutral-muted">
                <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
                <span>이력서 텍스트</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  hasResumeText
                    ? "bg-positive-faded text-positive"
                    : "bg-bg-weak text-neutral-muted"
                )}
              >
                {hasResumeText ? "추출됨" : "없음"}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-neutral-muted">
              {hasResumeText
                ? "프로필 추출에 사용할 resume text가 저장되어 있습니다."
                : "저장된 resume text 없음"}
            </div>
          </div>
        </div>

        <div className={cx(opsTheme.eyebrow, "mt-4")}>등록 링크</div>
        {registeredLinks.length > 0 ? (
          <div className="mt-3 space-y-2">
            {registeredLinks.map((link) => {
              const isLinkedin = /linkedin\.com\/in\//i.test(link);
              return (
                <a
                  key={link}
                  href={normalizeRegisteredLinkHref(link)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-1000-a05 bg-bg-default/45 px-3 py-2 text-xs text-neutral-muted transition hover:border-neutral-1000-a10 hover:bg-blue-200/50"
                >
                  <span className="min-w-0 truncate">
                    {isLinkedin ? "LinkedIn · " : ""}
                    {formatRegisteredLinkLabel(link)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-soft">
            등록된 링크가 없습니다.
          </div>
        )}

        {visibleIngestStatus ? (
          <div
            className={
              visibleIngestStatus.type === "success"
                ? "mt-3 rounded-md border border-positive/30 bg-positive-faded/70 px-3 py-2 text-xs text-positive"
                : cx(opsTheme.errorNotice, "mt-3 text-xs")
            }
          >
            {visibleIngestStatus.text}
          </div>
        ) : null}
      </div>

      {detail.bio ? (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-1")}>소개</div>
          <div className="whitespace-pre-wrap text-sm text-neutral-primary">
            {detail.bio}
          </div>
        </div>
      ) : null}

      {detail.location ? (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-1")}>위치</div>
          <div className="text-sm text-neutral-primary">{detail.location}</div>
        </div>
      ) : null}

      <TalentExperienceSection
        experiences={experiences.map((experience) => ({
          companyLogo: experience.company_logo,
          companyLocation: experience.company_location,
          companyName: experience.company_name,
          description: experience.description,
          employmentType: experience.employment_type,
          endDate: experience.end_date,
          role: experience.role,
          startDate: experience.start_date,
        }))}
      />

      <TalentEducationSection
        educations={educations.map((education) => ({
          degree: education.degree,
          description: education.description,
          endDate: education.end_date,
          field: education.field,
          school: education.school,
          startDate: education.start_date,
        }))}
      />

      <TalentExtraSection extras={extras} />

      {!detail.bio &&
      !detail.location &&
      experiences.length === 0 &&
      educations.length === 0 &&
      extras.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
          프로필 정보가 없습니다.
        </div>
      ) : null}
    </div>
  );
});
