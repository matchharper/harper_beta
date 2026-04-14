import { cx, opsTheme } from "@/components/ops/theme";
import type {
  NetworkLeadDetailResponse,
  NetworkLeadSummary,
} from "@/lib/opsNetwork";
import {
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  FileUp,
  GraduationCap,
} from "lucide-react";
import {
  Badge,
  getProfileLinkChipLabel,
  ProfileChip,
  StructuredSection,
} from "./shared";

type ProfileViewProps = {
  detail: NetworkLeadDetailResponse | undefined;
  displayedLead: NetworkLeadSummary;
  isOpeningCv: number | null;
  onOpenCv: (lead: NetworkLeadSummary) => void;
};

export default function ProfileView({
  detail,
  displayedLead,
  isOpeningCv,
  onOpenCv,
}: ProfileViewProps) {
  return (
    <div className="space-y-4">
      {!detail?.hasStructuredProfile ? (
        <div className={cx(opsTheme.panelSoft, "p-5")}>
          <div className="font-geist text-base font-semibold text-beige900">
            아직 구조화 프로필이 없습니다.
          </div>
          <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
            LinkedIn 링크와 CV를 바탕으로 `talent_users`,
            `talent_experiences`, `talent_educations`, `talent_extras`를
            채웁니다. LinkedIn 링크가 있어야 추출 가능합니다.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>LinkedIn {displayedLead.linkedinProfileUrl ? "있음" : "없음"}</Badge>
            <Badge>CV {displayedLead.hasCv ? "있음" : "없음"}</Badge>
          </div>
        </div>
      ) : null}

      <StructuredSection icon={FileUp} title="기본 프로필">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className={cx(opsTheme.panel, "p-4 shadow-none")}>
            <div className="font-geist text-base font-semibold text-beige900">
              {detail?.structuredProfile?.talentUser?.name ??
                detail?.talentProfile?.name ??
                displayedLead.name ??
                "이름 없음"}
            </div>
            {detail?.structuredProfile?.talentUser?.headline ||
            detail?.talentProfile?.headline ? (
              <div className="mt-2 font-geist text-sm text-beige900/70">
                {detail?.structuredProfile?.talentUser?.headline ??
                  detail?.talentProfile?.headline}
              </div>
            ) : null}
            {detail?.structuredProfile?.talentUser?.location ||
            detail?.talentProfile?.location ? (
              <div className="mt-2 font-geist text-sm text-beige900/60">
                {detail?.structuredProfile?.talentUser?.location ??
                  detail?.talentProfile?.location}
              </div>
            ) : null}
            {detail?.structuredProfile?.talentUser?.bio ||
            detail?.talentProfile?.bio ? (
              <div className="mt-4 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                {detail?.structuredProfile?.talentUser?.bio ??
                  detail?.talentProfile?.bio}
              </div>
            ) : (
              <div className="mt-4 font-geist text-sm text-beige900/55">
                구조화된 bio가 아직 없습니다.
              </div>
            )}
          </div>

          <div className={cx(opsTheme.panelSoft, "p-4")}>
            <div className={opsTheme.eyebrow}>프로필 링크와 파일</div>
            <div className="mt-3 space-y-3 font-geist text-sm text-beige900/70">
              <div className="flex flex-wrap gap-2">
                {displayedLead.hasCv ? (
                  <ProfileChip onClick={() => onOpenCv(displayedLead)}>
                    <FileText className="h-4 w-4" />
                    {detail?.talentProfile?.resume_file_name ??
                      displayedLead.cvFileName ??
                      "CV 파일"}
                  </ProfileChip>
                ) : null}
                <ProfileChip>
                  <FileText className="h-4 w-4" />
                  Resume text{" "}
                  {detail?.ingestionState.resumeTextAvailable ? "추출됨" : "없음"}
                </ProfileChip>
                {(detail?.talentProfile?.resume_links ?? []).map((link) => (
                  <ProfileChip key={link} href={link}>
                    <ExternalLink className="h-4 w-4" />
                    {getProfileLinkChipLabel(link)}
                  </ProfileChip>
                ))}
              </div>
              {(detail?.talentProfile?.resume_links ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(detail?.talentProfile?.resume_links ?? []).map((link) => (
                    <div
                      key={`${link}-raw`}
                      className="break-all text-beige900/55"
                    >
                      {link}
                    </div>
                  ))}
                </div>
              ) : null}
              {displayedLead.hasCv ? (
                <div className="text-beige900/55">
                  파일명: {detail?.talentProfile?.resume_file_name ?? displayedLead.cvFileName ?? "-"}
                </div>
              ) : null}
              {displayedLead.hasCv && isOpeningCv === displayedLead.id ? (
                <div className="text-beige900/55">CV 열기 준비 중...</div>
              ) : null}
              {displayedLead.hasCv && !detail?.ingestionState.resumeTextAvailable ? (
                <div className="text-beige900/55">
                  CV는 있지만 현재 저장된 resume text는 없습니다.
                </div>
              ) : null}
              {displayedLead.hasCv ||
              (detail?.talentProfile?.resume_links ?? []).length > 0 ? null : (
                <div className="text-beige900/55">저장된 링크와 파일이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      </StructuredSection>

      <StructuredSection icon={BriefcaseBusiness} title="경력">
        {(detail?.structuredProfile?.talentExperiences ?? []).length > 0 ? (
          <div className="space-y-3">
            {(detail?.structuredProfile?.talentExperiences ?? []).map((item) => (
              <div key={item.id} className={cx(opsTheme.panel, "p-4 shadow-none")}>
                <div className="font-geist text-sm font-semibold text-beige900">
                  {item.role ?? "직함 없음"}
                </div>
                <div className="mt-1 font-geist text-sm text-beige900/65">
                  {item.company_name ?? "회사 없음"}
                  {item.company_location ? ` · ${item.company_location}` : ""}
                </div>
                <div className="mt-2 font-geist text-xs text-beige900/55">
                  {item.start_date || item.end_date
                    ? `${item.start_date ?? "-"} ~ ${item.end_date ?? "Present"}`
                    : "날짜 정보 없음"}
                  {item.months ? ` · ${item.months}개월` : ""}
                </div>
                {item.company_id || item.company_link ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 font-geist text-xs text-beige900/55">
                    {item.company_id ? <span>LinkedIn company id: {item.company_id}</span> : null}
                    {item.company_link ? (
                      <a
                        href={item.company_link}
                        target="_blank"
                        rel="noreferrer"
                        className={opsTheme.link}
                      >
                        Company link
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {item.description ? (
                  <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                    {item.description}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="font-geist text-sm text-beige900/55">
            저장된 경력 정보가 없습니다.
          </div>
        )}
      </StructuredSection>

      <div className="grid gap-4 lg:grid-cols-1">
        <StructuredSection icon={GraduationCap} title="학력">
          {(detail?.structuredProfile?.talentEducations ?? []).length > 0 ? (
            <div className="space-y-3">
              {(detail?.structuredProfile?.talentEducations ?? []).map((item) => (
                <div key={item.id} className={cx(opsTheme.panel, "p-4 shadow-none")}>
                  <div className="font-geist text-sm font-semibold text-beige900">
                    {item.school ?? "학교 없음"}
                  </div>
                  <div className="mt-1 font-geist text-sm text-beige900/65">
                    {[item.degree, item.field].filter(Boolean).join(" · ") || "세부 정보 없음"}
                  </div>
                  <div className="mt-2 font-geist text-xs text-beige900/55">
                    {item.start_date || item.end_date
                      ? `${item.start_date ?? "-"} ~ ${item.end_date ?? "-"}`
                      : "날짜 정보 없음"}
                  </div>
                  {item.description ? (
                    <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                      {item.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="font-geist text-sm text-beige900/55">
              저장된 학력 정보가 없습니다.
            </div>
          )}
        </StructuredSection>

        <StructuredSection icon={BookOpen} title="추가 정보">
          {(detail?.structuredProfile?.talentExtras ?? []).length > 0 ? (
            <div className="space-y-3">
              {(detail?.structuredProfile?.talentExtras ?? []).map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className={cx(opsTheme.panel, "p-4 shadow-none")}
                >
                  <div className="font-geist text-sm font-semibold text-beige900">
                    {item.title ?? "제목 없음"}
                  </div>
                  {item.date ? (
                    <div className="mt-1 font-geist text-xs text-beige900/55">
                      {item.date}
                    </div>
                  ) : null}
                  {item.description ? (
                    <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                      {item.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="font-geist text-sm text-beige900/55">
              저장된 추가 정보가 없습니다.
            </div>
          )}
        </StructuredSection>
      </div>
    </div>
  );
}
