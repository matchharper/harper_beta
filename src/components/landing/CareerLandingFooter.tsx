import Link from "next/link";
import Image from "next/image";
import type React from "react";
import { ArrowUpRight, ChevronDown, Globe2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { persistLocalePreference } from "@/i18n/useMessage";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import Face from "../common/Face";
import { cn } from "@/lib/cn";
import {
  SERVICE_STATUS_PAGE_URL,
  type ServiceStatus,
  type ServiceStatusResponse,
} from "@/lib/serviceStatus";
// import { useCareerT } from "@/i18n/useCareerT";

type FooterLocale = "ko" | "en";
type FooterTheme = "light" | "dark";

type CareerLandingFooterProps = {
  careerStartHref: string;
  onCareerStartClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onScheduleCallClick?: React.MouseEventHandler<HTMLButtonElement>;
  locale?: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
  showLocaleSwitcher?: boolean;
  theme?: FooterTheme;
  audience?: "talent" | "company";
};

const blockStyle = "flex flex-col items-start justify-start md:min-w-[180px]";

const SERVICE_STATUS_COPY: Record<
  FooterLocale,
  Record<ServiceStatus, string>
> = {
  ko: {
    operational: "모든 서비스 정상 운영 중",
    incident: "일부 서비스에 문제가 있습니다",
    maintenance: "서비스 점검 중",
    unknown: "서비스 상태",
  },
  en: {
    operational: "All systems operational",
    incident: "Some systems are experiencing issues",
    maintenance: "Maintenance in progress",
    unknown: "Service status",
  },
};

const SERVICE_STATUS_DOT: Record<ServiceStatus, string> = {
  operational: "bg-positive",
  incident: "bg-critical",
  maintenance: "bg-info",
  unknown: "bg-neutral-500",
};

const FOOTER_COPY: Record<
  FooterLocale,
  {
    start: string;
    howItWorks: string;
    successStories: string;
    referAndEarn: string;
    jobs: string;
    about: string;
    blog: string;
    forTalent: string;
    forCompanies: string;
    company: string;
    harperForCompanies: string;
    pricing: string;
    scheduleCall: string;
    linkedin: string;
    contact: string;
    privacy: string;
    referralTerms: string;
  }
> = {
  ko: {
    start: "시작하기",
    howItWorks: "How it works",
    successStories: "Success stories",
    referAndEarn: "추천하고 보상받기",
    jobs: "채용 기회",
    about: "Harper 소개",
    blog: "블로그",
    forTalent: "For Talent",
    forCompanies: "For Companies",
    company: "Company",
    harperForCompanies: "Harper for Companies",
    pricing: "Pricing",
    scheduleCall: "Schedule a call",
    linkedin: "LinkedIn",
    contact: "문의하기",
    privacy: "개인정보 처리방침",
    referralTerms: "추천 프로그램 약관",
  },
  en: {
    start: "Get started",
    howItWorks: "How it works",
    successStories: "Success stories",
    referAndEarn: "Refer and earn",
    jobs: "Explore jobs",
    about: "About Harper",
    blog: "Blog",
    forTalent: "For Talent",
    forCompanies: "For Companies",
    company: "Company",
    harperForCompanies: "Harper for Companies",
    pricing: "Pricing",
    scheduleCall: "Schedule a call",
    linkedin: "LinkedIn",
    contact: "Contact",
    privacy: "Privacy",
    referralTerms: "Referral terms",
  },
};

const languageOptions: readonly {
  value: FooterLocale;
  label: string;
  flag: string;
  flagLabel: string;
}[] = [
  {
    value: "en",
    label: "English",
    flag: "🇺🇸",
    flagLabel: "United States flag",
  },
  { value: "ko", label: "한국어", flag: "🇰🇷", flagLabel: "South Korea flag" },
];

function CountryFlag({
  flag,
  label,
  className = "",
}: {
  flag: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[16px] leading-none ${className}`}
      role="img"
    >
      {flag}
    </span>
  );
}

function FooterLanguageDropdown({
  locale,
  onLocaleChange,
  theme,
  compact = false,
}: {
  locale: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
  theme: FooterTheme;
  compact?: boolean;
}) {
  const selected = languageOptions.find((option) => option.value === locale);
  const isDark = theme === "dark";

  const handleLocaleSelect = (nextLocale: FooterLocale) => {
    if (nextLocale === locale) return;

    persistLocalePreference(nextLocale);
    if (onLocaleChange) {
      onLocaleChange(nextLocale);
      return;
    }

    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={locale === "ko" ? "언어 선택" : "Choose language"}
          className={`${compact ? "" : "mt-5"} inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus:outline-none focus:ring-2 ${
            isDark
              ? "border-white/20 bg-white/10 text-white/80 hover:border-white/35 hover:bg-white/15 hover:text-white focus:ring-white/30"
              : "border-black/10 bg-white text-black/60 hover:border-black/20 hover:bg-black/[0.03] hover:text-black focus:ring-black/10"
          }`}
        >
          {compact ? (
            <Globe2 size={14} strokeWidth={1.5} aria-hidden="true" />
          ) : selected ? (
            <CountryFlag flag={selected.flag} label={selected.flagLabel} />
          ) : null}
          <span>{selected?.label ?? "English"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={`min-w-[136px] ${
          isDark ? "border-white/20 bg-neutral-900 text-white" : ""
        }`}
      >
        {languageOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            selected={option.value === locale}
            onSelect={() => handleLocaleSelect(option.value)}
            className={
              isDark
                ? `text-white hover:bg-white/10 focus:bg-white/10 focus:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white [&>svg]:text-white/60 ${
                    option.value === locale ? "bg-white/10" : ""
                  }`
                : undefined
            }
          >
            <CountryFlag
              flag={option.flag}
              label={option.flagLabel}
              className="h-5 w-5 text-[17px]"
            />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CareerLandingFooter({
  careerStartHref,
  onCareerStartClick,
  onScheduleCallClick,
  locale,
  onLocaleChange,
  showLocaleSwitcher = true,
  theme = "light",
  audience = "talent",
}: CareerLandingFooterProps) {
  const isDark = theme === "dark";
  const resolvedLocale = locale ?? "ko";
  const statusQuery = useQuery<ServiceStatusResponse>({
    queryKey: ["public-service-status"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/service-status", { signal });
      if (!response.ok) throw new Error("Service status unavailable");
      return response.json();
    },
    enabled: Boolean(SERVICE_STATUS_PAGE_URL),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const serviceStatus = statusQuery.isError
    ? "unknown"
    : (statusQuery.data?.status ?? "unknown");
  const companyPageHref = getCompanyLocalePath(resolvedLocale);
  const companyContactHref = `${companyPageHref}#company-contact`;
  const labels = FOOTER_COPY[resolvedLocale];
  const openSupportChat = () => {
    openCustomCrispWidget();
  };

  const liststyle = `mt-4 flex flex-col gap-2 md:gap-3 text-xs md:text-sm font-light ${
    isDark ? "text-white/90" : "text-black/90"
  }`;
  const liStyle = `cursor-pointer text-xs md:text-sm font-light hover:font-normal transition duration-300 ${
    isDark ? "text-white/90 hover:text-white" : "text-black hover:text-black/90"
  }`;
  const labelStyle = isDark
    ? "font-light text-sm text-white/60"
    : "font-light text-sm text-neutral-700/80";
  const strongTextStyle = isDark ? "text-white" : "text-black";

  if (audience === "company") {
    const isKo = resolvedLocale === "ko";
    return (
      <footer
        className="overflow-hidden border-t border-neutral-1000-a10 bg-bg-weak text-neutral-primary [&_a]:underline-offset-[5px] [&_a:hover]:underline [&_a:focus-visible]:rounded-[2px] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-[5px] [&_a:focus-visible]:outline-action"
        lang={resolvedLocale}
      >
        <div className="mx-auto max-w-[1244px] px-[22px] pt-12 pb-6 md:px-10 md:pt-18 md:pb-7">
          <div className="grid grid-cols-1 gap-[42px] md:grid-cols-[0.7fr_1fr] md:gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-24">
            <div className="flex flex-col items-start">
              <Link
                href={companyPageHref}
                className="hover:opacity-65 motion-safe:transition-opacity motion-safe:duration-[160ms] motion-safe:ease-[ease]"
                aria-label={isKo ? "Harper 기업 홈" : "Harper for Companies"}
              >
                <Image
                  src="/svgs/logov2.svg"
                  alt="Harper"
                  width={86}
                  height={32}
                  className="h-auto w-[74px] md:w-[86px]"
                />
              </Link>
              <p
                className="font-hedvig mt-5 mb-3.5 text-lg leading-[1.6] font-medium tracking-tight break-keep md:mt-[26px] md:mb-[22px]"
                lang="en"
              >
                Get introduced to your dream role.
                <br />
                <span className="text-neutral-muted">With Harper.</span>
              </p>
            </div>
            <nav
              className="grid grid-cols-3 gap-5"
              aria-label={isKo ? "Harper 페이지" : "Harper pages"}
            >
              <div>
                <h3 className="mt-0.5 mb-3 text-[13px] font-light tracking-[0.01em] text-neutral-muted md:text-sm">
                  For Companies
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  <li>
                    <Link
                      // href={`/org?lang=${resolvedLocale}`}
                      href={`${companyPageHref}#company-contact`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {/* {isKo ? "무료로 시작하기" : "Start for free"} */}
                      {isKo ? "미팅 신청하기" : "Request a demo"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${companyPageHref}#company-process`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "채용 과정" : "How it works"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/pricing?lang=${resolvedLocale}`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "요금제" : "Pricing"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${companyPageHref}#company-faq`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "자주 묻는 질문" : "FAQ"}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mt-0.5 mb-3 text-[13px] font-light tracking-[0.01em] text-neutral-muted md:text-sm">
                  For Talent
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  <li>
                    <Link
                      href={careerStartHref}
                      onClick={onCareerStartClick}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "Harper와 대화하기" : "Meet Harper"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/jobs?lang=${resolvedLocale}`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "채용 기회" : "Explore jobs"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/refer?lang=${resolvedLocale}`}
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "친구 추천하기" : "Refer a friend"}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mt-0.5 mb-3 text-[13px] font-light tracking-[0.01em] text-neutral-muted md:text-sm">
                  Harper
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  <li>
                    <Link
                      href="/about"
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "Harper 소개" : "About us"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/blog"
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "블로그" : "Blog"}
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://www.linkedin.com/company/matchharper/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      LinkedIn
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:chris@matchharper.com"
                      className="inline-flex items-center gap-1 py-0.5 text-sm leading-normal font-light md:text-[15px]"
                    >
                      {isKo ? "문의하기" : "Contact"}
                    </a>
                  </li>
                </ul>
              </div>
            </nav>
          </div>
          <div
            className="relative isolate mt-8 mb-7 pt-4.5 pb-2 md:mt-16 md:mb-9 md:pt-[26px]"
            aria-hidden="true"
          >
            <Image
              src="/svgs/logov2.svg"
              alt=""
              width={627}
              height={185}
              className="block h-auto w-full"
            />
          </div>
          <div className="flex flex-col items-start justify-between gap-4.5 border-t border-neutral-1000-a10 pt-[22px] text-[11px] leading-[1.6] text-neutral-muted md:flex-row md:gap-6 lg:items-center">
            <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2 md:gap-3 lg:gap-5">
              <span className="basis-full md:basis-auto">© 2026 Harper</span>
              <Link href={`/privacy?lang=${resolvedLocale}`} className="py-1.5">
                {labels.privacy}
              </Link>
              <Link
                href={`/referral-terms?lang=${resolvedLocale}`}
                className="py-1.5"
              >
                {labels.referralTerms}
              </Link>
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-5 md:w-auto md:justify-start">
              {SERVICE_STATUS_PAGE_URL ? (
                <a
                  href={SERVICE_STATUS_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[7px] text-[11px]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      SERVICE_STATUS_DOT[serviceStatus]
                    )}
                  />
                  {SERVICE_STATUS_COPY[resolvedLocale][serviceStatus]}
                </a>
              ) : null}
              {locale && showLocaleSwitcher ? (
                <FooterLanguageDropdown
                  locale={locale}
                  onLocaleChange={onLocaleChange}
                  theme="light"
                  compact
                />
              ) : null}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className={`border-t px-4 py-14 text-[12px] md:px-10 md:py-16 ${
        isDark
          ? "border-white/15 bg-neutral-950 text-white"
          : "border-black/10 bg-white text-black"
      }`}
    >
      <div className="mx-auto max-w-[1140px]">
        <div className="flex flex-col items-start justify-between gap-10 md:pb-16 pb-10 lg:flex-row">
          <div className="max-w-[360px]">
            <div className="flex items-center gap-2">
              <Face size={36} />
              {/* <Image
                src="/svgs/logov2.svg"
                alt="Harper"
                width={78}
                height={36}
              /> */}
            </div>
            <p
              className={`font-hedvig mt-5 text-base font-semibold ${
                isDark ? "text-white/60" : "text-black/60"
              }`}
            >
              Get <span className={strongTextStyle}>introduced</span> to your{" "}
              <span className={strongTextStyle}>dream role</span>.
              <br />
              With <span className={strongTextStyle}>Harper</span>.
            </p>
            {locale && showLocaleSwitcher ? (
              <FooterLanguageDropdown
                locale={locale}
                onLocaleChange={onLocaleChange}
                theme={theme}
              />
            ) : null}
          </div>

          <nav
            aria-label={
              resolvedLocale === "ko" ? "Harper 페이지" : "Harper pages"
            }
            className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:w-auto lg:grid-cols-[180px_180px_120px] lg:gap-12"
          >
            <div className={blockStyle}>
              <div className={`w-full ${labelStyle}`}>{labels.forTalent}</div>
              <div className={`${liststyle}`}>
                <Link
                  href={careerStartHref}
                  className={liStyle}
                  onClick={onCareerStartClick}
                >
                  {labels.start}
                </Link>
                <Link href="/#workflow" className={liStyle}>
                  {labels.howItWorks}
                </Link>
                <Link href="/#voices" className={liStyle}>
                  {labels.successStories}
                </Link>
                <Link href="/jobs" className={liStyle}>
                  {labels.jobs}
                </Link>
                <Link
                  href={{ pathname: "/refer", query: { lang: resolvedLocale } }}
                  className={liStyle}
                >
                  {labels.referAndEarn}
                </Link>
              </div>
            </div>

            <div className={blockStyle}>
              <div className={`w-full ${labelStyle}`}>
                {labels.forCompanies}
              </div>
              <div className={`${liststyle}`}>
                <Link href={companyPageHref} className={liStyle}>
                  {labels.harperForCompanies}
                </Link>
                <Link
                  href={{
                    pathname: "/pricing",
                    query: { lang: resolvedLocale },
                  }}
                  className={liStyle}
                >
                  {labels.pricing}
                </Link>
                {onScheduleCallClick ? (
                  <button
                    type="button"
                    onClick={onScheduleCallClick}
                    className={`${liStyle} text-left`}
                  >
                    {labels.scheduleCall}
                  </button>
                ) : (
                  <Link href={companyContactHref} className={liStyle}>
                    {labels.scheduleCall}
                  </Link>
                )}
              </div>
            </div>

            <div className={cn(blockStyle, "lg:min-w-0")}>
              <div className={`w-full ${labelStyle}`}>{labels.company}</div>
              <div className={`${liststyle}`}>
                <Link href="/about" className={liStyle}>
                  {labels.about}
                </Link>
                <Link href="/blog" className={liStyle}>
                  {labels.blog}
                </Link>
                <a
                  href="https://www.linkedin.com/company/matchharper/"
                  target="_blank"
                  rel="noreferrer"
                  className={liStyle}
                >
                  {labels.linkedin}
                </a>
                <button
                  type="button"
                  onClick={openSupportChat}
                  className={`${liStyle} text-left`}
                >
                  {labels.contact}
                </button>
                <Link
                  href={{
                    pathname: "/privacy",
                    query: { lang: resolvedLocale },
                  }}
                  className={liStyle}
                >
                  {labels.privacy}
                </Link>
                <Link
                  href={{
                    pathname: "/referral-terms",
                    query: { lang: resolvedLocale },
                  }}
                  className={liStyle}
                >
                  {labels.referralTerms}
                </Link>
              </div>
            </div>
          </nav>
        </div>

        <div
          className={`mt-6 flex flex-col gap-3 text-[12.5px] md:flex-row md:items-center md:justify-between ${
            isDark ? "text-white/45" : "text-black/45"
          }`}
        >
          <div>© 2026 Harper. All rights reserved.</div>
          {SERVICE_STATUS_PAGE_URL ? (
            <a
              href={SERVICE_STATUS_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-sm py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2",
                isDark
                  ? "text-white/70 hover:text-white focus-visible:ring-offset-neutral-950"
                  : "text-neutral-muted hover:text-neutral-primary focus-visible:ring-offset-bg-default"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  SERVICE_STATUS_DOT[serviceStatus]
                )}
              />
              <span>{SERVICE_STATUS_COPY[resolvedLocale][serviceStatus]}</span>
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
