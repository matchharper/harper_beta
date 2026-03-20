import { normalizeVenue, parsePublishedAt } from "@/utils/conference_map";
import { ArrowUpRight } from "lucide-react";
import React from "react";
import { usePaperModalStore } from "@/store/usePaperModalStore";

const PublicationBox = ({
  title,
  published_at,
  link,
  citation_num,
  paperId,
}: {
  title: string;
  published_at?: string | null;
  link?: string | null;
  citation_num: number;
  paperId?: string | null;
}) => {
  const mapped = normalizeVenue(published_at ?? "");
  const { venue, year } = parsePublishedAt(published_at ?? "");
  const { handleOpenPaper } = usePaperModalStore();
  const isInteractive = !!paperId || !!link;

  const handleClick = () => {
    if (paperId) {
      handleOpenPaper({ paperId }).catch(() => {});
      return;
    }
    if (link) {
      window.open(link, "_blank");
    }
  };

  return (
    <div
      onClick={isInteractive ? handleClick : undefined}
      className={`rounded-sm flex flex-row gap-2 items-start justify-between px-2 py-2 mb-2 group transition-all duration-200 ${
        isInteractive ? "cursor-pointer hover:bg-white/5" : ""
      }`}
    >
      <div className="flex flex-col items-start justify-start w-full">
        <div className="w-full text-sm flex flex-row items-start justify-between gap-2 font-light">
          <div className="flex-1 min-w-0 text-base break-words">{title}</div>
          <div className="shrink-0 whitespace-nowrap text-hgray700 text-sm pt-0.5">
            {citation_num >= 0 ? `${citation_num} Cite` : ""}
          </div>
        </div>
        <div className="w-full flex flex-row items-center justify-between gap-2">
          <div className="text-sm text-hgray600 mt-1 flex flex-row items-center justify-start">
            {mapped && (
              <div className="font-light text-left text-accenta1/90 mr-2">
                {mapped}
              </div>
            )}
            <div>{venue}</div>
          </div>
          <div className="shrink-0 whitespace-nowrap text-hgray700 text-[15px] pt-0.5">
            {year}
          </div>
        </div>
      </div>
      {isInteractive ? (
        <div className="inline-flex items-center gap-1 text-sm text-hgray700 hover:underline">
          <ArrowUpRight
            className="group-hover:translate-x-[1px] group-hover:translate-y-[-1px] transition-all duration-200"
            size={16}
          />
        </div>
      ) : (
        <div className="text-sm text-xgray500">
          <ArrowUpRight
            className="opacity-0 group-hover:translate-x-[1px] group-hover:translate-y-[-1px] transition-all duration-200"
            size={16}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(PublicationBox);
