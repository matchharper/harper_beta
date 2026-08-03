import { cx, opsTheme } from "@/components/ops/theme";
import { Building2 } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

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

function formatExperiencePeriod({
  endDate,
  startDate,
}: Pick<TalentExperienceItem, "endDate" | "startDate">) {
  return startDate ? `${startDate} ~ ${endDate ?? "현재"}` : null;
}

function formatProfilePeriod({
  endDate,
  startDate,
}: {
  endDate?: string | null;
  startDate?: string | null;
}) {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} ~ 현재`;
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

function TalentProfileDescriptionMarkdown({
  value,
}: {
  value?: string | null;
}) {
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

export function TalentProfileMemo({ value }: { value?: string | null }) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  return (
    <div className="mt-3 px-1 py-2">
      <div className="mb-1 text-[12px] text-primary">Harper 메모</div>
      <div className="whitespace-pre-wrap break-words text-[13px] leading-5 text-neutral-primary">
        {trimmedValue}
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
  const normalizedLogoUrl = logoUrl?.trim();

  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating text-sm font-medium text-neutral-muted">
      {<Building2 className="h-4 w-4 text-black/30" />}
      {normalizedLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normalizedLogoUrl}
          alt={companyName ? `${companyName} 로고` : "회사 로고"}
          className="absolute inset-0 h-full w-full bg-bg-floating object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

export function TalentEducationSection({
  educations,
}: {
  educations: TalentEducationItem[];
}) {
  if (educations.length === 0) return null;

  return (
    <div>
      <div className={cx(opsTheme.eyebrow, "mb-2")}>학력</div>
      <div className="space-y-2">
        {educations.map((education, index) => {
          const period = formatProfilePeriod(education);
          const educationMeta = [education.degree, education.field]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(" · ");

          return (
            <div key={index} className={cx(opsTheme.panelSoft, "p-3")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-[13px] font-medium text-neutral-primary">
                  {education.school?.trim() || "학교 미상"}
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
              <TalentProfileDescriptionMarkdown value={education.description} />
              <TalentProfileMemo value={education.memo} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TalentExtraSection({ extras }: { extras: TalentExtraItem[] }) {
  if (extras.length === 0) return null;

  return (
    <div>
      <div className={cx(opsTheme.eyebrow, "mb-2")}>기타</div>
      <div className="space-y-2">
        {extras.map((extra, index) => (
          <div key={index} className={cx(opsTheme.panelSoft, "p-3")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[13px] font-medium text-neutral-primary">
                {extra.title?.trim() || "제목 없음"}
              </div>
              {extra.date ? (
                <div className="shrink-0 text-[11px] text-neutral-soft">
                  {extra.date}
                </div>
              ) : null}
            </div>
            <TalentProfileDescriptionMarkdown value={extra.description} />
            <TalentProfileMemo value={extra.memo} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TalentExperienceSection({
  experiences,
}: {
  experiences: TalentExperienceItem[];
}) {
  if (experiences.length === 0) return null;

  return (
    <div>
      <div className={cx(opsTheme.eyebrow, "mb-2")}>경력</div>
      <div className="space-y-2">
        {experiences.map((experience, index) => {
          const period = formatExperiencePeriod(experience);
          const location = experience.companyLocation?.trim();
          const companyName = experience.companyName?.trim();

          return (
            <div key={index} className={cx(opsTheme.panelSoft, "py-3")}>
              <div className="flex items-start gap-3">
                <ExperienceCompanyLogo
                  companyName={experience.companyName}
                  logoUrl={experience.companyLogo}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                    <div className="min-w-0 text-sm font-medium text-neutral-primary">
                      {experience.role?.trim() || "역할 미상"}
                      {companyName && (
                        <div className="mt-1 text-[14px] text-neutral-primary">
                          {companyName}
                        </div>
                      )}
                      {location && (
                        <div className="mt-1 text-[13px] text-neutral-muted">
                          {location}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-[13px] text-neutral-soft text-right">
                      {period ? <div>{period}</div> : null}
                      <div>
                        {experience.employmentType &&
                          `${experience.employmentType}`}
                      </div>
                    </div>
                  </div>
                  {experience.description?.trim() ? (
                    <div className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">
                      {experience.description.trim()}
                    </div>
                  ) : null}
                  <TalentProfileMemo value={experience.memo} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
