import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobMarkdown from "@/components/jobs/OfficialJobMarkdown";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  fetchOfficialJobs,
  officialJobsQueryKey,
  OFFICIAL_JOBS_QUERY_STALE_TIME_MS,
} from "@/hooks/officialJobs/useOfficialJobs";
import { postOfficialJobEvent } from "@/lib/officialJobs/events";
import { OFFICIAL_JOBS_LOGIN_HREF, type OfficialJob } from "@/lib/officialJobs";
import {
  OFFICIAL_JOBS_OG_IMAGE_URL,
  buildOfficialJobCanonicalUrl,
  buildOfficialJobDescription,
  buildOfficialJobStructuredData,
  buildOfficialJobTitle,
  toIsoDateTime,
} from "@/lib/officialJobs/seo";
import {
  formatOfficialJobEmploymentType,
  getOfficialJobsCopy,
  resolveOfficialJobsLocaleFromRequest,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { getPublicOfficialJobBySlug } from "@/lib/officialJobs/server";
import { useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  ChevronLeft,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, type ReactNode } from "react";

type OfficialJobDetailPageProps = {
  job: OfficialJob;
  locale: OfficialJobsLocale;
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

export default function OfficialJobDetailPage({
  job,
  locale,
}: OfficialJobDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const copy = getOfficialJobsCopy(locale);
  const pageTitle = buildOfficialJobTitle(job, locale);
  const pageDescription = buildOfficialJobDescription(job, locale);
  const canonicalUrl = buildOfficialJobCanonicalUrl(job.slug);
  const publishedIsoDate = toIsoDateTime(job.publishedAt);
  const updatedIsoDate = toIsoDateTime(job.updatedAt);
  const structuredData = buildOfficialJobStructuredData(job, locale);
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

  useEffect(() => {
    void router.prefetch("/jobs");
    void queryClient.prefetchQuery({
      queryKey: officialJobsQueryKey,
      queryFn: fetchOfficialJobs,
      staleTime: OFFICIAL_JOBS_QUERY_STALE_TIME_MS,
    });
  }, [queryClient, router]);

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
        <meta key="description" name="description" content={pageDescription} />
        <meta
          key="robots"
          name="robots"
          content="index,follow,max-image-preview:large"
        />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={copy.seo.ogLocale} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={OFFICIAL_JOBS_OG_IMAGE_URL} />
        <meta property="og:image:alt" content={pageTitle} />
        {publishedIsoDate && (
          <meta property="article:published_time" content={publishedIsoDate} />
        )}
        {updatedIsoDate && (
          <meta property="article:modified_time" content={updatedIsoDate} />
        )}
        {job.vertical && (
          <meta property="article:section" content={job.vertical} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={OFFICIAL_JOBS_OG_IMAGE_URL} />
        <link rel="icon" href="/images/logo.ico" />
        <script
          key={`ld-official-job-${job.slug}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </Head>
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <OfficialJobsHeader locale={locale} />
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
              {copy.detail.backToList}
            </Link>

            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                {job.vertical && (
                  <span className="py-1.5 px-4 rounded-full bg-black/5 text-[14px] font-normal text-black">
                    {job.vertical}
                  </span>
                )}
                <h1 className="mt-6 max-w-[680px] text-[24px] md:text-[32px] wrap-break-word font-normal md:font-medium leading-[1.4] text-black">
                  {job.roleTitle}
                </h1>
                <div className="mt-4 max-w-[720px] text-black text-[13px] md:text-[15px] flex flex-row flex-wrap items-center gap-4">
                  {job.employmentType && (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                      {formatOfficialJobEmploymentType(
                        job.employmentType,
                        locale
                      )}
                    </span>
                  )}
                  {job.seniority && (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {job.seniority}
                    </span>
                  )}
                  {job.location && (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {job.location}
                    </span>
                  )}
                </div>
                <p className="mt-6 max-w-[720px] break-keep text-[14px] md:text-[16px] leading-7 text-black/70">
                  {job.shortDescription}
                </p>
                <div className="mt-8 flex flex-col gap-2 w-full md:w-fit">
                  <OfficialJobsCtaLink
                    locale={locale}
                    size="lg"
                    onClick={() => trackApplyClick("detail_primary")}
                  />
                </div>
                <div className="mt-14 space-y-8 rounded-[4px] border border-white/0 md:border-beige900/10 bg-white/0 md:bg-white/35 p-0 md:p-8">
                  <OfficialJobMarkdown content={job.roleDescriptionMarkdown} />
                </div>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-24">
                <section className="rounded-[8px] border border-beige900/10 bg-white/65 p-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 p-1">
                      <h2 className="text-[18px] font-medium leading-snug text-beige900">
                        {job.companyName} {copy.detail.companySuffix}
                      </h2>
                    </div>
                  </div>

                  <dl className="mt-5 overflow-hidden rounded-[4px] border border-beige900/5 bg-beige50/65">
                    <JobFact
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      label={copy.detail.facts.location}
                      value={job.location}
                    />
                    <JobFact
                      icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}
                      label={copy.detail.facts.vertical}
                      value={job.vertical}
                    />
                    <JobFact
                      icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      label={copy.detail.facts.compensation}
                      value={job.compensation}
                    />
                    <JobFact
                      icon={<Users className="h-3.5 w-3.5" />}
                      label={copy.detail.facts.seniority}
                      value={job.seniority}
                    />
                  </dl>

                  <div className="mt-5">
                    <OfficialJobsCtaLink
                      fullWidth
                      locale={locale}
                      size="lg"
                      onClick={() => trackApplyClick("detail_sidebar")}
                    />
                  </div>
                </section>

                {/* <section className="overflow-hidden">
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
                </section> */}
                <br />
                <br />
                <br />
                <br />
              </aside>
            </div>
          </PageContainer>
        </main>
        <CareerLandingFooter
          careerStartHref={OFFICIAL_JOBS_LOGIN_HREF}
          labels={copy.footerLabels}
          locale={locale}
        />
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
      locale: resolveOfficialJobsLocaleFromRequest(context.req),
    },
  };
};
