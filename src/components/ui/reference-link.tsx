"use client";

import { Globe2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** A source's icon and label; only its hostname is sent to the favicon service. */
export function ReferenceLink({
  href,
  hostname,
  label,
  className,
}: {
  href: string;
  hostname: string;
  label: string;
  className?: string;
}) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  const [failedIcon, setFailedIcon] = useState<string | null>(null);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} · ${hostname}\n${href}`}
      aria-label={`${label} (${hostname})`}
      data-rich-text-reference="true"
      className={cn(
        "inline-flex max-w-full items-center gap-1 align-baseline text-[12px] font-normal leading-5 text-action no-underline transition-colors hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        className
      )}
    >
      {failedIcon === faviconUrl ? (
        <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Image
          src={faviconUrl}
          alt=""
          aria-hidden="true"
          width={14}
          height={14}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-3.5 w-3.5 shrink-0 object-contain"
          onError={() => setFailedIcon(faviconUrl)}
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </a>
  );
}
