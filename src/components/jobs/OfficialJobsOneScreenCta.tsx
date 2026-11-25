"use client";

import { MuteButton, type MuteButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import {
  OFFICIAL_JOBS_ONESCREEN_ANCHOR_ID,
  OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT,
} from "./oneScreenLinks";

/**
 * Scrolls to the PC card, opens its sign-up box and focuses it. False when the card is not on screen
 * (below lg its wrapper is display: none), so the caller follows its link.
 */
function focusOfficialJobsOneScreenCard() {
  const card = document.getElementById(OFFICIAL_JOBS_ONESCREEN_ANCHOR_ID);
  if (!card || card.getClientRects().length === 0) return false;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  card.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  card.focus({ preventScroll: true });
  window.dispatchEvent(new Event(OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT));
  return true;
}

type OfficialJobsOneScreenCtaLinkProps = Pick<
  MuteButtonProps,
  "size" | "variant"
> & {
  /** Where the button goes when the PC card is not on screen. */
  href: string;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * A button on a posting that shows the one screen. Where the PC card is on
 * screen (lg) it scrolls to the card and focuses it; elsewhere it opens `href`
 * in place (a shallow route change: same page, no new server load).
 */
export default function OfficialJobsOneScreenCtaLink({
  href,
  children,
  className,
  fullWidth,
  onClick,
  size,
  variant = "dark",
}: OfficialJobsOneScreenCtaLinkProps) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (focusOfficialJobsOneScreenCard()) event.preventDefault();
  };

  return (
    <MuteButton
      asChild
      className={cn(fullWidth && "w-full", className)}
      size={size}
      variant={variant}
    >
      <Link href={href} shallow onClick={handleClick}>
        {children}
      </Link>
    </MuteButton>
  );
}
