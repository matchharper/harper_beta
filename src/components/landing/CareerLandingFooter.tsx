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
import Face from "../common/Face";
// import { useCareerT } from "@/i18n/useCareerT";

type FooterLocale = "ko" | "en";

const COMPANY_CONTACT_HREF = "/company#company-contact";

type CareerLandingFooterProps = {
  careerStartHref: string;
  onCareerStartClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onScheduleCallClick?: React.MouseEventHandler<HTMLButtonElement>;
  locale?: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
  showLocaleSwitcher?: boolean;
};

const liStyle =
  "cursor-pointer text-xs md:text-sm font-normal text-black transition duration-300 hover:text-black/90";
const labelStyle = "font-medium text-neutral-600";

const blockStyle = "flex flex-col items-start justify-start md:min-w-[140px]";

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
}: {
  locale: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
}) {
  const selected = languageOptions.find((option) => option.value === locale);

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
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-black/60 transition hover:border-black/20 hover:bg-black/[0.03] hover:text-black focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          {selected ? (
            <CountryFlag flag={selected.flag} label={selected.flagLabel} />
          ) : null}
          <span>{selected?.label ?? "English"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[136px]">
        {languageOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            selected={option.value === locale}
            onSelect={() => handleLocaleSelect(option.value)}
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
}: CareerLandingFooterProps) {
  const resolvedLocale = locale ?? "ko";
  const labels = FOOTER_COPY[resolvedLocale];
  const openSupportChat = () => {
    openCustomCrispWidget();
  };

  const liststyle =
    "mt-4 flex flex-col gap-2 md:gap-3 text-xs md:text-sm text-black/90 font-light";

  return (
    <footer className="border-t border-black/10 px-4 py-14 text-[12px] text-black md:px-10 md:py-16">
      <div className="mx-auto max-w-[1160px]">
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
            <p className="font-hedvig mt-5 text-base font-semibold text-black/60">
              Get <span className="text-black">introduced</span> to your{" "}
              <span className="text-black">dream role</span>.
              <br />
              With <span className="text-black">Harper</span>.
            </p>
            {locale && showLocaleSwitcher ? (
              <FooterLanguageDropdown
                locale={locale}
                onLocaleChange={onLocaleChange}
              />
            ) : null}
          </div>

          <div className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:w-auto lg:gap-12">
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
                <Link href="/company" className={liStyle}>
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
                  <Link href={COMPANY_CONTACT_HREF} className={liStyle}>
                    {labels.scheduleCall}
                  </Link>
                )}
              </div>
            </div>

            <div className={blockStyle}>
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

        <div className="mt-6 flex flex-col gap-3 text-[12.5px] text-black/45 md:flex-row md:items-center md:justify-between">
          <div>© 2026 Harper. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
