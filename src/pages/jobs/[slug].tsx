import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobMarkdown from "@/components/jobs/OfficialJobMarkdown";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { postOfficialJobEvent } from "@/lib/officialJobEvents";
import { OFFICIAL_JOBS_LOGIN_HREF, type OfficialJob } from "@/lib/officialJobs";
import { getPublicOfficialJobBySlug } from "@/lib/officialJobs.server";
import {
  BriefcaseBusiness,
  ChevronLeft,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

function formatEmploymentType(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "full_time") return "풀타임";
  if (normalized === "part_time") return "파트타임";
  if (normalized === "internship") return "인턴";
  if (normalized === "contract") return "계약직";
  if (normalized === "fractional") return "Fractional";
  return value.trim().replaceAll("_", " ");
}

type OfficialJobDetailPageProps = {
  job: OfficialJob;
};

function JobFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="border-b border-beige900/10 px-4 py-3 last:border-b-0">
      <dt className="flex items-center gap-2 text-[12px] font-normal uppercase text-beige900/60">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 text-[14px] font-medium leading-6 text-beige900/82">
        {value}
      </dd>
    </div>
  );
}

function DetailSection({
  eyebrow,
  id,
  title,
  children,
}: {
  eyebrow: string;
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="">
      <p className="text-[13px] font-medium text-beige900/50">{eyebrow}</p>
      <h2 className="mt-4 text-[22px] font-normal leading-tight text-black md:text-[26px]">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function OfficialJobDetailPage({
  job,
}: OfficialJobDetailPageProps) {
  const pageTitle = `${job.roleTitle} at ${job.companyName} | Harper`;
  const trackApplyClick = (source: string) => {
    void postOfficialJobEvent({
      eventType: "job_apply_click",
      jobSlug: job.slug,
      metadata: {
        companyName: job.companyName,
        roleTitle: job.roleTitle,
        source,
      },
    });
  };

  return (
    <>
      <OfficialJobsEventTracker
        eventType="job_detail_view"
        jobSlug={job.slug}
        metadata={{
          companyName: job.companyName,
          roleTitle: job.roleTitle,
        }}
      />
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={job.shortDescription} />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <OfficialJobsHeader />
        <main>
          <PageContainer
            as="article"
            size="default"
            padding="default"
            className="py-8 md:py-12"
          >
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-beige900/55 transition hover:text-beige900"
            >
              <ChevronLeft className="h-4 w-4" />
              역할 목록
            </Link>

            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                <span className="py-1.5 px-4 rounded-full bg-black/5 text-[14px] font-normal text-black">
                  {job.vertical}
                </span>
                <h1 className="mt-6 max-w-[680px] text-[28px] md:text-[32px] wrap-break-word font-normal md:font-medium leading-[1.22] text-black">
                  {job.roleTitle} at {job.companyName}
                </h1>
                <div className="mt-4 max-w-[720px] text-black text-[13px] md:text-[15px] flex flex-row items-center gap-4">
                  {job.employmentType && (
                    <span className="inline-flex items-center gap-2">
                      <BriefcaseBusiness className="h-3.5 w-3.5" />
                      {formatEmploymentType(job.employmentType)}
                    </span>
                  )}
                  {job.seniority && (
                    <span className="inline-flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      {job.seniority}
                    </span>
                  )}
                  {job.location && (
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                  )}
                </div>
                <p className="mt-6 max-w-[720px] break-keep text-[14px] md:text-[16px] leading-7 text-black/70">
                  {job.shortDescription}
                </p>
                <div className="mt-8 flex flex-col gap-2 w-full md:w-fit">
                  <OfficialJobsCtaLink
                    size="lg"
                    onClick={() => trackApplyClick("detail_primary")}
                  />
                  <a
                    href="#official-job-steps"
                    className="text-center md:text-left mt-2 text-[14px] underline-offset-4 font-normal text-black/60 underline decoration-dotted cursor-pointer hover:underline hover:decoration-solid"
                  >
                    어떻게 지원하나요?
                  </a>
                </div>
                <div className="mt-14 space-y-8 rounded-[4px] border border-beige900/10 bg-white/35 p-5 md:p-8">
                  <DetailSection eyebrow="With Harper" title="How Harper helps">
                    <OfficialJobMarkdown
                      content={job.harperDescriptionMarkdown}
                    />
                  </DetailSection>
                  <hr />

                  <DetailSection
                    eyebrow="About this role"
                    title="Role overview"
                  >
                    <OfficialJobMarkdown
                      content={job.roleDescriptionMarkdown}
                    />
                  </DetailSection>
                  <hr />

                  <DetailSection
                    eyebrow="About the company"
                    title="Company overview"
                  >
                    <OfficialJobMarkdown
                      content={job.companyDescriptionMarkdown}
                    />
                  </DetailSection>
                  <hr />

                  <DetailSection
                    eyebrow="Process"
                    id="official-job-steps"
                    title="진행과정"
                  >
                    <OfficialJobMarkdown content={job.harperStepsMarkdown} />
                  </DetailSection>
                </div>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-24">
                <section className="rounded-[8px] border border-beige900/10 bg-white/65 p-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 p-1">
                      <h2 className="text-[18px] font-medium leading-snug text-beige900">
                        {job.companyName} Company
                      </h2>
                    </div>
                  </div>

                  <dl className="mt-5 overflow-hidden rounded-[4px] border border-beige900/10 bg-beige50/65">
                    <JobFact
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      label="Location"
                      value={job.location}
                    />
                    <JobFact
                      icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}
                      label="Vertical"
                      value={job.vertical}
                    />
                    <JobFact
                      icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      label="Compensation"
                      value={job.compensation}
                    />
                    <JobFact
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Seniority"
                      value={job.seniority}
                    />
                  </dl>

                  <div className="mt-5">
                    <OfficialJobsCtaLink
                      fullWidth
                      size="lg"
                      onClick={() => trackApplyClick("detail_sidebar")}
                    />
                  </div>
                </section>

                <section className="overflow-hidden">
                  <Image
                    src="/images/feat33.png"
                    alt="Harper가 역할을 좁혀가는 화면"
                    width={1442}
                    height={440}
                    className="h-auto w-full object-cover"
                  />
                  <p className="mt-2 text-center w-full text-[13px] leading-6 text-black/70">
                    이제 구직을 AI에게 외주 맡겨보세요.
                    <br />
                    Harper가 커리어를 책임지는 에이전트가 되어드리겠습니다.
                  </p>
                </section>
              </aside>
            </div>
          </PageContainer>
        </main>
        <CareerLandingFooter careerStartHref={OFFICIAL_JOBS_LOGIN_HREF} />
      </Page>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<
  OfficialJobDetailPageProps
> = async (context) => {
  const slug = context.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const job = await getPublicOfficialJobBySlug(slug);

  if (!job) {
    return { notFound: true };
  }

  return {
    props: {
      job,
    },
  };
};
