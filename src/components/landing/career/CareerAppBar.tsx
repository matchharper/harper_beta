import { useIsMobile } from "@/hooks/useIsMobile";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CareerLandingButton from "./CareerLandingButton";

type CareerAppBarProps = {
  careerStartHref: string;
  mobileScrollDeltaThreshold?: number;
};

export default function CareerAppBar({
  careerStartHref,
  mobileScrollDeltaThreshold = 8,
}: CareerAppBarProps) {
  const isMobile = useIsMobile();
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

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

  return (
    <motion.nav
      initial={false}
      animate={{
        y: isMobile && !isMobileHeaderVisible ? -88 : 0,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-beige900/10 bg-beige200/95 backdrop-blur-lg"
    >
      <div className="mx-auto flex h-[64px] max-w-[1160px] items-center justify-between px-4">
        <a href="#top" className="font-instrument text-[28px] text-beige900">
          <Image src="/svgs/logov2.svg" alt="Harper" width={70} height={60} />
        </a>
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-3 text-[12.5px] font-medium text-beige900/60 sm:gap-4 sm:text-[13px] md:gap-5 md:text-sm">
            <a
              href="#voices"
              className="hidden transition hover:text-beige900 md:flex"
            >
              Success Stories
            </a>
            <Link href="/company" className="transition hover:text-beige900">
              For Companies
            </Link>
          </div>
          <CareerLandingButton
            href={careerStartHref}
            label="Join"
            size="sm"
            variant="secondary"
            showArrow={false}
            className="inline-flex"
          />
        </div>
      </div>
    </motion.nav>
  );
}
