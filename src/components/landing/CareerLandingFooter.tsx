import Image from "next/image";
import Link from "next/link";
import type React from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FooterLocale = "ko" | "en";

type CareerLandingFooterProps = {
  careerStartHref: string;
  onCareerStartClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onScheduleCallClick?: React.MouseEventHandler<HTMLButtonElement>;
  locale?: FooterLocale;
  onLocaleChange?: (locale: FooterLocale) => void;
  labels?: {
    start: string;
    howItWorks: string;
    successStories: string;
    forTalent: string;
    forCompanies: string;
    company: string;
    harperForCompanies: string;
    scheduleCall: string;
    blog: string;
    linkedin: string;
    contact: string;
  };
};

const labelStyle =
  "cursor-pointer text-xs md:text-sm font-medium text-black/45 transition duration-300 hover:text-black/85";

const blockStyle = "flex flex-col items-start justify-start md:min-w-[140px]";

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

function persistLocale(locale: FooterLocale) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem("harper:locale", locale);
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; samesite=lax`;
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

    persistLocale(nextLocale);
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
          aria-label="Select language"
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
  labels = {
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
}: CareerLandingFooterProps) {
  const openCrispChat = () => {
    if (typeof window === "undefined") return;

    const crispWindow = window as Window & {
      $crisp?: Array<unknown[]>;
    };
    const hasCrispLoader = Boolean(document.getElementById("crisp-loader"));

    if (!crispWindow.$crisp && !hasCrispLoader) {
      window.location.href = "mailto:hello@matchharper.com";
      return;
    }

    crispWindow.$crisp = crispWindow.$crisp ?? [];
    crispWindow.$crisp.push(["do", "chat:show"]);
    crispWindow.$crisp.push(["do", "chat:open"]);
  };

  const liststyle =
    "mt-4 flex flex-col gap-2 md:gap-3 text-xs md:text-sm text-black/70";

  return (
    <footer className="border-t border-black/10 px-4 py-14 text-[12px] text-black md:px-10 md:py-16">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-col items-start justify-between gap-10 border-b border-black/10 md:pb-16 pb-10 lg:flex-row">
          <div className="max-w-[360px]">
            <Image src="/svgs/logov2.svg" alt="Harper" width={78} height={36} />
            <p className="font-hedvig mt-5 text-base font-semibold text-black/60">
              Get <span className="text-black">introduced</span> to your{" "}
              <span className="text-black">dream role</span>.
              <br />
              With <span className="text-black">Harper</span>.
            </p>
            {locale ? (
              <FooterLanguageDropdown
                locale={locale}
                onLocaleChange={onLocaleChange}
              />
            ) : null}
          </div>

          <div className="grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:w-auto lg:gap-12">
            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-black">
                {labels.forTalent}
              </div>
              <div className={`${liststyle}`}>
                <Link
                  href={careerStartHref}
                  className={labelStyle}
                  onClick={onCareerStartClick}
                >
                  {labels.start}
                </Link>
                <Link href="/#workflow" className={labelStyle}>
                  {labels.howItWorks}
                </Link>
                <Link href="/#voices" className={labelStyle}>
                  {labels.successStories}
                </Link>
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-black">
                {labels.forCompanies}
              </div>
              <div className={`${liststyle}`}>
                <Link href="/company" className={labelStyle}>
                  {labels.harperForCompanies}
                </Link>
                {onScheduleCallClick ? (
                  <button
                    type="button"
                    onClick={onScheduleCallClick}
                    className={`${labelStyle} text-left`}
                  >
                    {labels.scheduleCall}
                  </button>
                ) : (
                  <a
                    href="https://calendly.com/chris-matchharper/30min"
                    className={labelStyle}
                  >
                    {labels.scheduleCall}
                  </a>
                )}
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-black">
                {labels.company}
              </div>
              <div className={`${liststyle}`}>
                <Link href="/blog" className={labelStyle}>
                  {labels.blog}
                </Link>
                <a
                  href="https://www.linkedin.com/company/matchharper/"
                  target="_blank"
                  rel="noreferrer"
                  className={labelStyle}
                >
                  {labels.linkedin}
                </a>
                <button
                  type="button"
                  onClick={openCrispChat}
                  className={`${labelStyle} text-left`}
                >
                  {labels.contact}
                </button>
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
