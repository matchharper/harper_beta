import { normalizeVenue, parsePublishedAt } from "@/utils/conference_map";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import React from "react";

const PublicationBox = ({
  title,
  published_at,
  link,
  citation_num,
}: {
  title: string;
  published_at: string;
  link: string;
  citation_num: number;
}) => {
  const mapped = normalizeVenue(published_at);
  const { venue, year } = parsePublishedAt(published_at);

  return (
    <div onClick={() => {
      window.open(link, "_blank");
    }} className="rounded-sm flex flex-row gap-2 items-start justify-between px-2 py-2 mb-2 group cursor-pointer hover:bg-white/5 transition-all duration-200">
      <div className="flex flex-col items-start justify-start w-full">
        <div className="w-full text-sm flex flex-row items-start justify-between gap-2 font-light">
          <div className="flex-1 min-w-0 text-base break-words">{title}</div>
          <div className="shrink-0 whitespace-nowrap text-hgray700 text-[13px] pt-0.5">{citation_num >= 0 ? `${citation_num} Cite` : ""}</div>
        </div>
        <div className="w-full flex flex-row items-center justify-between gap-2">
          <div className="text-sm text-hgray600 mt-1 flex flex-row items-center justify-start">
            {mapped && <div className="font-light text-left text-accenta1/90 mr-2">{mapped}</div>}
            <div>{venue}</div>
          </div>
          <div className="shrink-0 whitespace-nowrap text-hgray700 text-[13px] pt-0.5">{year}</div>
        </div>
      </div>
      {link ? (
        <div
          className="inline-flex items-center gap-1 text-sm text-hgray700 hover:underline"
        >
          <ArrowUpRight className="group-hover:translate-x-[1px] group-hover:translate-y-[-1px] transition-all duration-200" size={16} />
        </div>
      ) : (
        <div className="text-sm text-xgray500">
          <ArrowUpRight className="opacity-0 group-hover:translate-x-[1px] group-hover:translate-y-[-1px] transition-all duration-200" size={16} />
        </div>
      )}
    </div>
  );
};

export default React.memo(PublicationBox);
