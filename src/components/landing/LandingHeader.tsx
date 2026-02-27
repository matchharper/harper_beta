import router from "next/router";
import React, { useCallback } from "react";
import { ArrowRightIcon, ArrowUpRight, Menu } from "lucide-react";
import { DropdownMenu } from "@/components/ui/menu";
import { useMessages } from "@/i18n/useMessage";

type LandingHeaderProps = {
  onStartClick?: () => void;
  startButtonLabel?: string;
};

type LandingSection = "intro" | "how-it-works" | "pricing" | "faq" | "blog";

const NavItem = ({
  label,
  onClick,
  isArrowRight = false,
}: {
  label: string | React.ReactNode;
  onClick: () => void;
  isArrowRight?: boolean;
}) => {
  return (
    <button
      type="button"
      className={`flex flex-row items-center justify-between gap-2 cursor-pointer hover:opacity-95 pl-5 py-2 hover:bg-white/5 rounded-full transition-colors duration-200 ${isArrowRight ? "pr-3" : "px-5"}`}
      onClick={onClick}
    >
      {label}
      {isArrowRight && <ArrowUpRight className="w-3 h-3" />}
    </button>
  );
};

const LandingHeader = ({
  onStartClick,
  startButtonLabel,
}: LandingHeaderProps) => {
  const { m } = useMessages();

  const navigateToSection = useCallback((section: LandingSection) => {
    if (typeof window === "undefined") return;

    const pathname = window.location.pathname;
    const isLandingPage = pathname === "/";
    const isPricingPage = pathname === "/pricing";
    const isBlogPage = pathname === "/blog";

    if (section === "pricing") {
      if (isPricingPage) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push("/pricing");
      return;
    }

    if (section === "blog") {
      if (isBlogPage) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push("/blog");
      return;
    }

    if (section === "faq" && isPricingPage) {
      const target = document.getElementById("pricing-faq");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      window.location.hash = "pricing-faq";
      return;
    }

    if (!isLandingPage) {
      router.push(section === "intro" ? "/#intro" : `/#${section}`);
      return;
    }

    if (section === "intro") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = document.getElementById(section);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.location.hash = section;
  }, []);

  const handleStartClick = useCallback(() => {
    if (onStartClick) {
      onStartClick();
      return;
    }

    if (typeof window === "undefined") return;

    if (window.location.pathname !== "/") {
      router.push("/");
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onStartClick]);

  const resolvedStartButtonLabel =
    startButtonLabel ?? m.companyLanding.startButton;

  return (
    <header className="fixed top-0 left-0 z-20 w-full flex items-center justify-between px-0 lg:px-4 h-14 md:h-20 text-sm text-white transition-all duration-300">
      <div className="flex items-center justify-between w-full px-4 md:px-8 h-full">
        <button
          type="button"
          onClick={() => navigateToSection("intro")}
          className="text-[26px] font-garamond text-left font-semibold w-[40%] md:w-[15%]"
        >
          Harper
        </button>
        <nav className="hidden font-normal text-white bg-[#444444aa] backdrop-blur rounded-full md:flex items-center justify-center gap-2 text-xs sm:text-sm px-4 py-2">
          <NavItem
            label={m.companyLanding.nav.intro}
            onClick={() => navigateToSection("intro")}
          />
          <NavItem
            label={m.companyLanding.nav.howItWorks}
            onClick={() => navigateToSection("how-it-works")}
          />
          <NavItem
            label={m.companyLanding.nav.pricing}
            onClick={() => navigateToSection("pricing")}
            isArrowRight={true}
          />
          <NavItem
            label={m.companyLanding.nav.blog}
            onClick={() => navigateToSection("blog")}
            isArrowRight={true}
          />
        </nav>
        <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
          <button
            type="button"
            onClick={handleStartClick}
            className="
              group relative
              font-medium
              cursor-pointer
              rounded-full
              bg-accenta1 text-black
              z-10
              py-3 px-6 text-xs
              ring-1 ring-white/10
              shadow-[0_12px_40px_rgba(180,255,120,0.25)]
              transition-all duration-200
              hover:shadow-[0_18px_60px_rgba(180,255,120,0.35)]
              hover:-translate-y-[1px]
              active:translate-y-[0px]
              active:shadow-[0_8px_20px_rgba(180,255,120,0.2)]
            "
          >
            {resolvedStartButtonLabel}
          </button>
        </div>
        <div className="block md:hidden">
          <DropdownMenu
            buttonLabel={<Menu className="w-4 h-4" />}
            items={[
              {
                label: m.companyLanding.nav.intro,
                onClick: () => navigateToSection("intro"),
              },
              {
                label: m.companyLanding.nav.howItWorks,
                onClick: () => navigateToSection("how-it-works"),
              },
              {
                label: m.companyLanding.nav.pricing,
                onClick: () => router.push("/pricing"),
              },
              {
                label: m.companyLanding.nav.blog,
                onClick: () => router.push("/blog"),
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
};

export default React.memo(LandingHeader);
