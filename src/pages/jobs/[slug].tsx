import OfficialJobsExperience from "@/components/jobs/OfficialJobsExperience";
import {
  assignOfficialJobsLayoutVariant,
  assignOfficialJobsOneScreenArm,
} from "@/lib/officialJobs/experiment.server";
import type { OfficialJobsLayoutVariant } from "@/lib/officialJobs/experiment";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import OfficialJobMarkdown from "@/components/jobs/OfficialJobMarkdown";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import OfficialJobsEventTracker from "@/components/jobs/OfficialJobsEventTracker";
import OfficialJobsHeader from "@/components/jobs/OfficialJobsHeader";
import OfficialJobOneScreen from "@/components/jobs/OfficialJobOneScreen";
import OfficialJobsOneScreenCtaLink from "@/components/jobs/OfficialJobsOneScreenCta";
import {
  OFFICIAL_JOBS_ONESCREEN_ANCHOR_ID,
  buildOfficialJobsOneScreenHrefs,
  type OfficialJobsOneScreenHrefs,
} from "@/components/jobs/oneScreenLinks";
import OfficialJobsReferralCta from "@/components/jobs/OfficialJobsReferralCta";
import { OneScreenOrDivider } from "@/components/jobs/OfficialJobOneScreenParts";
import { MuteButton } from "@/components/ui/button";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { officialJobsInfiniteOptions } from "@/hooks/officialJobs/useOfficialJobs";
import { postOfficialJobEvent } from "@/lib/officialJobs/events";
import {
  buildOfficialJobsCareerHref,
  buildOfficialJobsLoginHref,
  type OfficialJob,
} from "@/lib/officialJobs";
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
import { getOfficialJobPage } from "@/lib/officialJobs/server";
import {
  OFFICIAL_JOBS_ONESCREEN_ROLLOUT,
  decideOfficialJobsOneScreenScope,
  type OfficialJobsOneScreenArm,
  type OfficialJobsOneScreenKind,
} from "@/lib/officialJobs/oneScreen";
import { getOneScreenCopy } from "@/lib/officialJobs/oneScreenCopy";
import { isOfficialJobsSimilarRequestOpen } from "@/lib/officialJobs/similarRequest.server";
import { useTalentNetworkReferralCapture } from "@/hooks/useTalentNetworkReferralCapture";
import { useRememberGtmInvite } from "@/hooks/career/useGtmInviteClaim";
import { useGtmMailOpened } from "@/hooks/gtmPlays/useGtmMailOpened";
import { TALENT_NETWORK_REFERRAL_SOURCE_OFFICIAL_JOB } from "@/lib/talentNetworkReferral";
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
import { useEffect, useState, type ReactNode } from "react";

/** This posting's one screen; the page is unchanged unless `show`. */
type OfficialJobOneScreenState = {
  kind: OfficialJobsOneScreenKind;
  /** The visitor's A/B arm; null when the posting shows the one screen without an A/B. */
  arm: OfficialJobsOneScreenArm | null;
  /** Out of an A/B, or arm B of one. */
  show: boolean;
  /** "비슷한 공고 추천받기" can take a request now. */
  similarOpen: boolean;
};

type ShownOneScreen = OfficialJobOneScreenState & {
  hrefs: OfficialJobsOneScreenHrefs;
};

type OfficialJobDetailPageProps = {
  job: OfficialJob;
  locale: OfficialJobsLocale;
  layoutVariant: OfficialJobsLayoutVariant;
  /** Null for a posting outside the one screen (it never gets the arm cookie). */
  oneScreen: OfficialJobOneScreenState | null;
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

/**
 * Below lg, where Talk to Harper is on a posting that shows the one screen:
 * orange opens the one screen, black (under "또는") opens it on the similar-postings form.
 * A closed role's posting has only the black one.
 */
function OneScreenEntryButtons({
  className,
  locale,
  oneScreen,
  onTalkClick,
}: {
  className: string;
  locale: OfficialJobsLocale;
  oneScreen: ShownOneScreen;
  onTalkClick: () => void;
}) {
  const talk = oneScreen.kind !== "closed";
  if (!talk && !oneScreen.similarOpen) return null;

  return (
    <div className={className}>
      {talk && (
        <OfficialJobsOneScreenCtaLink
          fullWidth
          href={oneScreen.hrefs.join}
          size="lg"
          variant="primary"
          onClick={onTalkClick}
        >
          {getOfficialJobsCopy(locale).cta.control}
        </OfficialJobsOneScreenCtaLink>
      )}
      {talk && oneScreen.similarOpen && (
        <OneScreenOrDivider label={getOneScreenCopy(locale).divider} />
      )}
      {oneScreen.similarOpen && (
        <MuteButton asChild variant="dark" className="w-full" size="lg">
          <Link href={oneScreen.hrefs.similar} shallow>
            {getOneScreenCopy(locale).similarButton}
          </Link>
        </MuteButton>
      )}
    </div>
  );
}

export default function OfficialJobDetailPage({
  job,
  locale,
  layoutVariant,
  oneScreen,
}: OfficialJobDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const copy = getOfficialJobsCopy(locale);
  const pageTitle = buildOfficialJobTitle(job, locale);
  const pageDescription = buildOfficialJobDescription(job, locale);
  const canonicalUrl = buildOfficialJobCanonicalUrl(job.slug);
  const jobCareerHref = buildOfficialJobsCareerHref(job);
  const jobLoginHref = buildOfficialJobsLoginHref(null, jobCareerHref);
  const publishedIsoDate = toIsoDateTime(job.publishedAt);
  const updatedIsoDate = toIsoDateTime(job.updatedAt);
  const structuredData = buildOfficialJobStructuredData(job, locale);
  const jobPath = `/jobs/${encodeURIComponent(job.slug)}`;
  const shown: ShownOneScreen | null = oneScreen?.show
    ? {
        ...oneScreen,
        hrefs: buildOfficialJobsOneScreenHrefs(jobPath, router.asPath),
      }
    : null;
  // ?onescreen=1 counts only where the one screen shows; elsewhere it is ignored.
  const oneScreenPage = Boolean(shown) && router.query.onescreen === "1";
  const oneScreenMode =
    router.query.mode === "similar" && shown?.similarOpen ? "similar" : "join";
  const closedRole = oneScreen?.kind === "closed";
  // job_detail_view once the posting itself has been on screen. The tracker
  // stays mounted while the visitor moves to ?onescreen=1 and back, so that
  // round trip is not a second view.
  const [postingSeen, setPostingSeen] = useState(!oneScreenPage);
  if (!oneScreenPage && !postingSeen) setPostingSeen(true);
  useTalentNetworkReferralCapture(TALENT_NETWORK_REFERRAL_SOURCE_OFFICIAL_JOB);
  // Opened from a Harper GTM mail (?gtm=…): counted on that mail once they sign up from here.
  useRememberGtmInvite();
  // ?gtm=…: counted on that mail as a click once the page has been on screen for a second.
  useGtmMailOpened();
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
    void queryClient.prefetchInfiniteQuery(officialJobsInfiniteOptions);
  }, [queryClient, router]);

  const tracker = postingSeen ? (
    <OfficialJobsEventTracker
      eventType="job_detail_view"
      jobSlug={job.slug}
      metadata={{
        layoutVariant,
        companyName: job.companyName,
        roleTitle: job.roleTitle,
      }}
    />
  ) : null;
  const head = (
    <Head>
      <title>{pageTitle}</title>
      <meta key="description" name="description" content={pageDescription} />
      <meta
        key="robots"
        name="robots"
        content={
          closedRole || oneScreenPage
            ? "noindex"
            : "index,follow,max-image-preview:large"
        }
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
      <style>{`
          html,
          body {
            overflow-x: clip;
          }
        `}</style>
      {/* A closed role is no longer a job offer to search engines. */}
      {!closedRole && (
        <script
          key={`ld-official-job-${job.slug}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      )}
    </Head>
  );

  if (shown && oneScreenPage) {
    return (
      <>
        {tracker}
        {head}
        <OfficialJobOneScreen
          key={oneScreenMode}
          job={job}
          kind={shown.kind}
          arm={shown.arm}
          locale={locale}
          layout="page"
          similarOpen={shown.similarOpen}
          initialMode={oneScreenMode}
          postingHref={shown.hrefs.posting}
        />
      </>
    );
  }

  return (
    <>
      {tracker}
      {head}
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <OfficialJobsHeader job={job} locale={locale} hideCta={Boolean(shown)} />
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

            <div className="relative mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="min-w-0">
                {job.vertical && (
                  <span className="py-1.5 px-4 rounded-full bg-surface-tint text-[14px] font-normal text-neutral-primary">
                    {job.vertical}
                  </span>
                )}
                <h1 className="mt-6 max-w-[680px] text-[24px] md:text-[32px] wrap-break-word font-normal md:font-medium leading-[1.4] text-neutral-primary">
                  {job.roleTitle}
                </h1>
                <div className="mt-4 max-w-[720px] text-neutral-primary text-[13px] md:text-[15px] flex flex-row flex-wrap items-center gap-4">
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
                <p className="mt-6 max-w-[720px] break-keep text-[14px] md:text-[16px] leading-7 text-neutral-primary/70">
                  {job.shortDescription}
                </p>
                {shown ? (
                  // PC has the card in the aside instead (lg).
                  <OneScreenEntryButtons
                    className="mt-8 flex flex-col gap-2 w-full md:w-fit lg:hidden"
                    locale={locale}
                    oneScreen={shown}
                    onTalkClick={() => trackApplyClick("detail_primary")}
                  />
                ) : (
                  <div className="mt-8 flex flex-col gap-2 w-full md:w-fit">
                    <OfficialJobsCtaLink
                      job={job}
                      locale={locale}
                      size="lg"
                      variant="primary"
                      onClick={() => trackApplyClick("detail_primary")}
                    />
                  </div>
                )}
                <div className="mt-14 space-y-8 rounded-sm border border-bg-floating/0 md:border-beige900/10 bg-bg-floating/0 md:bg-bg-floating/35 p-0 md:p-8">
                  <OfficialJobMarkdown content={job.roleDescriptionMarkdown} />
                </div>
              </div>

              <aside
                className={
                  shown
                    ? // The card is taller than a laptop screen (about 1,080px): it
                      // scrolls with the page, so its button is reached by scrolling
                      // the page (an inner scroll hid it: Mac shows no scrollbar).
                      "space-y-3 lg:self-start"
                    : "space-y-3 lg:sticky lg:top-4 lg:self-start"
                }
              >
                {shown && (
                  <div
                    id={OFFICIAL_JOBS_ONESCREEN_ANCHOR_ID}
                    tabIndex={-1}
                    className="hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 lg:block"
                  >
                    <OfficialJobOneScreen
                      job={job}
                      kind={shown.kind}
                      arm={shown.arm}
                      locale={locale}
                      layout="card"
                      similarOpen={shown.similarOpen}
                      postingHref={shown.hrefs.posting}
                    />
                  </div>
                )}
                <section
                  className={
                    shown
                      ? "rounded-md border border-beige900/10 bg-bg-floating/65 p-4 lg:hidden"
                      : "rounded-md border border-beige900/10 bg-bg-floating/65 p-4"
                  }
                >
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 p-1">
                      <h2 className="text-[18px] font-medium leading-snug text-beige900">
                        {job.companyName}
                      </h2>
                    </div>
                  </div>

                  <dl className="mt-5 overflow-hidden rounded-sm border border-beige900/5 bg-beige50/65">
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

                  {shown ? (
                    <OneScreenEntryButtons
                      className="mt-5 flex flex-col gap-2"
                      locale={locale}
                      oneScreen={shown}
                      onTalkClick={() => trackApplyClick("detail_sidebar")}
                    />
                  ) : (
                    <div className="mt-5 flex flex-col gap-2">
                      <OfficialJobsCtaLink
                        fullWidth
                        job={job}
                        locale={locale}
                        size="lg"
                        onClick={() => trackApplyClick("detail_sidebar")}
                      />
                    </div>
                  )}
                </section>

                {/* Arm B (the one screen) leaves Refer & Earn out: one thing to do on the page. */}
                {!shown && (
                  <OfficialJobsReferralCta jobPath={jobPath} locale={locale} />
                )}

                {/* <section className="overflow-hidden">
                  <Image
                    src="/images/feat33.png"
                    alt="Harper가 역할을 좁혀가는 화면"
                    width={1442}
                    height={440}
                    className="h-auto w-full object-cover"
                  />
                  <p className="mt-2 text-center w-full text-[13px] leading-6 text-neutral-primary/70">
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
          {layoutVariant === "B" && (
            <OfficialJobsExperience
              locale={locale}
              job={job}
              oneScreenHref={shown?.hrefs.join}
            />
          )}
        </main>
        <CareerLandingFooter
          careerStartHref={jobLoginHref}
          locale={locale}
          onCareerStartClick={() => trackApplyClick("jobs_footer")}
        />
      </Page>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<
  OfficialJobDetailPageProps
> = async (context) => {
  const layoutVariant = assignOfficialJobsLayoutVariant(context);
  const slug = context.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const page = await getOfficialJobPage(slug, {
    includeClosedRole: OFFICIAL_JOBS_ONESCREEN_ROLLOUT.closedRoleCard,
  });

  // Found by id: the posting's address is its slug. (Found by slug, the slug matches.)
  if (page && page.job.slug !== slug) {
    return {
      redirect: {
        destination: `/jobs/${encodeURIComponent(page.job.slug)}`,
        statusCode: 301,
      },
    };
  }

  if (!page) {
    return { notFound: true };
  }

  const { job, linkedRole } = page;
  const scope = decideOfficialJobsOneScreenScope({
    roleId: job.roleId,
    linkedRole,
  });
  // Only A/B postings set the arm cookie. A browser without it that opens
  // ?onescreen=1 (a URL only arm B is shown) is arm B changing browsers.
  const arm = scope?.abTest
    ? assignOfficialJobsOneScreenArm(
        context,
        context.query.onescreen === "1" ? { initialArm: "B" } : undefined
      )
    : null;
  const show = Boolean(scope) && (!scope?.abTest || arm === "B");
  const similarOpen = show ? await readSimilarRequestOpen() : false;

  return {
    props: {
      job,
      layoutVariant,
      locale: resolveOfficialJobsLocaleFromRequest(context.req),
      oneScreen: scope ? { kind: scope.kind, arm, show, similarOpen } : null,
    },
  };
};

/** A failing check hides the similar-postings button instead of failing the page. */
async function readSimilarRequestOpen() {
  try {
    return await isOfficialJobsSimilarRequestOpen();
  } catch (error) {
    console.warn("official_jobs similar request check failed:", error);
    return false;
  }
}
