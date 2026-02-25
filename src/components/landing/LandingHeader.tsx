import router from "next/router";
import React, { useCallback } from "react";
import { Menu } from "lucide-react";
import { DropdownMenu } from "@/components/ui/menu";
import { useMessages } from "@/i18n/useMessage";

type LandingHeaderProps = {
  onStartClick?: () => void;
  startButtonLabel?: string;
};

type LandingSection = "intro" | "how-it-works" | "pricing" | "faq";

const NavItem = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      className="cursor-pointer hover:opacity-95 px-5 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
      onClick={onClick}
    >
      {label}
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

    const isLandingPage = window.location.pathname === "/";
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
          />
          <NavItem
            label={m.companyLanding.nav.faq}
            onClick={() => navigateToSection("faq")}
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
                onClick: () => navigateToSection("pricing"),
              },
              {
                label: m.companyLanding.nav.faq,
                onClick: () => navigateToSection("faq"),
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
};

export default React.memo(LandingHeader);
