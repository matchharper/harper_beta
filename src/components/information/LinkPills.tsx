import React from "react";
import { Tooltips } from "../ui/tooltip";
import { getLinkChipMeta } from "@/utils/linkChip";

type Props = {
  links: string[];
  size?: "default" | "sm";
};

function LinkPills({ links, size = "default" }: Props) {
  if (!links?.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((raw) => {
        if (!raw) return null;

        const { url, brand, icon, label } = getLinkChipMeta(raw);

        if (size === "sm" && !brand) return null;

        const isSm = size === "sm";

        return (
          <a
            key={raw}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center rounded-md transition-all duration-200
              ${
                isSm
                  ? "bg-white/0 p-0 hover:bg-white/0"
                  : "bg-hblack50 px-2.5 py-1.5 text-xs text-black hover:bg-hblack100"
              }`}
          >
            <Tooltips text={isSm ? label : ""}>
              <img
                src={icon}
                alt=""
                className={
                  isSm
                    ? "h-4 w-4"
                    : icon.includes("/svgs/chain")
                      ? "h-3.5 w-3.5"
                      : "h-4 w-4"
                }
              />
            </Tooltips>
            {!isSm && <span className="ml-2 font-normal">{label}</span>}
          </a>
        );
      })}
    </div>
  );
}

export default React.memo(LinkPills);
