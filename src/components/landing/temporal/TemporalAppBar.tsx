import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { EASE, useC } from "./primitives";
import type { FeatureKey } from "./types";
import { tw } from "./tw";

export const LINKEDIN_URL = "https://www.linkedin.com/company/matchharper/";
export const CONTACT_MAILTO = "mailto:chris@matchharper.com";

type MenuKey = "features" | "resources";

type MenuItem = {
  href: string;
  label: string;
  external?: boolean;
};

/** 상단 바 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useNavCopy() {
  const c = useC();
  return {
    features: c("기능", "Features"),
    resources: c("리소스", "Resources"),
    companies: c("기업용", "For companies"),
    signIn: c("로그인", "Sign in"),
    continue: c("계속하기", "Continue"),
    start: c("시작하기", "Get started"),
    openMenu: c("메뉴 열기", "Open menu"),
    closeMenu: c("메뉴 닫기", "Close menu"),
    menuTitle: c("Harper 메뉴", "Harper menu"),
    featureItems: [
      { key: "always", label: c("탐색", "Search") },
      { key: "apply", label: c("지원", "Apply") },
      { key: "direct", label: c("직접 연결", "Direct intros") },
    ] satisfies { key: FeatureKey; label: string }[],
    resourceItems: {
      about: { label: c("Team Harper 소개", "About Team Harper") },
      updates: { label: c("업데이트 노트", "Update notes") },
      linkedin: { label: "LinkedIn" },
      contact: { label: c("문의하기", "Contact us") },
    },
  };
}

export function TemporalAppBar({
  companiesHref,
  startHref,
  onStartClick,
  signedIn,
  sectionHrefPrefix = "",
}: {
  companiesHref: string;
  startHref: string;
  onStartClick?: MouseEventHandler<HTMLAnchorElement>;
  signedIn: boolean;
  /** 랜딩 밖 페이지에서는 "/"를 넘겨 로고·기능 링크가 랜딩의 해당 위치로 가게 한다. */
  sectionHrefPrefix?: string;
}) {
  const copy = useNavCopy();
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const hoverOpenedAt = useRef(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [openMenu]);

  const featureItems: MenuItem[] = copy.featureItems.map((item) => ({
    href: `${sectionHrefPrefix}#feature-${item.key}`,
    label: item.label,
  }));
  const resourceItems: MenuItem[] = [
    { href: "/about", ...copy.resourceItems.about },
    { href: "/update-notes", ...copy.resourceItems.updates },
    { href: LINKEDIN_URL, external: true, ...copy.resourceItems.linkedin },
    { href: CONTACT_MAILTO, ...copy.resourceItems.contact },
  ];

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };

  const renderMenu = (key: MenuKey, label: string, items: MenuItem[]) => {
    const open = openMenu === key;
    const menuId = `temporal-nav-${key}`;
    return (
      <div
        className="relative"
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          cancelClose();
          if (openMenu !== key) hoverOpenedAt.current = Date.now();
          setOpenMenu(key);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          scheduleClose();
        }}
      >
        <button
          type="button"
          className={cn(tw.navLink, tw.focusRing)}
          data-open={open}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => {
            // 마우스를 올려 막 열린 메뉴는 같은 클릭으로 닫지 않는다.
            if (open && Date.now() - hoverOpenedAt.current < 500) return;
            setOpenMenu(open ? null : key);
          }}
        >
          {label}
          <ChevronDown
            className={cn(
              "size-3.5 opacity-60 transition-transform duration-200",
              open && "rotate-180"
            )}
            strokeWidth={2}
          />
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              id={menuId}
              className={tw.navMenu}
              initial={
                reducedMotion
                  ? { opacity: 0, x: "-50%" }
                  : {
                      opacity: 0,
                      y: -6,
                      scale: 0.98,
                      x: "-50%",
                      filter: "blur(4px)",
                    }
              }
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                x: "-50%",
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                y: -4,
                scale: 0.99,
                x: "-50%",
                filter: "blur(2px)",
              }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ transformOrigin: "top center" }}
            >
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={tw.navMenuItem}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer" : undefined}
                      onClick={() => setOpenMenu(null)}
                    >
                      {item.label}
                      {item.external ? (
                        <ArrowUpRight className="size-3.5 text-(--tl-ink-3)" />
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const primaryLabel = signedIn ? copy.continue : copy.start;

  return (
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <header
        className="fixed inset-x-0 top-0 z-60 transition-[background-color,box-shadow,backdrop-filter] duration-240 data-[scrolled=true]:bg-[rgb(245_246_248/0.2)] data-[scrolled=true]:shadow-[0_0.5px_0_rgb(0_0_0/0.08)] data-[scrolled=true]:backdrop-blur-[8px] data-[scrolled=true]:backdrop-saturate-[0.8]"
        data-scrolled={scrolled || openMenu !== null}
      >
        <div
          ref={barRef}
          className="relative mx-auto flex h-[60px] max-w-[1240px] items-center justify-between px-4 md:px-8"
        >
          <a
            href={`${sectionHrefPrefix}#top`}
            className={cn("flex items-center", tw.focusRing)}
          >
            <Image
              src="/svgs/logov2.svg"
              alt="Harper"
              width={66}
              height={30}
              priority
            />
          </a>

          <nav
            aria-label="Main"
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex"
          >
            {renderMenu("features", copy.features, featureItems)}
            {renderMenu("resources", copy.resources, resourceItems)}
            <Link href={companiesHref} className={cn(tw.navLink, tw.focusRing)}>
              {copy.companies}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {!signedIn ? (
              <Link
                href={startHref}
                onClick={onStartClick}
                className={cn(
                  tw.navLink,
                  tw.focusRing,
                  "hidden md:inline-flex"
                )}
              >
                {copy.signIn}
              </Link>
            ) : null}
            <Link
              href={startHref}
              onClick={onStartClick}
              className={cn(
                tw.pill,
                tw.pillDark,
                tw.focusRing,
                "h-9 px-4 text-[13.5px] font-medium"
              )}
            >
              {primaryLabel}
            </Link>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={copy.openMenu}
                className={cn(
                  "-mr-1 flex size-10 items-center justify-center rounded-full text-(--tl-ink) md:hidden",
                  tw.focusRing
                )}
              >
                <Menu className="size-5" strokeWidth={1.6} />
              </button>
            </DialogTrigger>
          </div>
        </div>
      </header>

      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        overlayClassName="z-[70] bg-[#f3f5f7] backdrop-blur-none"
        className="inset-0 z-[80] flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 bg-[#f3f5f7] p-0 text-[#1d1d1f] shadow-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <DialogTitle className="sr-only">{copy.menuTitle}</DialogTitle>
        <div className="flex h-[60px] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
          <Image src="/svgs/logov2.svg" alt="Harper" width={66} height={30} />
          <DialogClose asChild>
            <button
              type="button"
              aria-label={copy.closeMenu}
              className="flex size-10 items-center justify-center rounded-full"
            >
              <X className="size-6" strokeWidth={1.4} />
            </button>
          </DialogClose>
        </div>
        <div className="flex flex-1 flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <MobileGroup title={copy.features}>
            {featureItems.map((item) => (
              <MobileLink
                key={item.href}
                item={item}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </MobileGroup>
          <MobileGroup title={copy.resources}>
            {resourceItems.map((item) => (
              <MobileLink
                key={item.href}
                item={item}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </MobileGroup>
          <Link
            href={companiesHref}
            className="mt-8 text-[28px] font-medium tracking-[-0.03em]"
            onClick={() => setMobileOpen(false)}
          >
            {copy.companies}
          </Link>
          <Link
            href={startHref}
            onClick={(event) => {
              setMobileOpen(false);
              onStartClick?.(event);
            }}
            className={cn(tw.cta, "mt-auto w-full")}
          >
            {primaryLabel}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MobileGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="text-[13px] font-medium text-[#8a8a90]">{title}</h3>
      <ul className="mt-2 flex flex-col">{children}</ul>
    </section>
  );
}

function MobileLink({
  item,
  onNavigate,
}: {
  item: MenuItem;
  onNavigate: () => void;
}) {
  return (
    <li>
      <a
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noreferrer" : undefined}
        onClick={onNavigate}
        className="flex items-center gap-3 py-2.5"
      >
        <span className="text-[16px] font-medium">{item.label}</span>
      </a>
    </li>
  );
}
