import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { useOfficialJobs } from "@/hooks/officialJobs/useOfficialJobs";
import { getInitialClientLocalePreference } from "@/i18n/useMessage";
import { postOfficialJobEvent } from "@/lib/officialJobs/events";
import {
  OFFICIAL_JOBS_LOGIN_HREF,
  type OfficialJobListItem,
} from "@/lib/officialJobs";
import {
  OFFICIAL_JOBS_CANONICAL_URL,
  OFFICIAL_JOBS_OG_IMAGE_URL,
  buildOfficialJobsCollectionStructuredData,
  getOfficialJobsListSeo,
} from "@/lib/officialJobs/seo";
import {
  formatOfficialJobsCopy,
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { getPublicOfficialJobListItems } from "@/lib/officialJobs/server";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useSyncExternalStore } from "react";

type OfficialJobsPageProps = {
  jobs: OfficialJobListItem[];
  locale: OfficialJobsLocale;
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

function subscribeToLocalePreferenceChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("focus", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
  };
}

function useOfficialJobsLocale(serverLocale: OfficialJobsLocale) {
  return useSyncExternalStore(
    subscribeToLocalePreferenceChanges,
    getInitialClientLocalePreference,
    () => serverLocale
  );
}

function useAshbyJobRedirect(jobs: OfficialJobListItem[]) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const ashbyJobPostingId =
      getSingleQueryParam(router.query.ashby_jid) ??
      getSingleQueryParam(router.query.jid);
    const normalizedAshbyId = ashbyJobPostingId?.trim();
    if (!normalizedAshbyId) return;

    const job = jobs.find(
      (item) => item.ashbyJobPostingId?.trim() === normalizedAshbyId
    );
    if (!job) return;

    void router.replace(buildRedirectDestination(job.slug, router.query));
  }, [jobs, router]);
}

function OfficialJobsTable({
  jobs,
  locale,
}: {
  jobs: OfficialJobListItem[];
  locale: OfficialJobsLocale;
}) {
  const router = useRouter();
  const copy = getOfficialJobsCopy(locale);

  const trackJobClick = (
    job: OfficialJobListItem,
    source: "jobs_table_row" | "jobs_table_link" | "jobs_mobile_card"
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
  };

  const openJob = (
    job: OfficialJobListItem,
    source: "jobs_table_row" | "jobs_table_link" | "jobs_mobile_card"
  ) => {
    trackJobClick(job, source);
    void router.push(`/jobs/${job.slug}`);
  };

  if (jobs.length === 0) {
    return (
      <div className="rounded-[8px] border border-beige900/10 bg-white/45 px-4 py-5 text-[14px] leading-6 text-black/62">
        {copy.list.empty}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0 md:hidden">
        {jobs.map((job) => {
          return (
            <Link
              key={job.id}
              href={`/jobs/${job.slug}`}
              aria-label={`${job.roleTitle}, ${job.companyName} 자세히 보기`}
              className="group relative block w-full overflow-hidden rounded-[0px] border border-beige900/10 border-b-0 bg-white/50 px-4 py-5 pl-5 text-left transition hover:-translate-y-0.5 hover:border-beige900/20 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-beige700/15 active:translate-y-0"
              onClick={() => trackJobClick(job, "jobs_mobile_card")}
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
            </Link>
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
            <tr className="border-b border-beige900/10 text-[11px] uppercase text-neutral-muted">
              <th className="px-4 py-3 font-medium">
                {copy.list.tableHeaders.role}
              </th>
              <th className="px-4 py-3 font-medium">
                {copy.list.tableHeaders.company}
              </th>
              <th className="px-4 py-3 font-medium">
                {copy.list.tableHeaders.location}
              </th>
              <th className="px-4 py-3 font-medium">
                {copy.list.tableHeaders.vertical}
              </th>
              <th className="px-4 py-3 font-medium text-right">
                {copy.list.tableHeaders.apply}
              </th>
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
                  <Link
                    href={`/jobs/${job.slug}`}
                    className="font-medium text-black underline-offset-4 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      trackJobClick(job, "jobs_table_link");
                    }}
                  >
                    {job.roleTitle}
                  </Link>
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

export default function OfficialJobsPage({
  jobs,
  locale,
}: OfficialJobsPageProps) {
  const jobsQuery = useOfficialJobs(jobs);
  const visibleJobs = jobsQuery.data ?? jobs;
  const resolvedLocale = useOfficialJobsLocale(locale);
  useAshbyJobRedirect(visibleJobs);

  const copy = getOfficialJobsCopy(resolvedLocale);
  const seo = getOfficialJobsListSeo(resolvedLocale);
  const structuredData = buildOfficialJobsCollectionStructuredData(
    visibleJobs,
    resolvedLocale
  );
  const heroTitleLines = copy.list.heroTitle.split("\n");
  const heroBodyLines = copy.list.heroBody.split("\n");

  return (
    <>
      <OfficialJobsEventTracker
        eventType="jobs_list_view"
        metadata={{ jobCount: visibleJobs.length }}
      />
      <Head>
        <title>{seo.listTitle}</title>
        <meta
          key="description"
          name="description"
          content={seo.listDescription}
        />
        <meta
          key="robots"
          name="robots"
          content="index,follow,max-image-preview:large"
        />
        <link rel="canonical" href={OFFICIAL_JOBS_CANONICAL_URL} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={OFFICIAL_JOBS_CANONICAL_URL}
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={seo.ogLocale} />
        <meta property="og:title" content={seo.listTitle} />
        <meta property="og:description" content={seo.listDescription} />
        <meta property="og:url" content={OFFICIAL_JOBS_CANONICAL_URL} />
        <meta property="og:image" content={OFFICIAL_JOBS_OG_IMAGE_URL} />
        <meta property="og:image:alt" content={seo.listTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.listTitle} />
        <meta name="twitter:description" content={seo.listDescription} />
        <meta name="twitter:image" content={OFFICIAL_JOBS_OG_IMAGE_URL} />
        <link rel="icon" href="/images/logo.ico" />
        <script
          key="ld-official-jobs"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </Head>
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <OfficialJobsHeader locale={resolvedLocale} />
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
                  {heroTitleLines.map((line, index) => (
                    <span key={`${index}-${line}`}>
                      {index > 0 ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </h1>
                <p className="mt-4 max-w-[620px] break-keep text-[15px] leading-7 text-black/70">
                  {heroBodyLines.map((line, index) => (
                    <span key={`${index}-${line}`}>
                      {index > 0 ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <OfficialJobsCtaLink
                    className="bg-primary border-none"
                    locale={resolvedLocale}
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
                    {copy.list.learnMore}
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <OfficialJobsTable jobs={visibleJobs} locale={resolvedLocale} />
            </div>
          </PageContainer>
        </main>
        <CareerLandingFooter
          careerStartHref={OFFICIAL_JOBS_LOGIN_HREF}
          labels={copy.footerLabels}
          locale={resolvedLocale}
        />
      </Page>
    </>
  );
}

export const getStaticProps: GetStaticProps<
  OfficialJobsPageProps
> = async () => {
  const jobs = await getPublicOfficialJobListItems();

  return {
    props: {
      jobs,
      locale: "ko",
    },
    revalidate: 60,
  };
};
