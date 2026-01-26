import React from "react";
import { Tooltips } from "../ui/tooltip";

export const BRAND_MAP = [
  {
    match: (h: string) => h.includes("linkedin.com"),
    label: "linkedin",
    icon: "https://www.linkedin.com/favicon.ico",
  },
  {
    match: (h: string) => h === "x.com" || h.includes("twitter.com"),
    label: "x.com",
    icon: "https://abs.twimg.com/favicons/twitter.3.ico",
  },
  {
    match: (h: string) => h.includes("instagram.com"),
    label: "instagram",
    icon: "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png",
  },
  {
    match: (h: string) => h.includes("github.com"),
    label: "github",
    icon: "/svgs/github_white.svg",
  },
  {
    match: (h: string) => h.includes("scholar.google."),
    label: "google scholar",
    icon: "https://scholar.google.com/favicon.ico",
  },
  {
    match: (h: string) => h.toLowerCase().includes("cv.pdf"),
    label: "cv.pdf",
    icon: "/svgs/file.svg",
  },
  {
    match: (h: string) => h.toLowerCase().includes("crunchbase.com"),
    label: "crunchbase",
    icon: "/images/crunchbase.png",
  },
];

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
                  : "bg-white/5 px-2.5 py-1.5 text-sm text-white hover:bg-white/20"
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
              <span className="ml-2 font-normal text-white">
                {finalBrand.label}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

export default React.memo(LinkChips);
