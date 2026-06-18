import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, type MouseEventHandler } from "react";

type CareerAppBarProps = {
  careerStartHref: string;
  onCareerStartClick?: MouseEventHandler<HTMLAnchorElement>;
  sectionHrefPrefix?: string;
  bgColor?: string;
  labels?: {
    workflow: string;
    difference: string;
    voices: string;
    forCompanies: string;
    join: string;
  };
};

export default function CareerAppBar({
  careerStartHref,
  onCareerStartClick,
  sectionHrefPrefix = "",
  bgColor = "white",
  labels = {
    workflow: "제품 화면",
    difference: "다른점",
    voices: "후기",
    forCompanies: "For Companies",
    join: "Join",
  },
}: CareerAppBarProps) {
  const isMobile = useIsMobile();
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const [isAppBarBorderVisible, setIsAppBarBorderVisible] = useState(false);

  const sectionLinks = [
    { href: "#workflow", label: labels.workflow },
    { href: "#how", label: labels.difference },
    { href: "#voices", label: labels.voices },
  ] as const;

  const pillbtn =
    "px-3.5 py-1.5 rounded-full border border-black/10 cursor-pointer text-[13px] md:text-sm font-medium shadow-xs";

  return (
    <motion.nav
      initial={false}
      animate={{
        y: isMobile && !isMobileHeaderVisible ? -88 : 0,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        `fixed inset-x-0 top-0 z-50 border-b bg-${bgColor}/50 backdrop-blur-lg transition-colors`,
        isAppBarBorderVisible ? "border-black/10" : "border-transparent"
      )}
    >
      <div className="relative mx-auto flex h-[60px] max-w-[1160px] items-center justify-between px-4">
        <a
          href={`${sectionHrefPrefix}#top`}
          className="font-hedvig text-[18px] text-black font-semibold"
        >
          Harper
        </a>
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
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/company"
            className={`${pillbtn} text-black hover:bg-black/2`}
          >
            {labels.forCompanies}
          </Link>
          <Link
            href={careerStartHref}
            onClick={onCareerStartClick}
            className={`${pillbtn} text-white bg-black hover:opacity-90`}
          >
            {labels.join}
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
