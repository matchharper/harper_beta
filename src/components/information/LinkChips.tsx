import React from "react";
import { Tooltips } from "../ui/tooltip";
import { getLinkChipMeta } from "@/utils/linkChip";
import { cn } from "@/lib/cn";

type Props = {
  links: string[];
  size?: "default" | "sm";
};

function LinkChips({ links, size = "default" }: Props) {
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
                  : "bg-white/5 px-2.5 py-1.5 text-sm text-white hover:bg-white/20"
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
              <span className="ml-2 font-normal text-white">{label}</span>
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
  className,
}: {
  raw: string;
  size?: "default" | "sm" | "md";
  className?: string;
}) => {
  const { url, brand, icon, label } = getLinkChipMeta(raw);

  if (size === "sm" && !brand) return null;

  const isSm = size === "sm";
  const isMd = size === "md";

  return (
    <a
      key={raw}
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        `mt-2 inline-flex items-center justify-center rounded-md transition-all duration-200
        ${
          isSm
            ? "bg-white/0 p-0 hover:bg-white/0"
            : isMd
              ? "bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
              : "bg-white/5 px-2.5 py-1.5 text-sm text-white hover:bg-white/20"
        } `,
        className
      )}
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
      {!isSm && <span className="ml-2 font-light text-white">{label}</span>}
    </a>
  );
};
