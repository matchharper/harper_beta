import { postOfficialJobEvent } from "@/lib/officialJobs/events";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import {
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import type { OfficialJobsCareerJob } from "@/lib/officialJobs";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import Image from "next/image";
import Link from "next/link";

export default function OfficialJobsHeader({
  job,
  locale = "ko",
}: {
  job?: OfficialJobsCareerJob;
  locale?: OfficialJobsLocale;
}) {
  const copy = getOfficialJobsCopy(locale);

  return (
    <header className="top-0 z-40 border-b border-neutral-1000-a05 bg-bg-default backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/svgs/logov2.svg"
            alt="Harper"
            width={64}
            height={29}
            priority
          />
        </Link>
        <div className="flex items-center gap-6 text-[14px] text-neutral-700 font-normal">
          <Link
            href="/jobs"
            className="hidden transition hover:text-neutral-primary sm:block"
          >
            {copy.header.jobs}
          </Link>
          <Link
            href={getCompanyLocalePath(locale)}
            className="hidden transition hover:text-neutral-primary sm:block"
          >
            {copy.header.forCompanies}
          </Link>
        </div>
        <nav className="flex items-center gap-4 text-[13px]  text-neutral-primary/58 sm:gap-6">
          <OfficialJobsCtaLink
            job={job}
            onClick={() => {
              void postOfficialJobEvent({
                eventType: job ? "job_apply_click" : "jobs_cta_click",
                jobSlug: job?.slug,
                metadata: { source: "jobs_header" },
              });
            }}
            variant="dark"
            className="hidden md:flex"
            size="md"
            locale={locale}
          />
        </nav>
      </div>
    </header>
  );
}
