import type { ReactNode } from "react";
import Image from "next/image";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TalentProfileResource = {
  disabled?: boolean;
  href?: string;
  imageSrc?: string;
  key: string;
  kind?: "document" | "link" | "linkedin" | "resume";
  label: string;
  onClick?: () => void;
  title?: string;
};

export function getTalentProfileLinkImageSrc(link: string) {
  const normalized = link.trim().toLowerCase();
  if (normalized.includes("linkedin.com")) {
    return "/images/logos/linkedin.svg";
  }
  if (normalized.includes("github.com")) return "/svgs/github.svg";
  if (normalized.includes("gitlab.com")) return "/images/logos/gitlab.svg";
  if (normalized.includes("notion.")) return "/images/logos/notion.svg";
  if (normalized.includes("drive.google.com")) {
    return "/images/logos/drive.svg";
  }
  if (normalized.includes("dropbox.com")) {
    return "/images/logos/dropbox.svg";
  }
  if (normalized.includes("scholar.google.")) {
    return "/images/logos/scholar.png";
  }
  if (normalized.includes("leetcode.com")) return "/svgs/leetcode.svg";
  if (normalized.includes("x.com") || normalized.includes("twitter.com")) {
    return "/images/logos/xcom.png";
  }
  if (normalized.includes("crunchbase.com")) return "/images/crunchbase.png";
  return "/svgs/chain.svg";
}

function ResourceImage({
  imageSrc,
  kind,
}: Pick<TalentProfileResource, "imageSrc" | "kind">) {
  const src =
    imageSrc ??
    (kind === "linkedin"
      ? "/images/logos/linkedin.svg"
      : kind === "resume" || kind === "document"
        ? "/svgs/file.svg"
        : "/svgs/chain.svg");
  const needsDarkFilter = src === "/svgs/file.svg" || src === "/svgs/chain.svg";

  return (
    <Image
      src={src}
      alt=""
      width={16}
      height={16}
      unoptimized
      className={cn(
        "size-3.5 shrink-0 object-contain",
        needsDarkFilter && "brightness-0 opacity-60"
      )}
    />
  );
}

function TalentProfileResourceChip({
  resource,
}: {
  resource: TalentProfileResource;
}) {
  const content = (
    <>
      <ResourceImage imageSrc={resource.imageSrc} kind={resource.kind} />
      <span className="min-w-0 max-w-40 truncate">{resource.label}</span>
    </>
  );

  if (resource.href) {
    return (
      <MuteButton asChild className="min-w-0" size="sm" variant="neutral">
        <a
          href={resource.href}
          target="_blank"
          rel="noreferrer"
          title={resource.title}
        >
          {content}
        </a>
      </MuteButton>
    );
  }

  return (
    <MuteButton
      className="min-w-0"
      disabled={resource.disabled}
      onClick={resource.onClick}
      size="sm"
      title={resource.title}
      type="button"
      variant="neutral"
    >
      {content}
    </MuteButton>
  );
}

export function TalentProfileHeader({
  avatar,
  headline,
  location,
  name,
  primaryResources = [],
  secondaryResources = [],
}: {
  avatar: ReactNode;
  headline?: string | null;
  location?: string | null;
  name: string;
  primaryResources?: TalentProfileResource[];
  secondaryResources?: TalentProfileResource[];
}) {
  const hasResources =
    primaryResources.length > 0 || secondaryResources.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium text-neutral-primary">
            {name}
          </div>
          {headline?.trim() ? (
            <div className="mt-1 text-[13px] leading-5 text-neutral-primary">
              {headline.trim()}
            </div>
          ) : null}
          {location?.trim() ? (
            <div className="mt-1 text-[13px] leading-5 text-neutral-muted">
              {location.trim()}
            </div>
          ) : null}
        </div>
      </div>

      {hasResources ? (
        <div
          aria-label="등록 자료"
          className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:max-w-[55%] sm:items-end"
        >
          {primaryResources.length > 0 ? (
            <div className="flex w-full flex-nowrap gap-2 sm:w-auto sm:justify-end">
              {primaryResources.map((resource) => (
                <TalentProfileResourceChip
                  key={resource.key}
                  resource={resource}
                />
              ))}
            </div>
          ) : null}
          {secondaryResources.length > 0 ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {secondaryResources.map((resource) => (
                <TalentProfileResourceChip
                  key={resource.key}
                  resource={resource}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
