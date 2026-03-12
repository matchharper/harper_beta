import React from "react";
import { Tooltips } from "../ui/tooltip";
import { BRAND_MAP } from "./LinkChips";

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

        const url = raw.startsWith("http") ? raw : `https://${raw}`;

        let host = raw;
        try {
          host = new URL(url).hostname.replace("www.", "");
        } catch {}

        const brand = BRAND_MAP.find((b) => b.match(url));

        // sm일 때는 매핑 안 되는 링크는 아예 렌더링 X
        if (size === "sm" && !brand) return null;

        const finalBrand = brand ?? {
          label: host,
          icon: "/svgs/chain.svg",
        };

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
            <Tooltips text={isSm ? finalBrand.label : ""}>
              <img
                src={finalBrand.icon}
                alt=""
                className={
                  isSm
                    ? "h-4 w-4"
                    : finalBrand.icon.includes("/svgs/chain")
                      ? "h-3.5 w-3.5"
                      : "h-4 w-4"
                }
              />
            </Tooltips>
            {!isSm && (
              <span className="ml-2 font-normal">{finalBrand.label}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

export default React.memo(LinkPills);
