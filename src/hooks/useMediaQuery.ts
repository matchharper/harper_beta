"use client";

import { useSyncExternalStore } from "react";

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

const noopSubscribe = () => () => {};

export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined") return noopSubscribe();
    const mql = window.matchMedia(query);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  };

  const getSnapshot = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useBreakpointUp(bp: Breakpoint) {
  return useMediaQuery(`(min-width: ${breakpoints[bp]}px)`);
}

export function useBreakpointDown(bp: Breakpoint) {
  return useMediaQuery(`(max-width: ${breakpoints[bp] - 1}px)`);
}

export function useIsMobile() {
  return useBreakpointDown("md");
}

export function useIsTabletUp() {
  return useBreakpointUp("md");
}

export function useIsDesktop() {
  return useBreakpointUp("lg");
}

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function usePrefersDark() {
  return useMediaQuery("(prefers-color-scheme: dark)");
}
