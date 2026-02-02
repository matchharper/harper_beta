import { useLinkTitlePreview } from "@/hooks/useLinkTitlePreview";
import React, { useMemo } from "react";
import { Skeleton } from "./ui/skeleton";
import { dateToFormatLong } from "@/utils/textprocess";
export function getBrandFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const clean = hostname.replace(/^www\./, "");
    const parts = clean.split(".");
    return parts[0];
  } catch {
    return null;
  }
}

const LinkPreview = ({ url }: { url: string }) => {
  const { title, description, publishedAt, loading } = useLinkTitlePreview(url);

  const isFetched = useMemo(() => {
    return title !== null && title !== "Error" && title !== "";
  }, [title]);

  return (
    <div
      onClick={() => window.open(url, "_blank")}
      className="rounded-xl px-4 py-3 bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer font-light w-full"
    >
      {loading ? (
        <div className="flex flex-col items-start justify-start gap-2">
          <div className="text-sm text-hgray600">출처: {getBrandFromUrl(url) ?? url.slice(0, 26)}</div>
          <Skeleton className="h-[20px] bg-white/10 w-full rounded-md" />
          <Skeleton className="h-[20px] bg-white/10 w-full rounded-md" />
        </div>
      ) : isFetched ? (
        <div className="flex flex-col items-start justify-start gap-2">
          <div className="text-sm text-hgray600">출처: {getBrandFromUrl(url) ?? url.slice(0, 26)}</div>
          <div className="font-normal text-base">{title}</div>
          {
            description &&
            <div className="text-sm truncate text-hgray600 w-full">
              {description}
            </div>
          }
          {
            publishedAt &&
            <div className="mt-2 text-xs text-hgray500">
              {dateToFormatLong(publishedAt)}
            </div>
          }
        </div>
      ) : (
        <>
          <div className="text-hgray800 text-[15px]">{url}</div>
        </>
      )}
    </div>
  );
};

export default React.memo(LinkPreview);
