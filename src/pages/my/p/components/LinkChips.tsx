import React from "react";
import { getLinkChipMeta } from "@/utils/linkChip";

type Props = {
  links: string[];
  onLinkClick?: (url: string) => void;
  masked?: boolean;
  disableLinks?: boolean;
};

function LinkChips({
  links,
  onLinkClick,
  masked = false,
  disableLinks = false,
}: Props) {
  if (!links?.length) return null;
  // logger.log(links.map((l) => l.toLowerCase().includes("cv.pdf")));

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((raw) => {
        if (!raw || raw === "") return null;

        const { url, brand, icon, label } = getLinkChipMeta(raw);
        const displayLabel =
          brand?.label === "linkedin" && label === "linkedin" ? "링크드인" : label;

        const content = (
          <>
            <img
              src={icon}
              className={`${
                icon.includes("/svgs/chain") ? "h-3.5 w-3.5" : "h-4 w-4 "
              }`}
              alt=""
            />
            {masked ? "****" : displayLabel}
          </>
        );

        if (disableLinks) {
          return (
            <div
              key={raw}
              className="inline-flex cursor-default font-normal items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/75"
            >
              {content}
            </div>
          );
        }

        return (
          <a
            key={raw}
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => onLinkClick?.(url)}
            className="inline-flex font-normal items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white hover:bg-white/10 transition-all duration-200"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

export default React.memo(LinkChips);
