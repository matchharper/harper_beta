import { memo, useMemo, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useIngestCareerProfile } from "@/hooks/useOpsCareer";
import type {
  CareerTalentDetailResponse,
  CareerTalentProfileIngestSource,
} from "@/lib/opsCareerServer";
import {
  formatKst,
  formatRegisteredLinkLabel,
  getLinkedinProfileUrl,
  getResumeFileDisplayName,
  normalizeRegisteredLinkHref,
} from "./utils";

type ProfileTabProps = {
  detail: CareerTalentDetailResponse;
};

export const ProfileTab = memo(function ProfileTab({
  detail,
}: ProfileTabProps) {
  const experiences = (detail.structuredProfile?.experiences ?? []) as Array<{
    company_name?: string;
    description?: string | null;
    end_date?: string;
    role?: string;
    start_date?: string;
  }>;
  const educations = (detail.structuredProfile?.educations ?? []) as Array<{
    degree?: string;
    description?: string | null;
    field?: string;
    school?: string;
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
              <button
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
              </button>
            ) : null}
            {canIngestResume ? (
              <button
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
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-beige900/10 bg-white/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 font-geist text-xs font-medium text-beige900/70">
                <FileText className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                <span>이력서 파일</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 font-geist text-[10px] font-medium",
                  hasResumeFile
                    ? "bg-[#E4EDE2] text-[#29513A]"
                    : "bg-beige500/50 text-beige900/45"
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
                  className="mt-1 flex min-w-0 items-center gap-1.5 font-geist text-xs text-beige900/65 underline-offset-2 transition hover:text-beige900 hover:underline"
                  title={resumeFileDisplayName}
                >
                  <span className="min-w-0 truncate">
                    {resumeFileDisplayName}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-beige900/35" />
                </a>
              ) : (
                <div
                  className="mt-1 truncate font-geist text-xs text-beige900/45"
                  title={resumeFileDisplayName}
                >
                  {resumeFileDisplayName} · 열기 링크 없음
                </div>
              )
            ) : (
              <div className="mt-1 truncate font-geist text-xs text-beige900/45">
                저장된 파일 없음
              </div>
            )}
          </div>

          <div className="rounded-md border border-beige900/10 bg-white/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 font-geist text-xs font-medium text-beige900/70">
                <FileText className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                <span>이력서 텍스트</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 font-geist text-[10px] font-medium",
                  hasResumeText
                    ? "bg-[#E4EDE2] text-[#29513A]"
                    : "bg-beige500/50 text-beige900/45"
                )}
              >
                {hasResumeText ? "추출됨" : "없음"}
              </span>
            </div>
            <div className="mt-1 truncate font-geist text-xs text-beige900/45">
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
                  className="flex items-center justify-between gap-3 rounded-md border border-beige900/10 bg-white/45 px-3 py-2 font-geist text-xs text-beige900/70 transition hover:border-beige900/20 hover:bg-white/70"
                >
                  <span className="min-w-0 truncate">
                    {isLinkedin ? "LinkedIn · " : ""}
                    {formatRegisteredLinkLabel(link)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 font-geist text-sm text-beige900/35">
            등록된 링크가 없습니다.
          </div>
        )}

        {visibleIngestStatus ? (
          <div
            className={
              visibleIngestStatus.type === "success"
                ? "mt-3 rounded-md border border-[#9FB795]/35 bg-[#E4EDE2]/70 px-3 py-2 font-geist text-xs text-[#29513A]"
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
          <div className="whitespace-pre-wrap font-geist text-sm text-beige900/80">
            {detail.bio}
          </div>
        </div>
      ) : null}

      {detail.location ? (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-1")}>위치</div>
          <div className="font-geist text-sm text-beige900/80">
            {detail.location}
          </div>
        </div>
      ) : null}

      {experiences.length > 0 ? (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>경력</div>
          <div className="space-y-2">
            {experiences.map((exp, index) => (
              <div key={index} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {exp.role ?? "역할 미상"}
                </div>
                <div className="font-geist text-xs text-beige900/50">
                  {exp.company_name ?? ""}{" "}
                  {exp.start_date
                    ? `(${exp.start_date} ~ ${exp.end_date ?? "현재"})`
                    : ""}
                </div>
                {exp.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {exp.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {educations.length > 0 ? (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>학력</div>
          <div className="space-y-2">
            {educations.map((edu, index) => (
              <div key={index} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {edu.school ?? "학교 미상"}
                </div>
                <div className="font-geist text-xs text-beige900/50">
                  {[edu.degree, edu.field].filter(Boolean).join(" · ")}
                </div>
                {edu.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {edu.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {extras.length > 0 ? (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>기타</div>
          <div className="space-y-2">
            {extras.map((extra, index) => (
              <div key={index} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {extra.title ?? "제목 없음"}
                </div>
                {extra.date ? (
                  <div className="font-geist text-xs text-beige900/50">
                    {extra.date}
                  </div>
                ) : null}
                {extra.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {extra.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!detail.bio &&
      !detail.location &&
      experiences.length === 0 &&
      educations.length === 0 &&
      extras.length === 0 ? (
        <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
          프로필 정보가 없습니다.
        </div>
      ) : null}
    </div>
  );
});
