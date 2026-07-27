"use client";

import { useEffect, useRef, useState } from "react";

type UseHideOnScrollOptions = {
  enabled?: boolean;
  scrollContainerId?: string;
  threshold?: number;
  topRevealThreshold?: number;
};

export function useHideOnScroll({
  enabled = true,
  scrollContainerId,
  threshold = 8,
  topRevealThreshold = 12,
}: UseHideOnScrollOptions = {}) {
  const [visible, setVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }

    const scrollTarget =
      (scrollContainerId ? document.getElementById(scrollContainerId) : null) ??
      window;
    const getScrollY = () =>
      scrollTarget === window
        ? window.scrollY
        : (scrollTarget as HTMLElement).scrollTop;
    const getMaxScrollY = () => {
      if (scrollTarget === window) {
        const scrollingElement =
          document.scrollingElement ?? document.documentElement;
        return Math.max(scrollingElement.scrollHeight - window.innerHeight, 0);
      }

      const element = scrollTarget as HTMLElement;
      return Math.max(element.scrollHeight - element.clientHeight, 0);
    };

    lastScrollYRef.current = getScrollY();

    const handleScroll = () => {
      const currentY = getScrollY();
      const delta = currentY - lastScrollYRef.current;
      const maxY = getMaxScrollY();
      const isAtBottom = maxY > 0 && currentY >= maxY - threshold;

      if (currentY <= topRevealThreshold) {
        setVisible(true);
        lastScrollYRef.current = currentY;
        return;
      }

      if (Math.abs(delta) < threshold) return;

      if (isAtBottom && delta < 0) {
        setVisible(false);
        lastScrollYRef.current = currentY;
        return;
      }

      setVisible(delta <= 0);
      lastScrollYRef.current = currentY;
    };

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [enabled, scrollContainerId, threshold, topRevealThreshold]);

  return enabled ? visible : true;
}
