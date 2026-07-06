import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
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

const CONTACT_EMAIL = "chris@matchharper.com";
const HARPER_COMPANY_NAME = "harper";
const HARPER_ABOUT_JOBS_LIMIT = 4;

type AboutPageProps = {
  harperJobs: OfficialJobListItem[];
  locale: OfficialJobsLocale;
};

const ABOUT_COPY = {
  ko: {
    appBar: {
      workflow: "제품 화면",
      difference: "다른점",
      voices: "후기",
      forCompanies: "For Companies",
      join: "Join",
    },
    eyebrow: "[ 뛰어난 분들을 모십니다. ]",
    roleIntro:
      "저희의 비전에 공감하시는 분들은 아래 역할을 클릭해서 Harper에게 알려주세요.",
    thanks: "방문해주셔서 감사합니다.",
    footer: {
      start: "시작하기",
      howItWorks: "How it works",
      successStories: "Success stories",
      forTalent: "For Talent",
      forCompanies: "For Companies",
      company: "Company",
      harperForCompanies: "Harper for Companies",
      scheduleCall: "Schedule a call",
      blog: "Blog",
      linkedin: "LinkedIn",
      contact: "문의하기",
    },
  },
  en: {
    appBar: {
      workflow: "Product",
      difference: "Difference",
      voices: "Stories",
      forCompanies: "For Companies",
      join: "Join",
    },
    eyebrow: "[ We are looking for exceptional builders. ]",
    roleIntro:
      "If Harper's vision resonates with you, click a role below and let Harper know.",
    thanks: "Thanks for visiting.",
    footer: {
      start: "Get started",
      howItWorks: "How it works",
      successStories: "Success stories",
      forTalent: "For Talent",
      forCompanies: "For Companies",
      company: "Company",
      harperForCompanies: "Harper for Companies",
      scheduleCall: "Schedule a call",
      blog: "Blog",
      linkedin: "LinkedIn",
      contact: "Contact",
    },
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
  return job.companyName.trim().toLowerCase() === HARPER_COMPANY_NAME;
}

export default function AboutPage({ harperJobs, locale }: AboutPageProps) {
  const [aboutLocale, setAboutLocale] = useState<OfficialJobsLocale>(locale);
  const copy = ABOUT_COPY[aboutLocale];
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });
  const [isEmailCopied, setIsEmailCopied] = useState(false);

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
        <link rel="icon" href="/images/logo.ico" />
      </Head>

      <div
        id="top"
        className="min-h-screen font-sans bg-neutral-100 text-neutral-950"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          labels={copy.appBar}
          sectionHrefPrefix="/"
          bgColor="neutral-100"
        />

        <main className="px-4 pb-24 pt-28 md:px-10 md:pb-[50vh] md:pt-32 min-h-screen">
          <article className="mx-auto max-w-[820px]">
            <p className="font-light mb-2 text-primary text-sm">
              {copy.eyebrow}
            </p>
            <h1 className="font-medium">
              We are rebuilding how people discover their next team.
            </h1>

            <div className="mt-6 text-base max-w-[620px] space-y-6 font-light text-neutral-800">
              <p>Everyone deserves equal access to the best builds on earth.</p>
              <p>
                Having spent over a decade building marketplaces, hiring was
                always the most broken, high-stress bottleneck. Over the last 30
                years, recruitment tools evolved from newspaper classifieds to
                web boards and social networks. The interfaces grew flashier,
                but the primitive mechanism never changed. It remained deeply
                repetitive, draining, and friction-heavy—requiring massive
                cognitive energy just to explore a new move.
              </p>
              <p>
                We realized AI could fundamentally break this paradigm. Harper
                was built to democratize elite leverage. To level the playing
                field for exceptional talent who lack private networks, for
                passive builders who leave their potential unmaximized simply
                because they hate the job search, and for those who only look at
                public indexes like LinkedIn when it’s too late, entirely
                missing the hidden market.
              </p>
              <p className="pt-3 italic text-neutral-950">— Chris & Daniel</p>
            </div>

            <div className="mt-12 max-w-[620px] leading-6 text-[15px] font-light text-neutral-800">
              {copy.roleIntro}
              <br />
              {copy.thanks}
              {harperJobs.length > 0 ? (
                <div className="mb-12 mt-12 space-y-2">
                  {harperJobs.map((job) => (
                    <div key={job.id}>
                      <OfficialJobsCtaLink
                        job={job}
                        locale={aboutLocale}
                        variant="secondary"
                        className="min-h-0 justify-start text-left text-[15px] p-0 font-light leading-6 text-blue-600 hover:bg-transparent hover:text-primary md:border-0 md:bg-transparent"
                      >
                        <div className="flex flex-row items-center justify-start gap-1.5 group ">
                          <span>{job.roleTitle}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                        </div>
                      </OfficialJobsCtaLink>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2">
                Contact:{" "}
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="cursor-pointer text-blue-600 transition-colors hover:text-blue-700"
                >
                  {CONTACT_EMAIL}
                </button>
                {isEmailCopied ? (
                  <span className="ml-2 text-[13px] text-neutral-500">
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
          labels={copy.footer}
          locale={aboutLocale}
          onLocaleChange={setAboutLocale}
        />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<
  AboutPageProps
> = async (context) => {
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
