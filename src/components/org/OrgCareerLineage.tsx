import { BriefcaseBusiness, GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptionalOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgProfileNotes } from "@/hooks/org/useOrgRoleViews";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  profileEntityKey,
  type ProfileEntityRef,
} from "@/lib/org/profileNotes";
import type {
  OrgProfileEducation,
  OrgProfileExperience,
} from "@/lib/org/server";
import { getSchoolLogo } from "@/utils/school_logo";

type Step = {
  detail: string | null;
  entity: ProfileEntityRef;
  key: string;
  logoUrl: string | null;
  period: string | null;
  sortDate: string | null;
};

function year(value: string | null | undefined) {
  return value?.match(/^\d{4}/)?.[0] ?? null;
}

function period(start: string | null, end: string | null, current: string) {
  const from = year(start);
  const to = year(end);
  if (from && to) return from === to ? from : `${from}–${to}`;
  if (from) return `${from}–${current}`;
  return to;
}

/** Schools then jobs, oldest first, as one left-to-right career line. */
export function buildCareerLineage(args: {
  currentLabel: string;
  educations: OrgProfileEducation[];
  experiences: OrgProfileExperience[];
}): Step[] {
  const schools: Step[] = args.educations.flatMap((education, index) => {
    const name = education.school?.trim();
    if (!name) return [];
    return [
      {
        detail:
          [education.degree, education.field]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(" · ") || null,
        entity: { kind: "school", name },
        key: `school:${index}`,
        logoUrl: getSchoolLogo(education.url, name) ?? null,
        period: period(
          education.startDate,
          education.endDate,
          args.currentLabel
        ),
        sortDate: education.startDate ?? education.endDate,
      },
    ];
  });
  const jobs: Step[] = args.experiences.flatMap((experience, index) => {
    const name = experience.companyName?.trim();
    if (!name) return [];
    return [
      {
        detail: experience.role?.trim() || null,
        entity: { kind: "company", name },
        key: `company:${index}`,
        logoUrl: experience.companyLogo,
        period: period(
          experience.startDate,
          experience.endDate,
          args.currentLabel
        ),
        sortDate: experience.startDate ?? experience.endDate,
      },
    ];
  });
  // Undated schools stay first and undated jobs last.
  const order = (step: Step) =>
    step.sortDate ?? (step.entity.kind === "school" ? "0000" : "9999");
  return [...schools, ...jobs].sort((left, right) =>
    order(left).localeCompare(order(right))
  );
}

export function OrgCareerLineage({
  educations,
  experiences,
}: {
  educations: OrgProfileEducation[];
  experiences: OrgProfileExperience[];
}) {
  const { c, locale } = useOrgLocale();
  const workspace = useOptionalOrgWorkspace();
  const steps = buildCareerLineage({
    currentLabel: c("현재", "Now"),
    educations,
    experiences,
  });
  const notes = useOrgProfileNotes({
    entities: steps.length >= 2 ? steps.map((step) => step.entity) : [],
    locale,
    workspaceId: workspace?.workspace.workspaceId ?? "",
  });
  if (steps.length < 2) return null;
  return (
    <section aria-label={c("학력·경력 흐름", "Education and career path")}>
      <div className="mb-2.5 text-[12px] text-neutral-muted">
        {c("학력·경력", "Education and career")}
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="relative flex min-w-max">
          <span
            aria-hidden
            className="absolute left-5 right-5 top-5 h-px bg-neutral-1000-a10"
          />
          {steps.map((step) => {
            const Icon =
              step.entity.kind === "school" ? GraduationCap : BriefcaseBusiness;
            const note = notes.data?.notes[profileEntityKey(step.entity)];
            return (
              <li className="relative w-48 shrink-0 pr-5" key={step.key}>
                <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-full border border-neutral-1000-a10 bg-bg-floating text-neutral-muted">
                  <Icon aria-hidden className="size-4" />
                  {step.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="absolute inset-0 size-full bg-bg-floating object-contain"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                      src={step.logoUrl}
                    />
                  ) : null}
                </span>
                <div className="mt-2.5 text-[13px] font-medium text-neutral-primary">
                  {step.entity.name}
                </div>
                {step.detail || step.period ? (
                  <div className="mt-0.5 text-[12px] text-neutral-muted">
                    {[step.detail, step.period].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {notes.isLoading ? (
                  <Skeleton className="mt-2 h-3 w-36" />
                ) : note ? (
                  <p className="mt-1.5 text-[12px] leading-[18px] text-neutral-soft">
                    {note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
