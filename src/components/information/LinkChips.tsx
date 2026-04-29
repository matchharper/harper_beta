import React from "react";
import { Tooltips } from "../ui/tooltip";
import { getLinkChipMeta } from "@/utils/linkChip";

type Props = {
  links: string[];
  size?: "default" | "sm";
  theme?: "dark" | "cream";
};

function LinkChips({ links, size = "default", theme = "cream" }: Props) {
  if (!links?.length) return null;

  const isDark = theme === "dark";

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
                  : isDark
                    ? "bg-white/5 px-2.5 py-1.5 text-sm text-white hover:bg-white/20"
                    : "bg-beige500/55 px-2.5 py-1.5 text-sm text-beige900 hover:bg-beige500/70"
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
            {!isSm && (
              <span className={`ml-2 font-normal ${isDark ? "text-white" : "text-beige900"}`}>{label}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

export default React.memo(LinkChips);

export const LinkChip = ({
  raw,
  size = "default",
  theme = "cream",
}: {
  raw: string;
  size?: "default" | "sm" | "md";
  theme?: "dark" | "cream";
}) => {
  const { url, brand, icon, label } = getLinkChipMeta(raw);

  if (size === "sm" && !brand) return null;

  const isSm = size === "sm";
  const isMd = size === "md";
  const isDark = theme === "dark";

  return (
    <a
      key={raw}
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`mt-2 inline-flex items-center justify-center rounded-md transition-all duration-200
        ${
          isSm
            ? "bg-white/0 p-0 hover:bg-white/0"
            : isMd
              ? isDark
                ? "bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
                : "bg-beige500/55 px-2 py-1 text-xs text-beige900 hover:bg-beige500/70"
              : isDark
                ? "bg-white/5 px-2.5 py-1.5 text-sm text-white hover:bg-white/20"
                : "bg-beige500/55 px-2.5 py-1.5 text-sm text-beige900 hover:bg-beige500/70"
        }`}
    >
      <Tooltips text={isSm ? label : ""}>
        <img
          src={icon}
          alt=""
          className={
            isSm
              ? "h-4 w-4"
              : isMd
                ? "h-3 w-3"
                : icon.includes("/svgs/chain")
                  ? "h-3.5 w-3.5"
                  : "h-4 w-4"
          }
        />
      </Tooltips>
      {!isSm && <span className={`ml-2 font-light ${isDark ? "text-white" : "text-beige900"}`}>{label}</span>}
    </a>
  );
};
