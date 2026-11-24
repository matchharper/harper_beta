import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import { TemporalAppBar } from "@/components/landing/temporal/TemporalAppBar";
import { tw } from "@/components/landing/temporal/tw";
import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import { getPublicOfficialJobListItems } from "@/lib/officialJobs/server";
import {
  resolveOfficialJobsLocaleFromRequest,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { usePublicPageVisitLog } from "@/hooks/usePublicPageVisitLog";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { MessagesProvider } from "@/i18n/useMessage";
import { cn } from "@/lib/cn";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { useAuthStore } from "@/store/useAuthStore";

const CONTACT_EMAIL = "chris@matchharper.com";
const HARPER_COMPANY_NAME = "harper";
const HARPER_ABOUT_JOBS_LIMIT = 4;
const ABOUT_PAGE_URL = `${getConfiguredPublicSiteUrl()}/about`;

type AboutPageProps = {
  harperJobs: OfficialJobListItem[];
  locale: OfficialJobsLocale;
};

const ABOUT_COPY = {
  ko: {
    eyebrow: "[ 뛰어난 분들을 모십니다. ]",
    roleIntro:
      "저희의 비전에 공감하시는 분들은 아래 역할을 클릭해서 Harper에게 알려주세요.",
    thanks: "방문해주셔서 감사합니다.",
  },
  en: {
    eyebrow: "[ We are looking for exceptional builders. ]",
    roleIntro:
      "If Harper's vision resonates with you, click a role below and let Harper know.",
    thanks: "Thanks for visiting.",
  },
} as const;

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function isHarperOfficialJob(job: OfficialJobListItem) {
  const normalizedCompanyName = job.companyName.trim().toLowerCase();
  return (
    normalizedCompanyName === HARPER_COMPANY_NAME ||
    normalizedCompanyName === `[${HARPER_COMPANY_NAME}]`
  );
}

export default function AboutPage({ harperJobs, locale }: AboutPageProps) {
  const logCareerEvent = useCareerLogEvent();
  const [aboutLocale, setAboutLocale] = useState<OfficialJobsLocale>(locale);
  const copy = ABOUT_COPY[aboutLocale];
  usePublicPageVisitLog();
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    logCareerEvent("view_about");
  }, [logCareerEvent]);

  useEffect(() => {
    if (!isEmailCopied) return;

    const timeoutId = window.setTimeout(() => {
      setIsEmailCopied(false);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [isEmailCopied]);

  const handleCopyEmail = async () => {
    const didCopy = await copyTextToClipboard(CONTACT_EMAIL);
    if (didCopy) setIsEmailCopied(true);
  };

  return (
    <>
      <Head>
        <title>A Note from the Founders - Harper</title>
        <meta
          name="description"
          content="A note from Harper's founders on why Harper was built."
        />
        <link rel="canonical" href={ABOUT_PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:title" content="A Note from the Founders - Harper" />
        <meta
          property="og:description"
          content="A note from Harper's founders on why Harper was built."
        />
        <meta property="og:url" content={ABOUT_PAGE_URL} />
        <link rel="icon" href="/images/logo.ico" />
      </Head>

      <MessagesProvider locale={aboutLocale}>
        <div id="top" className={cn("career-landing-preview", tw.page)}>
          <TemporalAppBar
            companiesHref={getCompanyLocalePath(aboutLocale)}
            startHref={careerStartHref}
            onStartClick={handleCareerStartClick}
            signedIn={Boolean(user)}
            sectionHrefPrefix="/"
          />

          <main className="relative overflow-hidden px-5 pb-28 pt-32 md:px-10 md:pb-40 md:pt-44">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[-260px] h-[640px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.95),rgb(255_255_255/0))]"
            />
            <article className="relative mx-auto max-w-[760px]">
              <p className="text-[14px] font-medium text-action">
                {copy.eyebrow}
              </p>
              <h1 className={cn("text-lg font-medium mt-5 text-balance")}>
                We are rebuilding how people discover their next team.
              </h1>

              <div className="mt-4 space-y-6 text-[15px] leading-[1.8] tracking-[-0.005em] font-normal text-(--tl-ink-2) md:text-[16px]">
                <p className="text-(--tl-ink)">
                  Everyone deserves equal access to the best builds on earth.
                </p>
                <p>
                  Having spent over a decade building marketplaces, hiring was
                  always the most broken, high-stress bottleneck. Over the last
                  30 years, recruitment tools evolved from newspaper classifieds
                  to web boards and social networks. The interfaces grew
                  flashier, but the primitive mechanism never changed. It
                  remained deeply repetitive, draining, and
                  friction-heavy—requiring massive cognitive energy just to
                  explore a new move.
                </p>
                <p>
                  We realized AI could fundamentally break this paradigm. Harper
                  was built to democratize elite leverage. To level the playing
                  field for exceptional talent who lack private networks, for
                  passive builders who leave their potential unmaximized simply
                  because they hate the job search, and for those who only look
                  at public indexes like LinkedIn when it’s too late, entirely
                  missing the hidden market.
                </p>
                <p className="pt-2 text-base text-(--tl-ink)">
                  — Chris & Daniel
                </p>
              </div>

              <div className="mt-16 border-t border-(--tl-hair) pt-10 text-[15px] leading-[1.7] text-(--tl-ink-2)">
                {copy.roleIntro}
                <br />
                {copy.thanks}
                {harperJobs.length > 0 ? (
                  <ul className="mt-6 list-disc space-y-1.5 pl-5 marker:text-(--tl-ink-3)">
                    {harperJobs.map((job) => (
                      <li key={job.id} className="group/job">
                        <OfficialJobsCtaLink
                          job={job}
                          locale={aboutLocale}
                          variant="transparent"
                          className="min-h-0 justify-start p-0 text-left text-[15px] font-normal leading-[1.7] text-action hover:bg-transparent md:border-0 md:bg-transparent"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span>{job.roleTitle}</span>
                            {/* Slide Blur Swap (슬라이드 블러 스왑): 기존 아이콘은 오른쪽으로 흐려지며 퇴장,
                                새 아이콘은 왼쪽에서 선명해지며 등장. 500ms / 6px / blur 3px.
                                공통 사용 기준: src/styles/Design.md의 Slide Blur Swap. */}
                            <span
                              aria-hidden="true"
                              className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
                            >
                              <ArrowRight className="absolute h-3.5 w-3.5 translate-x-0 opacity-100 blur-[0px] transition-[translate,opacity,filter] duration-500 ease-in-out group-hover/job:translate-x-1.5 group-hover/job:opacity-0 group-hover/job:blur-[3px] group-focus-within/job:translate-x-1.5 group-focus-within/job:opacity-0 group-focus-within/job:blur-[3px] motion-reduce:transition-none" />
                              <span className="absolute -translate-x-1.5 text-[13px] leading-none opacity-0 blur-[3px] transition-[translate,opacity,filter] duration-500 ease-in-out group-hover/job:translate-x-0 group-hover/job:opacity-100 group-hover/job:blur-[0px] group-focus-within/job:translate-x-0 group-focus-within/job:opacity-100 group-focus-within/job:blur-[0px] motion-reduce:transition-none">
                                💼
                              </span>
                            </span>
                          </span>
                        </OfficialJobsCtaLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-8 flex flex-wrap items-center gap-2">
                  <span>Contact</span>
                  <span
                    onClick={handleCopyEmail}
                    className={cn("text-action cursor-pointer")}
                  >
                    {CONTACT_EMAIL}
                  </span>
                  {isEmailCopied ? (
                    <span className="text-[13px] text-(--tl-ink-3)">
                      Copied
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          </main>

          <CareerLandingFooter
            careerStartHref={careerStartHref}
            onCareerStartClick={handleCareerStartClick}
            locale={aboutLocale}
            onLocaleChange={setAboutLocale}
          />
        </div>
      </MessagesProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AboutPageProps> = async (
  context
) => {
  const jobs = await getPublicOfficialJobListItems();
  const harperJobs = jobs
    .filter(isHarperOfficialJob)
    .slice(0, HARPER_ABOUT_JOBS_LIMIT);

  return {
    props: {
      harperJobs,
      locale: resolveOfficialJobsLocaleFromRequest(context.req),
    },
  };
};
