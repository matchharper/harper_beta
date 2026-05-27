import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { postOfficialJobEvent } from "@/lib/officialJobEvents";
import { OFFICIAL_JOBS_LOGIN_HREF, type OfficialJob } from "@/lib/officialJobs";
import { getPublicOfficialJobs } from "@/lib/officialJobs.server";
import { ArrowRight } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

type OfficialJobsPageProps = {
  jobs: OfficialJob[];
};

function OfficialJobsTable({ jobs }: { jobs: OfficialJob[] }) {
  const router = useRouter();

  const openJob = (job: OfficialJob) => {
    void postOfficialJobEvent({
      eventType: "job_list_click",
      jobSlug: job.slug,
      metadata: {
        companyName: job.companyName,
        roleTitle: job.roleTitle,
        source: "jobs_table_row",
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
    <div className="overflow-x-auto rounded-[4px] border border-beige900/10 bg-white/35">
      <table className="min-w-[760px] w-full border-collapse text-left">
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
              onClick={() => openJob(job)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openJob(job);
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
> = async () => {
  const jobs = await getPublicOfficialJobs();

  return {
    props: {
      jobs,
    },
  };
};
