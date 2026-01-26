import { useLinkTitlePreview } from "@/hooks/useLinkTitlePreview";
import React, { useMemo } from "react";
import { Skeleton } from "./ui/skeleton";
import { dateToFormatLong } from "@/utils/textprocess";

const LinkPreview = ({ url }: { url: string }) => {
  const { title, description, publishedAt, loading } = useLinkTitlePreview(url);

  const isFetched = useMemo(() => {
    return title !== null && title !== "Error" && title !== "";
  }, [title]);

  return (
    <div
      onClick={() => window.open(url, "_blank")}
      className="rounded-xl p-6 bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer font-light w-full"
    >
      {loading ? (
        <div className="flex flex-col items-start justify-start gap-1">
          <div className="text-xs text-hgray500">{url.slice(0, 26)}..</div>
          <Skeleton className="h-[20px] bg-white/10 w-full rounded-md" />
          <Skeleton className="h-[20px] bg-white/10 w-full rounded-md" />
        </div>
      ) : isFetched ? (
        <>
          <div className="text-xs text-hgray500">{url.slice(0, 26)}..</div>
          <div className="mt-0.5 font-normal">{title}</div>
          <div className="text-sm truncate text-hgray600 mt-1">
            {description}
          </div>
          <div className="mt-2 text-xs text-hgray500">
            {publishedAt ? dateToFormatLong(publishedAt) : ""}
          </div>
        </>
      ) : (
        <>
          <div className="text-hgray800 text-[15px]">{url}</div>
        </>
      )}
    </div>
  );
};

export default React.memo(LinkPreview);
