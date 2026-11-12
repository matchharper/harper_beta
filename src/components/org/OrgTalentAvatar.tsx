"use client";

import Image from "next/image";
import { useState } from "react";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

/** Candidate identity shared by company lists and profile headers. */
export function OrgTalentAvatar({
  name,
  src,
  className = "size-9 rounded-full text-base",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const imageSrc = getDisplayableProfileImageUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-bg-weak text-neutral-muted",
        className
      )}
    >
      {name.slice(0, 1).toUpperCase() || "·"}
      {imageSrc && imageSrc !== failedSrc ? (
        <Image
          key={imageSrc}
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={64}
          width={64}
          src={imageSrc}
          unoptimized
          onError={() => setFailedSrc(imageSrc)}
        />
      ) : null}
    </span>
  );
}
