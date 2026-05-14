"use client";

import { useEffect, useRef, useState } from "react";

type UseHideOnScrollOptions = {
  enabled?: boolean;
  threshold?: number;
  topRevealThreshold?: number;
};

export function useHideOnScroll({
  enabled = true,
  threshold = 8,
  topRevealThreshold = 12,
}: UseHideOnScrollOptions = {}) {
  const [visible, setVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      if (currentY <= topRevealThreshold) {
        setVisible(true);
        lastScrollYRef.current = currentY;
        return;
      }

      if (Math.abs(delta) < threshold) return;

      setVisible(delta <= 0);
      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled, threshold, topRevealThreshold]);

  return enabled ? visible : true;
}
