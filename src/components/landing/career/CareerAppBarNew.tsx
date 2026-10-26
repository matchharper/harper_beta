import { breakpoints } from "@/hooks/useMediaQuery";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEventHandler } from "react";

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
    audience: "For candidates",
    primary: "Meet",
  },
  en: {
    audience: "For candidates",
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
  primaryActionLabel?: string;
  showPrimaryAction?: boolean;
  navigationLinks?: readonly { href: string; label: string }[];
  secondaryAction?: { href: string; label: string; mobileLabel?: string };
};

export default function CareerAppBar({
  careerStartHref,
  onCareerStartClick,
  sectionHrefPrefix = "",
  bgColor = "neutral-100",
  showSectionLinks = true,
  audienceHref,
  locale: localeOverride,
  primaryActionLabel,
  showPrimaryAction = true,
  navigationLinks,
  secondaryAction,
}: CareerAppBarProps) {
  const { locale: contextLocale } = useMessages();
  const user = useAuthStore((state) => state.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingMenuAction = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();
  const locale = localeOverride ?? contextLocale;
  const resolvedAudienceHref = audienceHref ?? getCompanyLocalePath(locale);
  const talentCopy = TALENT_APP_BAR_COPY[locale];
  const companyCopy = COMPANY_APP_BAR_COPY[locale];
  const isCompanyBar = resolvedAudienceHref === "/" && !showSectionLinks;

  const sectionLinks = [
    { href: "#workflow", label: talentCopy.workflow },
    { href: "#how", label: talentCopy.difference },
    { href: "#voices", label: talentCopy.voices },
  ] as const;
  const audienceLabel = isCompanyBar
    ? companyCopy.audience
    : talentCopy.audience;
  const primaryLabel =
    primaryActionLabel ??
    (isCompanyBar
      ? companyCopy.primary
      : user
        ? talentCopy.signedIn
        : talentCopy.signedOut);
  const menuLinks = [
    ...(navigationLinks ?? (showSectionLinks ? sectionLinks : [])).map(
      (item) => ({
        ...item,
        href: item.href.startsWith("#")
          ? `${sectionHrefPrefix}${item.href}`
          : item.href,
      })
    ),
    ...(!navigationLinks
      ? [
          {
            href: `/pricing?lang=${locale}`,
            label: locale === "ko" ? "가격" : "Pricing",
          },
        ]
      : []),
    {
      href: "/about",
      label: locale === "ko" ? "Team Harper 소개" : "About Team Harper",
    },
    { href: resolvedAudienceHref, label: audienceLabel },
  ];

  useEffect(() => {
    const desktop = window.matchMedia(`(min-width: ${breakpoints.md}px)`);
    const closeMenu = () => setMenuOpen(false);
    desktop.addEventListener("change", closeMenu);
    return () => desktop.removeEventListener("change", closeMenu);
  }, []);

  const pillbtn =
    "px-3.5 py-1.5 rounded-full border border-black/10 cursor-pointer text-[13px] md:text-sm font-normal shadow-xs";

  return (
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <nav
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
          {(showSectionLinks || navigationLinks) && (
            <div
              aria-label="Section navigation"
              className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-5 lg:flex"
            >
              {(navigationLinks ?? sectionLinks).map((item) => (
                <a
                  key={item.href}
                  href={
                    item.href.startsWith("#")
                      ? `${sectionHrefPrefix}${item.href}`
                      : item.href
                  }
                  className="text-[14px] font-medium text-black/45 transition-colors hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black/30"
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={resolvedAudienceHref}
              className={`${pillbtn} hidden text-black hover:bg-black/2 md:inline-flex`}
            >
              {audienceLabel}
            </Link>
            {secondaryAction && (
              <>
                <Link
                  href={secondaryAction.href}
                  className={cn(
                    pillbtn,
                    "text-neutral-primary hover:bg-bg-weak",
                    secondaryAction.mobileLabel && "hidden md:inline-flex"
                  )}
                >
                  {secondaryAction.label}
                </Link>
                {secondaryAction.mobileLabel && (
                  <Link
                    href={secondaryAction.href}
                    className={cn(
                      pillbtn,
                      "bg-black text-white hover:opacity-90 md:hidden"
                    )}
                  >
                    {secondaryAction.mobileLabel}
                  </Link>
                )}
              </>
            )}
            {showPrimaryAction && (
              <Link
                href={careerStartHref}
                onClick={onCareerStartClick}
                className={cn(
                  pillbtn,
                  "text-white bg-black hover:opacity-90",
                  secondaryAction && "hidden md:inline-flex"
                )}
              >
                {primaryLabel}
              </Link>
            )}
            <DialogTrigger asChild>
              <MuteButton
                variant="transparent"
                className="translate-x-2 md:hidden"
                aria-label={locale === "ko" ? "메뉴 열기" : "Open menu"}
              >
                <Menu className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </MuteButton>
            </DialogTrigger>
          </div>
        </div>
      </nav>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        overlayClassName="z-[70] bg-bg-basement backdrop-blur-none motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
        className="inset-0 z-[80] flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 bg-bg-basement p-0 shadow-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
        onCloseAutoFocus={(event) => {
          const action = pendingMenuAction.current;
          if (!action) return;
          event.preventDefault();
          pendingMenuAction.current = null;
          action();
        }}
      >
        <DialogTitle className="sr-only">
          {locale === "ko" ? "Harper 메뉴" : "Harper menu"}
        </DialogTitle>
        <div className="flex min-h-[60px] shrink-0 items-center justify-end px-4 pt-[env(safe-area-inset-top)]">
          <DialogClose asChild>
            <MuteButton
              variant="transparent"
              size="lg"
              aria-label={locale === "ko" ? "메뉴 닫기" : "Close menu"}
            >
              <X className="size-7" strokeWidth={1.4} aria-hidden="true" />
            </MuteButton>
          </DialogClose>
        </div>
        <div className="flex flex-1 flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <nav
            aria-label={locale === "ko" ? "전체 메뉴" : "Main navigation"}
            className="pt-[clamp(32px,9dvh,84px)] pb-12"
          >
            <ul className="flex flex-col items-start">
              {menuLinks.map((item, index) => (
                <motion.li
                  key={item.href}
                  initial={reducedMotion ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.24,
                    delay: reducedMotion ? 0 : index * 0.045,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-1 text-[clamp(30px,8.5vw,40px)] leading-[1.3] font-normal tracking-[-0.035em] text-neutral-primary transition-colors hover:text-neutral-muted focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action"
                  >
                    {item.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <MuteButton
              asChild
              variant="dark"
              size="lg"
              className="w-full rounded-full"
            >
              <Link
                href={secondaryAction?.href ?? careerStartHref}
                onClick={(event) => {
                  if (!secondaryAction && onCareerStartClick) {
                    event.preventDefault();
                    pendingMenuAction.current = () => onCareerStartClick(event);
                  }
                  setMenuOpen(false);
                }}
              >
                {secondaryAction?.mobileLabel ??
                  secondaryAction?.label ??
                  primaryLabel}
              </Link>
            </MuteButton>
            <MuteButton asChild size="lg" className="w-full rounded-full">
              <a
                href="mailto:chris@matchharper.com"
                onClick={() => setMenuOpen(false)}
              >
                {locale === "ko" ? "문의하기" : "Contact us"}
              </a>
            </MuteButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
