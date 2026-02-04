import { normalizeVenue } from "@/utils/conference_map";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import React from "react";

const PublicationBox = ({
  title,
  published_at,
  link,
}: {
  title: string;
  published_at: string;
  link: string;
}) => {
  const mapped = normalizeVenue(published_at);

  return (
    <div onClick={() => {
      window.open(link, "_blank");
    }} className="rounded-sm flex flex-row gap-2 items-center justify-between px-2 py-2 group cursor-pointer hover:bg-white/5 transition-all duration-200">
      <div className="flex flex-col items-start justify-start">
        <div className="text-base font-light">{title}</div>
        <div className="text-sm text-hgray600 mt-1">{published_at}</div>
      </div>
      {link ? (
        <div
          className="inline-flex items-center gap-1 text-sm text-hgray700 hover:underline"
        >
          Open
          <ArrowUpRight className="group-hover:translate-x-[1px] group-hover:translate-y-[-1px] transition-all duration-200" size={16} />
        </div>
      ) : (
        <div className="text-sm text-xgray500">No link</div>
      )}
    </div>
  );
};

export default React.memo(PublicationBox);
