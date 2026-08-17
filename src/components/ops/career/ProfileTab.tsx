import { memo, useMemo, useState } from "react";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useIngestCareerProfile } from "@/hooks/ops/useOpsCareer";
import type {
  CareerTalentProfileResponse,
  CareerTalentProfileIngestSource,
} from "@/lib/ops/careerServer";
import {
  formatKst,
  getLinkedinProfileUrl,
  getResumeFileDisplayName,
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
    memo?: string | null;
    role?: string;
    start_date?: string;
  }>;
  const educations = (detail.structuredProfile?.educations ?? []) as Array<{
    degree?: string | null;
    description?: string | null;
    end_date?: string | null;
    field?: string | null;
    memo?: string | null;
    school?: string | null;
    start_date?: string | null;
  }>;
  const extras = (detail.structuredProfile?.extras ?? []) as Array<{
    date?: string | null;
    description?: string | null;
    memo?: string | null;
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
          <div className={cx(opsTheme.eyebrow)}>프로필 정보 가져오기</div>
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

      <TalentExperienceSection
        experiences={experiences.map((experience) => ({
          companyLogo: experience.company_logo,
          companyLocation: experience.company_location,
          companyName: experience.company_name,
          description: experience.description,
          employmentType: experience.employment_type,
          endDate: experience.end_date,
          memo: experience.memo,
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
          memo: education.memo,
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
