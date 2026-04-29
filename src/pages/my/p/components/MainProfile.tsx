import React from "react";
import LinkChips from "./LinkChips";
import { locationEnToKo } from "@/utils/language_map";
import { LucideIcon, MapPin } from "lucide-react";
import { initials } from "@/components/NameProfile";

const MainProfile = ({
  profile_picture,
  name,
  headline,
  location,
  links,
  onLinkClick,
  metaLabel,
  metaIcon,
  profileRevealed = true,
}: {
  profile_picture: string;
  name: string;
  headline: string;
  location?: string;
  links: string[];
  onLinkClick?: (url: string) => void;
  metaLabel?: string;
  metaIcon?: LucideIcon;
  profileRevealed?: boolean;
}) => {
  const hasLinks = (links?.length ?? 0) > 0;
  const resolvedMetaLabel =
    metaLabel?.trim() || (location ? locationEnToKo(location) : "");
  const MetaIcon = metaIcon ?? MapPin;

  return (
    <div className="items-start w-[100%] grid grid-cols-7">
      <div className="col-span-1">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-beige900 border border-beige900/5 shrink-0">
          {profile_picture && !profile_picture.includes("media.licdn.com") ? (
            <img
              src={profile_picture}
              alt={name ?? "profile"}
              width={92}
              height={92}
              className={`w-24 h-24 object-cover ${profileRevealed ? "" : "scale-110 blur-2xl"}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-beige900 bg-beige500 font-normal text-2xl">
              {initials(name)}
            </div>
          )}
        </div>
      </div>

      <div className="col-span-6 flex flex-col flex-1 min-w-0 gap-2">
        <div className="text-2xl font-normal text-beige900">{name}</div>
        <div className="text-base text-beige900 font-light">{headline}</div>

        <div className="flex flex-wrap items-center gap-1 text-sm text-beige900/55 font-normal">
          {resolvedMetaLabel && (
            <div className="flex flex-row items-center gap-1">
              <MetaIcon className="w-4 h-4" />
              <span className="inline-flex items-center gap-1">
                {resolvedMetaLabel}
              </span>
            </div>
          )}
        </div>

        {/* Links */}
        <div className="mt-1">
          {!hasLinks ? (
            <div className="text-sm text-beige900/55">No links</div>
          ) : (
            <LinkChips
              links={links}
              onLinkClick={onLinkClick}
              masked={!profileRevealed}
              disableLinks={!profileRevealed}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(MainProfile);
