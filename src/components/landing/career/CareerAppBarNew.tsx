import { useIsMobile } from "@/hooks/useIsMobile";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEventHandler } from "react";

const TALENT_APP_BAR_COPY: Record<
  Locale,
  {
    workflow: string;
    difference: string;
    voices: string;
    audience: string;
    signedOut: string;
    signedIn: string;
  }
> = {
  ko: {
    workflow: "제품 화면",
    difference: "다른점",
    voices: "후기",
    audience: "For Companies",
    signedOut: "로그인",
    signedIn: "계속하기",
  },
  en: {
    workflow: "Product",
    difference: "Why Harper",
    voices: "Stories",
    audience: "For Companies",
    signedOut: "Sign in",
    signedIn: "Continue",
  },
};

const COMPANY_APP_BAR_COPY: Record<
  Locale,
  {
    audience: string;
    primary: string;
  }
> = {
  ko: {
    audience: "For Talents",
    primary: "Meet",
  },
  en: {
    audience: "For Talents",
    primary: "Meet",
  },
};

type CareerAppBarProps = {
  careerStartHref: string;
  onCareerStartClick?: MouseEventHandler<HTMLAnchorElement>;
  sectionHrefPrefix?: string;
  bgColor?: string;
  showSectionLinks?: boolean;
  audienceHref?: string;
  locale?: Locale;
};

export default function CareerAppBar({
  careerStartHref,
  onCareerStartClick,
  sectionHrefPrefix = "",
  bgColor = "neutral-100",
  showSectionLinks = true,
  audienceHref = "/company",
  locale: localeOverride,
}: CareerAppBarProps) {
  const { locale: contextLocale } = useMessages();
  const user = useAuthStore((state) => state.user);
  const isMobile = useIsMobile();
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const locale = localeOverride ?? contextLocale;
  const talentCopy = TALENT_APP_BAR_COPY[locale];
  const companyCopy = COMPANY_APP_BAR_COPY[locale];
  const isCompanyBar = audienceHref === "/" && !showSectionLinks;

  const sectionLinks = [
    { href: "#workflow", label: talentCopy.workflow },
    { href: "#how", label: talentCopy.difference },
    { href: "#voices", label: talentCopy.voices },
  ] as const;
  const audienceLabel = isCompanyBar
    ? companyCopy.audience
    : talentCopy.audience;
  const primaryLabel = isCompanyBar
    ? companyCopy.primary
    : user
      ? talentCopy.signedIn
      : talentCopy.signedOut;

  const pillbtn =
    "px-3.5 py-1.5 rounded-full border border-black/10 cursor-pointer text-[13px] md:text-sm font-normal shadow-xs";

  return (
    <motion.nav
      initial={false}
      animate={{
        y: isMobile && !isMobileHeaderVisible ? -88 : 0,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        `fixed inset-x-0 top-0 z-50 border-b bg-${bgColor} backdrop-blur-lg transition-colors font-light border-transparent`
      )}
    >
      <div className="relative mx-auto flex h-[54px] max-w-[1160px] items-center justify-between px-4">
        <a
          href={`${sectionHrefPrefix}#top`}
          className="font-hedvig text-[18px] text-black font-semibold"
        >
          <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} />
          {/* Harper */}
        </a>
        {showSectionLinks && (
          <div
            aria-label="Section navigation"
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-5 lg:flex"
          >
            {sectionLinks.map((item) => (
              <a
                key={item.href}
                href={`${sectionHrefPrefix}${item.href}`}
                className="text-[14px] font-medium text-black/45 transition-colors hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black/30"
              >
                {item.label}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={audienceHref}
            className={`${pillbtn} text-black hover:bg-black/2`}
          >
            {audienceLabel}
          </Link>
          <Link
            href={careerStartHref}
            onClick={onCareerStartClick}
            className={`${pillbtn} text-white bg-black hover:opacity-90`}
          >
            {primaryLabel}
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
