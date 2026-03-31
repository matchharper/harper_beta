import { START_BUTTON_LABEL, StartButton } from "@/pages/search";
import { ArrowUpRight, Menu } from "lucide-react";
import React, { useCallback } from "react";
import router from "next/router";
import { DropdownMenu } from "@/components/ui/menu";

export enum RadarSection {
  Intro = "home",
  Outputs = "outputs",
  Pricing = "pricing",
  Blog = "blog",
}
const RADAR_SECTION_LABELS: Record<RadarSection, string> = {
  [RadarSection.Intro]: "소개",
  [RadarSection.Outputs]: "작동 방식",
  [RadarSection.Pricing]: "가격 정책",
  [RadarSection.Blog]: "블로그",
};

const RADAR_NAV_SECTIONS: RadarSection[] = [
  RadarSection.Intro,
  RadarSection.Outputs,
  RadarSection.Pricing,
  RadarSection.Blog,
];

export const navItems = RADAR_NAV_SECTIONS.map((section) => ({
  section,
  label: RADAR_SECTION_LABELS[section],
}));

export function getRadarSectionHref(section: RadarSection) {
  if (section === RadarSection.Blog) {
    return "/blog";
  }

  if (section === RadarSection.Intro) {
    return "/search";
  }

  return `/search#${section}`;
}

function NavItem({
  label,
  onClick,
  isArrowRight = false,
}: {
  label: string;
  onClick: () => void;
  isArrowRight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-full py-2 transition-colors duration-200 hover:bg-white/5 hover:opacity-95 ${
        isArrowRight ? "pl-5 pr-3" : "px-5"
      }`}
    >
      <span>{label}</span>
      {isArrowRight && <ArrowUpRight className="h-3 w-3" />}
    </button>
  );
}

function SearchHeader({ onStartClick }: { onStartClick: () => void }) {
  const navigateToSection = useCallback((section: RadarSection) => {
    if (typeof window === "undefined") return;

    const pathname = window.location.pathname.replace(/\/$/, "") || "/";
    const isSearchPage = pathname === "/search";
    const isBlogPage = pathname === "/blog";

    if (section === RadarSection.Blog) {
      if (isBlogPage) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      router.push(getRadarSectionHref(section));
      return;
    }

    if (!isSearchPage) {
      router.push(getRadarSectionHref(section));
      return;
    }

    if (section === RadarSection.Intro) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = document.getElementById(section);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <header className="fixed left-0 top-0 z-20 w-full text-sm text-white transition-all duration-300">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 md:h-20 md:px-8">
        <button
          type="button"
          onClick={() => navigateToSection(RadarSection.Intro)}
          className="shrink-0 text-left font-garamond text-[26px] font-semibold"
        >
          Harper
        </button>

        <nav className="hidden items-center justify-center gap-2 rounded-full bg-[#444444aa] px-4 py-2 text-sm font-normal text-white backdrop-blur md:flex">
          {navItems.map((item) => (
            <NavItem
              key={item.section}
              label={item.label}
              onClick={() => navigateToSection(item.section)}
              isArrowRight={item.section === RadarSection.Blog}
            />
          ))}
        </nav>

        <div className="hidden shrink-0 items-center justify-end md:flex">
          <StartButton
            onClick={onStartClick}
            label={START_BUTTON_LABEL}
            size="sm"
          />
        </div>

        <div className="block md:hidden">
          <DropdownMenu
            buttonLabel={<Menu className="h-4 w-4" />}
            items={navItems.map((item) => ({
              label: item.label,
              onClick: () => navigateToSection(item.section),
            }))}
          />
        </div>
      </div>
    </header>
  );
}

export default React.memo(SearchHeader);
