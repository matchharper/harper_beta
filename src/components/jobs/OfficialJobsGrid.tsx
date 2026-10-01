import Link from "next/link";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import { CardButton } from "@/components/ui/button";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import {
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { getOfficialJobsExperienceCopy } from "@/lib/officialJobs/experienceCopy";
import { postOfficialJobEvent } from "@/lib/officialJobs/events";

export default function OfficialJobsGrid({
  jobs,
  locale,
}: {
  jobs: OfficialJobListItem[];
  locale: OfficialJobsLocale;
}) {
  const copy = getOfficialJobsExperienceCopy(locale);
  if (jobs.length === 0)
    return (
      <p className="py-8 text-[14px] text-neutral-muted">
        {getOfficialJobsCopy(locale).list.empty}
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      {jobs.map((job) => (
        <CardButton
          key={job.id}
          asChild
          className="relative group flex h-full min-h-[160px] md:min-h-[200px] hover:bg-primary-faded/20 hover:border-primary hover:ring hover:ring-primary flex-col items-start justify-between rounded-md p-4 md:p-5 text-left"
        >
          <Link
            href={`/jobs/${job.slug}`}
            onClick={() => {
              void postOfficialJobEvent({
                eventType: "job_list_click",
                jobSlug: job.slug,
                metadata: {
                  companyName: job.companyName,
                  roleTitle: job.roleTitle,
                  source: "jobs_grid_card",
                },
              });
            }}
          >
            <div className="w-full min-w-0">
              <h2 className="break-words text-[15px] md:text-[17px] font-normal leading-[1.4] text-neutral-primary">
                {job.roleTitle}
              </h2>
              <span className="mt-3 inline-flex min-w-0 items-start gap-2 leading-[1.4] text-[14px] font-normal text-neutral-700/90">
                {/* <Building2
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                /> */}
                {job.companyName}
              </span>
            </div>
            {/* {job.vertical && (
              <span className="absolute top-[-8px] right-[-8px] py-1 px-3 rounded-full bg-black/5 text-[13px] font-normal text-black">
                {job.vertical}
              </span>
            )} */}
            <div className="mt-6 flex w-full flex-row items-center justify-between gap-3 font-normal text-[13px] text-neutral-muted">
              {job.location && (
                <span className="flex items-start gap-1">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  {job.location}
                </span>
              )}
              <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-normal group-hover:text-primary">
                <span className="hidden group-hover:inline">View</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              </span>
            </div>
          </Link>
        </CardButton>
      ))}
    </div>
  );
}
