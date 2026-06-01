import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { postOfficialJobEvent } from "@/lib/officialJobEvents";
import { OFFICIAL_JOBS_LOGIN_HREF, type OfficialJob } from "@/lib/officialJobs";
import {
  getPublicOfficialJobByAshbyId,
  getPublicOfficialJobs,
} from "@/lib/officialJobs.server";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

type OfficialJobsPageProps = {
  jobs: OfficialJob[];
};

function getSingleQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildRedirectDestination(
  slug: string,
  query: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "ashby_jid" || key === "jid") continue;

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string" && item.trim()) {
        params.append(key, item);
      }
    }
  }

  const search = params.toString();
  return `/jobs/${encodeURIComponent(slug)}${search ? `?${search}` : ""}`;
}

function OfficialJobsTable({ jobs }: { jobs: OfficialJob[] }) {
  const router = useRouter();

  const openJob = (
    job: OfficialJob,
    source: "jobs_table_row" | "jobs_mobile_card"
  ) => {
    void postOfficialJobEvent({
      eventType: "job_list_click",
      jobSlug: job.slug,
      metadata: {
        companyName: job.companyName,
        roleTitle: job.roleTitle,
        source,
      },
    });
    void router.push(`/jobs/${job.slug}`);
  };

  if (jobs.length === 0) {
    return (
      <div className="rounded-[8px] border border-beige900/10 bg-white/45 px-4 py-5 text-[14px] leading-6 text-black/62">
        아직 공개된 역할은 없어요. Harper는 계속 시장을 살펴보고 있습니다.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0 md:hidden">
        {jobs.map((job) => {
          return (
            <button
              key={job.id}
              type="button"
              aria-label={`${job.roleTitle}, ${job.companyName} 자세히 보기`}
              className="group relative w-full overflow-hidden rounded-[0px] border border-beige900/10 border-b-0 bg-white/50 px-4 py-5 pl-5 text-left transition hover:-translate-y-0.5 hover:border-beige900/20 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-beige700/15 active:translate-y-0"
              onClick={() => openJob(job, "jobs_mobile_card")}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="break-words text-[16px] font-medium leading-[1.42] text-black">
                  {job.roleTitle}
                </h2>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center group-hover:translate-x-0.5 group-hover:border-beige900/20 group-hover:bg-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-4 space-y-1">
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-[3px] shrink-0 text-black/45" />
                  <div className="break-words text-[13px] font-medium leading-5 text-black/78">
                    {job.companyName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-black/45" />
                  <div className="break-words text-[13px] leading-5 text-black/68">
                    {job.location}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-[4px] border border-beige900/10 bg-white/35 md:block">
        <table className="min-w-[760px] w-full border-collapse text-left">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[30%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-beige900/10 text-[11px] uppercase text-black860">
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Vertical</th>
              <th className="px-4 py-3 font-medium text-right">Apply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-beige900/10">
            {jobs.map((job) => (
              <tr
                key={job.id}
                role="link"
                tabIndex={0}
                className="text-[13px] text-black/68 transition cursor-pointer hover:bg-black/3"
                onClick={() => openJob(job, "jobs_table_row")}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  openJob(job, "jobs_table_row");
                }}
              >
                <td className="max-w-[240px] px-4 py-3 align-top">
                  <div className="font-medium text-black underline-offset-4 hover:underline">
                    {job.roleTitle}
                  </div>
                </td>
                <td className="px-4 py-3 align-top font-medium text-black/78">
                  {job.companyName}
                </td>
                <td className="px-4 py-3 align-top">{job.location}</td>
                <td className="px-4 py-3 align-top">{job.vertical}</td>
                <td className="px-4 py-3 text-right align-top">
                  <div className="inline-flex items-center justify-end gap-1 text-[12px] font-medium text-black transition hover:text-black/70">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function OfficialJobsPage({ jobs }: OfficialJobsPageProps) {
  return (
    <>
      <OfficialJobsEventTracker
        eventType="jobs_list_view"
        metadata={{ jobCount: jobs.length }}
      />
      <Head>
        <title>Jobs Harper Is Watching | Harper</title>
        <meta
          name="description"
          content="Harper가 먼저 살펴보는 역할을 보고, 관심 있는 기회가 있으면 대화로 더 좁혀보세요."
        />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <OfficialJobsHeader />
        <main>
          <PageContainer
            as="section"
            size="default"
            padding="default"
            className="py-10 md:py-14"
          >
            <div className="flex md:flex-row flex-col items-center justify-between">
              <div className="max-w-[820px]">
                <h1 className="mt-5 max-w-[680px] break-keep text-[32px] font-medium leading-[1.42] text-black text-balance">
                  안녕하세요 Harper입니다.
                  <br />
                  제가 먼저 살펴보는 역할들이에요.
                </h1>
                <p className="mt-4 max-w-[620px] break-keep text-[15px] leading-7 text-black/70">
                  충분히 흥미로운 기회만 소개시켜드리고 있어요.
                  <br />
                  관심 있는 역할이 보이면 저에게 알려주세요.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <OfficialJobsCtaLink
                    size="lg"
                    onClick={() => {
                      void postOfficialJobEvent({
                        eventType: "jobs_cta_click",
                        metadata: { source: "jobs_page_hero" },
                      });
                    }}
                  />
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center justify-center rounded-[4px] border border-beige900/15 bg-white/45 px-5 text-[14px] font-medium text-black transition hover:border-beige900/25 hover:bg-white/70"
                  >
                    Harper 더 알아보기
                  </Link>
                </div>
              </div>
              <div>
                <div></div>
                <div></div>
              </div>
            </div>

            <div className="mt-10">
              <OfficialJobsTable jobs={jobs} />
            </div>
          </PageContainer>
        </main>
        <CareerLandingFooter careerStartHref={OFFICIAL_JOBS_LOGIN_HREF} />
      </Page>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<
  OfficialJobsPageProps
> = async (context) => {
  const ashbyJobPostingId =
    getSingleQueryParam(context.query.ashby_jid) ??
    getSingleQueryParam(context.query.jid);

  if (ashbyJobPostingId) {
    const job = await getPublicOfficialJobByAshbyId(ashbyJobPostingId);

    if (job) {
      return {
        redirect: {
          destination: buildRedirectDestination(job.slug, context.query),
          permanent: false,
        },
      };
    }
  }

  const jobs = await getPublicOfficialJobs();

  return {
    props: {
      jobs,
    },
  };
};
