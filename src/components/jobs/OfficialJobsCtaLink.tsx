"use client";

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
import {
  getOfficialJobsApplyHelpExperimentAbtestType,
  OFFICIAL_JOBS_APPLY_HELP_CONTROL_COPY_CLASS,
  OFFICIAL_JOBS_APPLY_HELP_TREATMENT_COPY_CLASS,
} from "@/lib/officialJobs/experiment";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
} from "@/lib/career/utm";
import { useAuthStore } from "@/store/useAuthStore";
import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

const ctaLinkVariants = cva(
  "group inline-flex items-center justify-center gap-2 rounded-[4px] font-normal outline-none transition focus-visible:ring-4 focus-visible:ring-neutral-1000-a05 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "border border-neutral-800 bg-black text-neutral-00 hover:opacity-90",
        secondary:
          "border border-transparent bg-transparent md:border-neutral-1000-a10 md:bg-neutral-00/50 text-neutral-primary hover:border-neutral-400 hover:bg-bg-default/75",
      },
      size: {
        sm: "px-4 text-[13px] min-h-9 rounded-full",
        md: "px-4 text-[14px] min-h-10",
        lg: "px-4 text-[15px] min-h-11",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

type OfficialJobsCtaLinkProps = VariantProps<typeof ctaLinkVariants> & {
  children?: ReactNode;
  className?: string;
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
  variant,
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
    const experimentAbtestType = getOfficialJobsApplyHelpExperimentAbtestType();

    if (typeof window !== "undefined" && resolvedAnonymousId) {
      window.localStorage.setItem(
        CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
        resolvedAnonymousId
      );
      window.localStorage.setItem(
        CAREER_UTM_SOURCE_STORAGE_KEY,
        OFFICIAL_JOBS_LANDING_SOURCE
      );
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
      resolvedAnonymousId,
      careerHref,
      experimentAbtestType
    );
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(ctaLinkVariants({ fullWidth, size, variant }), className)}
    >
      {children ?? (
        <span>
          <span className={OFFICIAL_JOBS_APPLY_HELP_CONTROL_COPY_CLASS}>
            {copy.cta.control}
          </span>
          <span className={OFFICIAL_JOBS_APPLY_HELP_TREATMENT_COPY_CLASS}>
            {copy.cta.treatment}
          </span>
        </span>
      )}
    </Link>
  );
}
