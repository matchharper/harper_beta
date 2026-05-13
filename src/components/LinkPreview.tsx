import { useLinkTitlePreview } from "@/hooks/useLinkTitlePreview";
import React, { useMemo } from "react";
import { Skeleton } from "./ui/skeleton";
import { dateToFormatLong } from "@/utils/textprocess";
import { ArrowUpRight } from "lucide-react";

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
      className="group w-full cursor-pointer rounded-[8px] border border-beige900/10 bg-white/70 px-4 py-3 font-light shadow-[0_8px_24px_rgba(46,23,6,0.04)] transition-all duration-200 hover:border-beige900/20 hover:bg-white hover:shadow-[0_12px_30px_rgba(46,23,6,0.08)]"
    >
      {loading ? (
        <div className="flex flex-col items-start justify-start gap-2">
          <div className="text-xs text-beige900/45">
            출처: {getBrandFromUrl(url) ?? url.slice(0, 26)}
          </div>
          <Skeleton className="h-[20px] w-full rounded-md bg-beige900/10" />
          <Skeleton className="h-[20px] w-full rounded-md bg-beige900/10" />
        </div>
      ) : isFetched ? (
        <div className="flex flex-col items-start justify-start gap-2">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 truncate text-xs text-beige900/45">
              출처: {getBrandFromUrl(url) ?? url.slice(0, 26)}
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-beige900/35 transition-colors group-hover:text-beige900/60" />
          </div>
          <div className="text-base font-medium leading-6 text-beige900">
            {title}
          </div>
          {description && (
            <div className="w-full truncate text-sm leading-5 text-beige900/55">
              {description}
            </div>
          )}
          {publishedAt && (
            <div className="mt-1 text-xs text-beige900/40">
              {dateToFormatLong(publishedAt)}
            </div>
          )}
        </div>
      ) : (
        <div className="break-all text-[15px] leading-6 text-beige900/75">
          {url}
        </div>
      )}
    </div>
  );
};

export default React.memo(LinkPreview);
