import Link from "next/link";
import type React from "react";
import { ChevronDown } from "lucide-react";
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
};

const blockStyle = "flex flex-col items-start justify-start md:min-w-[180px]";

const FOOTER_COPY: Record<
  FooterLocale,
  {
    start: string;
    howItWorks: string;
    successStories: string;
    referAndEarn: string;
    forTalent: string;
    forCompanies: string;
    company: string;
    harperForCompanies: string;
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
    forTalent: "For Talent",
    forCompanies: "For Companies",
    company: "Company",
    harperForCompanies: "Harper for Companies",
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
    forTalent: "For Talent",
    forCompanies: "For Companies",
    company: "Company",
    harperForCompanies: "Harper for Companies",
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
}: {
  locale: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
  theme: FooterTheme;
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
          className={`mt-5 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus:outline-none focus:ring-2 ${
            isDark
              ? "border-white/20 bg-white/10 text-white/80 hover:border-white/35 hover:bg-white/15 hover:text-white focus:ring-white/30"
              : "border-black/10 bg-white text-black/60 hover:border-black/20 hover:bg-black/[0.03] hover:text-black focus:ring-black/10"
          }`}
        >
          {selected ? (
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
}: CareerLandingFooterProps) {
  const isDark = theme === "dark";
  const resolvedLocale = locale ?? "ko";
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

          <div className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:w-auto lg:grid-cols-[180px_180px_120px] lg:gap-12">
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

            <div className={`${blockStyle} lg:min-w-0`}>
              <div className={`w-full ${labelStyle}`}>{labels.company}</div>
              <div className={`${liststyle}`}>
                <Link href="/about" className={liStyle}>
                  About Team
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
                {/* <Link href="/privacy" className={liStyle}>
                  {labels.privacy}
                </Link> */}
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
          </div>
        </div>

        <div
          className={`mt-6 flex flex-col gap-3 text-[12.5px] md:flex-row md:items-center md:justify-between ${
            isDark ? "text-white/45" : "text-black/45"
          }`}
        >
          <div>© 2026 Harper. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
