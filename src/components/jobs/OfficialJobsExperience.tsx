import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import DemoVideo from "@/components/landing/DemoVideo";
import CareerLandingClosingSection, {
  CAREER_LANDING_CLOSING_COPY,
} from "@/components/landing/CareerLandingClosingSection";
import OfficialJobsCtaLink from "./OfficialJobsCtaLink";
import type { OfficialJobsCareerJob } from "@/lib/officialJobs";
import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";
import { getOfficialJobsExperienceCopy } from "@/lib/officialJobs/experienceCopy";
import { postOfficialJobEvent } from "@/lib/officialJobs/events";

function JobsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="py-14 md:py-20">
      <div className="flex flex-col gap-8 md:flex-row md:gap-0">
        <div className="md:w-2/5 md:shrink-0 md:pr-12">
          <h2
            id={`${id}-title`}
            className="text-[26px] font-normal leading-tight tracking-tight text-neutral-primary md:text-[32px]"
          >
            {title}
          </h2>
        </div>
        <div className="min-w-0 md:w-3/5">{children}</div>
      </div>
    </section>
  );
}

export default function OfficialJobsExperience({
  locale,
  job,
  showAbout = false,
}: {
  locale: OfficialJobsLocale;
  job?: OfficialJobsCareerJob;
  showAbout?: boolean;
}) {
  const copy = getOfficialJobsExperienceCopy(locale);
  const closing = CAREER_LANDING_CLOSING_COPY[locale];
  return (
    <div className="break-keep bg-bg-basement text-neutral-primary mt-20">
      <PageContainer>
        {showAbout && (
          <JobsSection id="about-harper" title="About Harper">
            <DemoVideo playerName="Harper jobs page" />
            <span className="mt-2 text-black/70 text-sm">
              Turn on the sound!
            </span>
          </JobsSection>
        )}
        <JobsSection id="how-harper-works" title={copy.howTitle}>
          <div>
            {copy.steps.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-5 py-7 first:pt-0 last:pb-0 md:gap-7"
              >
                {/* <span
                  aria-hidden="true"
                  className="pt-1 text-[13px] tabular-nums text-neutral-soft"
                >
                  0
                </span> */}
                <div>
                  <h3 className="text-[18px] font-normal leading-5 md:text-[18px]">
                    {step.title}
                  </h3>
                  <p className="mt-3 font-light text-[15px] leading-7 text-neutral-800">
                    {"body" in step ? step.body : null}
                  </p>
                </div>
              </li>
            ))}
          </div>
        </JobsSection>
        <JobsSection id="jobs-faq" title="FAQ">
          <div className="divide-y divide-neutral-1000-a10 rounded-md p-6 py-8 bg-neutral-100">
            {copy.faqs.map((faq) => (
              <details
                key={faq.question}
                className="group py-5 first:pt-0 last:pb-0"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm text-[14px] md:text-[16px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span className="mt-1 shrink-0 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                    <Plus
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={1.5}
                    />
                  </span>
                </summary>
                <p className="mt-4 font-light pr-10 text-[14px] md:text-[15px] text-neutral-800">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </JobsSection>
      </PageContainer>
      <CareerLandingClosingSection
        copy={closing}
        action={
          <OfficialJobsCtaLink
            job={job}
            locale={locale}
            size="lg"
            className="mt-8 h-12 rounded-full border-black bg-black px-5 text-base font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 md:h-14 md:px-6"
            onClick={() => {
              void postOfficialJobEvent({
                eventType: job ? "job_apply_click" : "jobs_cta_click",
                jobSlug: job?.slug,
                metadata: { source: "jobs_closing_section" },
              });
            }}
          >
            {closing.button}
          </OfficialJobsCtaLink>
        }
      />
    </div>
  );
}
