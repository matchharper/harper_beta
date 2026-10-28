import { cx, opsTheme } from "@/components/ops/theme";
import { Building2, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { getSchoolLogo } from "@/utils/school_logo";
import { ProfileSection } from "./ProfileSection";

export type TalentExperienceItem = {
  companyLogo?: string | null;
  companyLocation?: string | null;
  companyName?: string | null;
  description?: string | null;
  employmentType?: string | null;
  endDate?: string | null;
  memo?: string | null;
  role?: string | null;
  startDate?: string | null;
};

export type TalentEducationItem = {
  url?: string | null;
  degree?: string | null;
  description?: string | null;
  endDate?: string | null;
  field?: string | null;
  memo?: string | null;
  school?: string | null;
  startDate?: string | null;
};

export type TalentExtraItem = {
  date?: string | null;
  description?: string | null;
  memo?: string | null;
  title?: string | null;
};

function formatExperiencePeriod(
  { endDate, startDate }: Pick<TalentExperienceItem, "endDate" | "startDate">,
  currentLabel: string
) {
  return startDate ? `${startDate} ~ ${endDate ?? currentLabel}` : null;
}

function formatProfilePeriod(
  {
    endDate,
    startDate,
  }: {
    endDate?: string | null;
    startDate?: string | null;
  },
  currentLabel: string
) {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} ~ ${currentLabel}`;
  return endDate ?? null;
}

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
  li: ({ children }) => (
    <li className="pl-1 [&_p]:mt-0 leading-5">{children}</li>
  ),
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

export function TalentProfileDescriptionMarkdown({
  value,
}: {
  value?: string | null;
}) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  return (
    <div className="mt-2 max-w-none text-[14px] leading-5 text-neutral-800">
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

export function TalentProfileMemo({ value }: { value?: string | null }) {
  const t = useOrgT();
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  return (
    <div className="mt-3 px-1 py-2">
      <div className="mb-1 text-[12px] text-primary">
        {t("profile.note", "Harper 메모")}
      </div>
      <div className="whitespace-pre-wrap break-words text-[13px] leading-5 text-neutral-primary">
        {trimmedValue}
      </div>
    </div>
  );
}

function ProfileEntryIcon({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex size-7 sm:size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating text-sm font-medium text-neutral-muted">
      {children}
    </div>
  );
}

/** Shared typography and spacing, based on the experience entry. */
function ProfileEntry({
  title,
  metadata,
  period,
  location,
  icon,
  description,
  memo,
}: {
  title: string;
  metadata?: string | null;
  period?: string | null;
  location?: string | null;
  icon?: ReactNode;
  description?: string | null;
  memo?: string | null;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "py-3")}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1 font-normal">
          <div className="text-[15px] font-medium text-neutral-primary">
            {title}
          </div>
          {metadata ? (
            <div className="mt-1 text-[15px] text-neutral-primary">
              {metadata}
            </div>
          ) : null}
          {[period, location].map((value, index) =>
            value ? (
              <div key={index} className="mt-1 text-sm text-neutral-muted">
                {value}
              </div>
            ) : null
          )}
          {description?.trim() ? (
            <div className="mt-3">
              <TalentProfileDescriptionMarkdown value={description} />
            </div>
          ) : null}
          <TalentProfileMemo value={memo} />
        </div>
      </div>
    </div>
  );
}

function ExperienceCompanyLogo({
  companyName,
  logoUrl,
}: {
  companyName?: string | null;
  logoUrl?: string | null;
}) {
  const t = useOrgT();
  const normalizedLogoUrl = logoUrl?.trim();

  return (
    <ProfileEntryIcon>
      {<Building2 className="h-4 w-4 text-black/30" />}
      {normalizedLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normalizedLogoUrl}
          alt={
            companyName
              ? t("profile.companyLogoNamed", "{companyName} 로고", {
                  companyName,
                })
              : t("profile.companyLogo", "회사 로고")
          }
          className="absolute inset-0 h-full w-full bg-bg-floating object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </ProfileEntryIcon>
  );
}

export function TalentEducationSection({
  educations,
}: {
  educations: TalentEducationItem[];
}) {
  const t = useOrgT();
  if (educations.length === 0) return null;

  return (
    <ProfileSection title={t("profile.education", "학력")}>
      <div className="space-y-2">
        {educations.map((education, index) => {
          const period = formatProfilePeriod(
            education,
            t("profile.current", "현재")
          );
          const educationMeta = [education.degree, education.field]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(", ");
          const schoolLogo = getSchoolLogo(education.url, education.school);

          return (
            <ProfileEntry
              key={index}
              title={
                education.school?.trim() ||
                t("profile.unknownSchool", "학교 미상")
              }
              metadata={educationMeta}
              period={period}
              icon={
                <ProfileEntryIcon>
                  <GraduationCap
                    aria-hidden
                    className="h-4 w-4 text-black/30"
                  />
                  {schoolLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={schoolLogo}
                      src={schoolLogo}
                      alt=""
                      className="absolute inset-0 h-full w-full bg-bg-floating object-contain"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </ProfileEntryIcon>
              }
              description={education.description}
              memo={education.memo}
            />
          );
        })}
      </div>
    </ProfileSection>
  );
}

export function TalentExtraSection({ extras }: { extras: TalentExtraItem[] }) {
  const t = useOrgT();
  if (extras.length === 0) return null;

  return (
    <ProfileSection title={t("profile.other", "기타")}>
      <div className="space-y-2">
        {extras.map((extra, index) => (
          <ProfileEntry
            key={index}
            title={extra.title?.trim() || t("profile.untitled", "제목 없음")}
            period={extra.date}
            description={extra.description}
            memo={extra.memo}
          />
        ))}
      </div>
    </ProfileSection>
  );
}

export function TalentExperienceSection({
  experiences,
}: {
  experiences: TalentExperienceItem[];
}) {
  const t = useOrgT();
  if (experiences.length === 0) return null;

  return (
    <ProfileSection title={t("profile.experience", "경력")}>
      <div className="space-y-2">
        {experiences.map((experience, index) => {
          const period = formatExperiencePeriod(
            experience,
            t("profile.current", "현재")
          );
          const location = experience.companyLocation?.trim();
          const companyName = experience.companyName?.trim();
          const companyMeta = [companyName, experience.employmentType?.trim()]
            .filter(Boolean)
            .join(" · ");

          return (
            <ProfileEntry
              key={index}
              title={
                experience.role?.trim() || t("profile.unknownRole", "역할 미상")
              }
              metadata={companyMeta}
              period={period}
              location={location}
              icon={
                <ExperienceCompanyLogo
                  companyName={experience.companyName}
                  logoUrl={experience.companyLogo}
                />
              }
              description={experience.description}
              memo={experience.memo}
            />
          );
        })}
      </div>
    </ProfileSection>
  );
}
