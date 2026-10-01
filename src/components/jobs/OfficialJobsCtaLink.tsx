"use client";

import { MuteButton, type MuteButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildOfficialJobsCareerHref,
  buildOfficialJobsLoginHref,
  OFFICIAL_JOBS_LOGIN_HREF,
  type OfficialJobsCareerJob,
} from "@/lib/officialJobs";
import {
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { getOfficialJobsAnonymousId } from "@/lib/officialJobs/events";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  readActiveCareerExplicitUtmSourceFromStorage,
} from "@/lib/career/utm";
import { useAuthStore } from "@/store/useAuthStore";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

type OfficialJobsCtaLinkProps = Pick<MuteButtonProps, "size" | "variant"> & {
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  job?: OfficialJobsCareerJob;
  locale?: OfficialJobsLocale;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export default function OfficialJobsCtaLink({
  children,
  className,
  fullWidth,
  job,
  locale = "ko",
  onClick,
  size,
  variant = "dark",
}: OfficialJobsCtaLinkProps) {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const copy = getOfficialJobsCopy(locale);
  const careerHref = job ? buildOfficialJobsCareerHref(job) : "/career";
  const href =
    !loading && user
      ? careerHref
      : job
        ? buildOfficialJobsLoginHref(null, careerHref)
        : OFFICIAL_JOBS_LOGIN_HREF;

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    const resolvedAnonymousId = getOfficialJobsAnonymousId();
    const activeExplicitUtmSource =
      readActiveCareerExplicitUtmSourceFromStorage();
    let careerLandingId = resolvedAnonymousId;

    if (typeof window !== "undefined" && resolvedAnonymousId) {
      if (activeExplicitUtmSource) {
        careerLandingId =
          window.localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ||
          resolvedAnonymousId;
      } else {
        window.localStorage.setItem(
          CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
          resolvedAnonymousId
        );
        window.localStorage.setItem(
          CAREER_UTM_SOURCE_STORAGE_KEY,
          OFFICIAL_JOBS_LANDING_SOURCE
        );
      }
    }

    onClick?.(event);

    if (
      loading ||
      user ||
      !resolvedAnonymousId ||
      event.defaultPrevented ||
      typeof window === "undefined"
    ) {
      return;
    }

    event.preventDefault();
    window.location.href = buildOfficialJobsLoginHref(
      careerLandingId,
      careerHref
    );
  };

  return (
    <MuteButton
      asChild
      className={cn(fullWidth && "w-full", className)}
      size={size}
      variant={variant}
    >
      <Link href={href} onClick={handleClick}>
        {children ?? copy.cta.control}
      </Link>
    </MuteButton>
  );
}
