import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEventHandler } from "react";

type CareerAppBarProps = {
  careerStartHref: string;
  onCareerStartClick?: MouseEventHandler<HTMLAnchorElement>;
  mobileScrollDeltaThreshold?: number;
};

export default function CareerAppBar({
  onCareerStartClick,
  mobileScrollDeltaThreshold = 8,
}: CareerAppBarProps) {
  const isMobile = useIsMobile();
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const [isAppBarBorderVisible, setIsAppBarBorderVisible] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const updateBorderVisibility = () => {
      setIsAppBarBorderVisible(window.scrollY > 400);
    };

    updateBorderVisibility();
    window.addEventListener("scroll", updateBorderVisibility, {
      passive: true,
    });

    return () => window.removeEventListener("scroll", updateBorderVisibility);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileHeaderVisible(true);
      return;
    }

    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      if (currentY <= 12) {
        setIsMobileHeaderVisible(true);
        lastScrollYRef.current = currentY;
        return;
      }

      if (Math.abs(delta) < mobileScrollDeltaThreshold) return;

      setIsMobileHeaderVisible(delta <= 0);
      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile, mobileScrollDeltaThreshold]);

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
        "fixed inset-x-0 top-0 z-50 border-b bg-beige50/50 backdrop-blur-lg transition-colors",
        isAppBarBorderVisible ? "border-beige900/10" : "border-transparent"
      )}
    >
      <div className="mx-auto flex h-[60px] max-w-[1160px] items-center justify-between px-4">
        <a
          href="#top"
          className="font-hedvig text-[18px] text-beige900 font-semibold"
        >
          Harper
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/company"
            className={`${pillbtn} text-black hover:bg-black/2`}
          >
            For Companies
          </Link>
          <button
            type="button"
            onClick={(e) => onCareerStartClick?.(e as any)}
            className={`${pillbtn} text-white bg-beige900 hover:opacity-90`}
          >
            Join
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
