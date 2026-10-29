import { BriefcaseBusiness, GraduationCap } from "lucide-react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildCareerLineage } from "@/lib/org/careerLineage";
import type {
  OrgProfileEducation,
  OrgProfileExperience,
} from "@/lib/org/server";

/**
 * Where the person studied and worked as one line: each school or company's
 * logo (or a plain mark when there is none), then its name, the degree or
 * title, and how long they spent there.
 */
export function OrgCareerLineage({
  educations,
  experiences,
}: {
  educations: OrgProfileEducation[];
  experiences: OrgProfileExperience[];
}) {
  const { c } = useOrgLocale();
  const steps = buildCareerLineage({ educations, experiences });
  if (steps.length < 2) return null;
  const duration = (months: number) => {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years && rest) {
      return c("{y}년 {m}개월", "{y} yr {m} mo", { m: rest, y: years });
    }
    return years
      ? c("{y}년", "{y} yr", { y: years })
      : c("{m}개월", "{m} mo", { m: rest });
  };
  return (
    <section aria-label={c("학력·경력 흐름", "Education and career path")}>
      <div className="mb-2.5 text-[12px] text-neutral-muted">
        {c("학력·경력", "Education and career")}
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="relative flex min-w-max">
          <span
            aria-hidden
            className="absolute left-6 right-6 top-6 h-px bg-neutral-1000-a10"
          />
          {steps.map((step) => {
            const Icon =
              step.kind === "school" ? GraduationCap : BriefcaseBusiness;
            return (
              <li className="relative w-48 shrink-0 pr-5" key={step.key}>
                <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-full border border-neutral-1000-a10 bg-bg-floating text-neutral-muted">
                  <Icon aria-hidden className="size-4" />
                  {step.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="absolute inset-0 size-full bg-white object-contain p-1.5"
                      onError={(event) => {
                        // A broken logo falls back to the plain mark.
                        event.currentTarget.style.display = "none";
                      }}
                      src={step.logoUrl}
                    />
                  ) : null}
                </span>
                <div className="mt-2.5 text-[13px] font-medium text-neutral-primary">
                  {step.name}
                </div>
                {step.detail ? (
                  <div className="mt-0.5 text-[12px] text-neutral-muted">
                    {step.detail}
                  </div>
                ) : null}
                {step.months ? (
                  <span className="mt-1.5 inline-block rounded-full border border-neutral-1000-a10 px-2 py-0.5 text-[11px] tabular-nums leading-4 text-neutral-muted">
                    {duration(step.months)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
