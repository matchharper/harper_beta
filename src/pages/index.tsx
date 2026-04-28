/* eslint-disable @next/next/no-img-element */
import { motion } from "framer-motion";
import Head from "next/head";
import Link from "next/link";
import React, { useMemo } from "react";
import { useMessages } from "@/i18n/useMessage";
import { MATCH_BOOKING_URL } from "@/lib/booking";
import { LANDING_CANONICAL_URL, LANDING_OG_IMAGE_URL } from "./find";

const BOOKING_URL = MATCH_BOOKING_URL;

const trustedCompanies = [
  {
    name: "Pickle",
    src: "/images/logos/pickle.png",
    className: "h-9 sm:h-11",
  },
  {
    name: "Moss",
    src: "/images/logos/moss.png",
    className: "h-9 sm:h-11",
  },
  {
    name: "Aleph",
    src: "/images/logos/aleph.svg",
    className: "h-6 sm:h-7",
  },
  {
    name: "OptimizerAI",
    src: "/images/logos/optimizerai.png",
    className: "h-9 sm:h-11",
  },
];

const valueCards = [
  {
    number: "01",
    title: "Deep indexing",
    description:
      "We go beyond keywords to map real technical impact. By analyzing research papers and open-source contributions, we identify the top 1% who truly understand the domain.",
  },
  {
    number: "02",
    title: "High-velocity matching",
    description:
      "Skip the months of waiting.<br />We leverage AI across search, communication, and matching to maximize speed and eliminate friction.",
  },
  {
    number: "03",
    title: "Harper remembers",
    description:
      "Your technical preferences are stored in our memory, ensuring matching quality compounds as your team grows.",
  },
];

type ButtonProps = {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "light";
  external?: boolean;
  className?: string;
  size?: "sm" | "md";
};

const ButtonLink = ({
  children,
  href,
  variant = "primary",
  external = false,
  className = "",
  size = "md",
}: ButtonProps) => {
  const isSmall = size === "sm";
  const variantClass =
    variant === "primary"
      ? "bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.1)]"
      : variant === "secondary"
        ? "bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        : "bg-beige100 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";

  return (
    <motion.a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${variantClass} ${
        isSmall
          ? "h-[42px] rounded-[12px] px-4 text-[15px]"
          : "h-[58px] rounded-[14px] px-7 text-[15px]"
      } ${className}`}
    >
      <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="relative flex h-full items-start overflow-hidden">
        <span
          className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
          style={{ transitionTimingFunction: "cubic-bezier(.22,1,.36,1)" }}
        >
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[42px]" : "h-[58px]"
            }`}
          >
            {children}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[42px]" : "h-[58px]"
            }`}
          >
            {children}
          </span>
        </span>
      </span>
    </motion.a>
  );
};

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={`relative overflow-hidden rounded-[8px] border border-[#101820]/10 p-5 shadow-[0_18px_50px_rgba(16,24,32,0.05)] sm:p-7 ${className}`}
  >
    {children}
  </section>
);

const LandingPage = () => {
  const { locale } = useMessages();

  const seoMeta = useMemo(() => {
    if (locale === "ko") {
      return {
        title: "Harper | 스타트업 채용을 위한 AI 리크루터",
        description:
          "Harper는 인터넷의 모든 정보를 사용하여 원하는 사람을 찾을 수 있게 도와주는 리크루팅을 위한 도구입니다.",
        ogLocale: "ko_KR",
        language: "ko-KR",
      };
    }

    return {
      title: "Harper | AI Recruiter for Startup Hiring",
      description:
        "Harper helps startup teams discover and prioritize high-fit candidates with AI-powered sourcing.",
      ogLocale: "en_US",
      language: "en-US",
    };
  }, [locale]);

  const softwareApplicationStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Harper",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: seoMeta.language,
      url: LANDING_CANONICAL_URL,
      image: LANDING_OG_IMAGE_URL,
      description: seoMeta.description,
    }),
    [seoMeta.description, seoMeta.language]
  );

  return (
    <>
      <Head>
        <title>{seoMeta.title}</title>
        <meta name="description" content={seoMeta.description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={LANDING_CANONICAL_URL} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={LANDING_CANONICAL_URL}
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={seoMeta.ogLocale} />
        <meta property="og:title" content={seoMeta.title} />
        <meta property="og:description" content={seoMeta.description} />
        <meta property="og:url" content={LANDING_CANONICAL_URL} />
        <meta property="og:image" content={LANDING_OG_IMAGE_URL} />
        <meta property="og:image:alt" content={seoMeta.title} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoMeta.title} />
        <meta name="twitter:description" content={seoMeta.description} />
        <meta name="twitter:image" content={LANDING_OG_IMAGE_URL} />
        <link rel="icon" href="/images/logo.ico" />
        <script
          key="ld-software-app"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationStructuredData),
          }}
        />
      </Head>

      <div className="min-h-screen bg-[#f4eadf] font-geist text-[#101820] antialiased">
        <nav className="fixed inset-x-0 top-0 z-50 bg-beige200/80 backdrop-blur-lg">
          <div className="flex h-[78px] flex-row items-center justify-between px-6 md:px-28">
            <a href="#top" className="font-halant text-3xl leading-none">
              Harper
            </a>
            <div className="flex items-center gap-2">
              <ButtonLink
                href="/search"
                variant="secondary"
                className="hidden sm:inline-flex"
                size="sm"
              >
                Use Search
              </ButtonLink>
              <ButtonLink href={BOOKING_URL} external size="sm">
                Schedule Demo
              </ButtonLink>
            </div>
          </div>
        </nav>

        <main
          id="top"
          className="mx-auto grid max-w-[1360px] grid-cols-1 gap-4 px-4 pb-16 pt-[94px] sm:px-6 lg:grid-cols-6 lg:auto-rows-[188px] lg:px-10 lg:pb-24"
        >
          <Card className="flex min-h-[610px] flex-col justify-between bg-[#fffaf4] lg:col-span-4 lg:row-span-3">
            <div>
              <div className="inline-flex w-fit items-center rounded-[8px] border border-[#101820]/10 bg-white/65 px-3 py-1.5 text-xs font-semibold text-[#51606a]">
                Built by & for AI Talents
              </div>
              <h1 className="mt-8 max-w-[820px] font-halant text-[40px] leading-[0.94] text-[#101820] sm:text-[64px] lg:text-[72px]">
                Hire the top 1% of AI/ML talent in days, not months.
              </h1>
            </div>

            <div>
              <p className="max-w-[600px] text-base leading-[1.65] text-[#51606a] sm:text-lg">
                Skip the months of searching. Connect with proven researchers
                and engineers for both full-time roles and part-time projects
                today.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={BOOKING_URL} external>
                  Get Started Now
                </ButtonLink>
                <ButtonLink href="/search" variant="light">
                  검색 사용해보기
                </ButtonLink>
              </div>
            </div>
          </Card>

          <Card className="flex min-h-[300px] flex-col justify-between bg-[#101820] text-[#fbf7ef] lg:col-span-2 lg:row-span-2">
            <div className="text-sm font-medium text-[#fbf7ef]/60">
              Avg. time to match
            </div>
            <div>
              <div className="flex items-end gap-2 font-halant italic leading-none">
                <span className="text-[108px] sm:text-[132px]">7</span>
                <span className="mb-5 text-3xl not-italic sm:text-4xl">
                  days
                </span>
              </div>
              <p className="mt-4 max-w-[340px] text-sm leading-[1.6] text-[#fbf7ef]/70">
                Fill interviewing capacity in the first day, then refine with
                feedback until the right shortlist is ready.
              </p>
            </div>
          </Card>

          <Card className="flex min-h-[160px] items-center justify-center bg-[#dfe7df] text-center lg:col-span-2 lg:row-span-1">
            <p className="max-w-[360px] font-halant text-3xl italic leading-[1.08] text-[#31443d]">
              Proven technical talent
            </p>
          </Card>

          {valueCards.map((item, index) => (
            <Card
              key={item.number}
              className={`flex min-h-[320px] flex-col justify-between lg:col-span-2 lg:row-span-2 ${
                index === 1
                  ? "bg-[#e7d8ca]"
                  : index === 2
                    ? "bg-[#eef1ef]"
                    : "bg-[#fbf7ef]"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#101820] font-halant text-xl italic text-[#fbf7ef]">
                {item.number}
              </div>
              <div>
                <h2 className="font-halant text-4xl leading-[1.02]">
                  {item.title}
                </h2>
                <p
                  className="mt-4 text-[15px] leading-[1.62] text-[#51606a]"
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              </div>
            </Card>
          ))}

          <Card className="flex min-h-[360px] flex-col justify-between bg-[#fffaf4] lg:col-span-3 lg:row-span-2">
            <div />
            <div>
              <p className="font-halant text-[34px] leading-[1.12] text-[#101820] sm:text-[42px]">
                “Harper sent us three ML engineers — all three passed our bar.
                We hired two within a week.”
              </p>
              <p className="mt-6 text-sm font-medium leading-[1.6] text-[#51606a]">
                — VP Engineering, Series B startup
              </p>
            </div>
          </Card>

          <Card className="flex min-h-[320px] flex-col justify-between bg-[#b56f4f] text-white lg:col-span-2 lg:row-span-2">
            <div className="text-sm font-medium text-white/70">
              Cost reduction
            </div>
            <div>
              <div className="font-halant text-[108px] leading-none sm:text-[122px]">
                70%
              </div>
              <p className="mt-4 max-w-[320px] text-sm leading-[1.6] text-white/75">
                Lower cost than traditional agencies.
              </p>
            </div>
          </Card>

          <Card className="flex min-h-[190px] flex-col justify-between bg-transparent shadow-none lg:col-span-3 lg:row-span-1">
            <p className="max-w-[240px] text-sm leading-[1.55] text-[#51606a]">
              Trusted by AI companies like Pickle, Moss, Aleph Lab, OptimizerAI
              and many others.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-5">
              {trustedCompanies.map((company) => (
                <img
                  key={company.name}
                  src={company.src}
                  alt={company.name}
                  className={`${company.className} w-auto object-contain opacity-85 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0`}
                />
              ))}
            </div>
          </Card>

          <Card className="flex min-h-[330px] flex-col items-start justify-center bg-[#101820] text-[#fbf7ef] sm:items-center sm:text-center lg:col-span-6 lg:row-span-2">
            <h2 className="max-w-[840px] font-halant text-4xl leading-[0.96] sm:text-5xl">
              Your next hire is already in our network.
            </h2>
            <div className="mt-8">
              <ButtonLink href={BOOKING_URL} variant="light" external>
                Schedule Demo
              </ButtonLink>
            </div>
          </Card>
        </main>

        <footer className="border-t border-[#101820]/10 px-4 py-10 text-[#51606a] sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[1360px] flex-col gap-8 text-sm lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-halant text-3xl text-[#101820]">Harper</div>
              <div className="mt-3">Harper © 2026</div>
              <div className="mt-5 leading-[1.7]">
                <div>상호명 : 주식회사 하퍼</div>
                <div>대표자명 : HEO HONGBEOM</div>
                <div>사업자등록번호 : 314-86-68621</div>
                <div>
                  사업장 주소 : 서울특별시 강남구 논현로10길 30, 505-제이
                  16(개포동)
                </div>
                <div>유선번호 : 010-7157-7537</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:justify-end">
              <Link href="/terms" className="hover:text-[#101820]">
                Terms
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="hover:text-[#101820]">
                Privacy
              </Link>
              <span aria-hidden="true">·</span>
              <a
                href="https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#101820]"
              >
                Refund Policy
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="mailto:chris@matchharper.com"
                className="hover:text-[#101820]"
              >
                Contact
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;
