import { useMessages } from "@/i18n/useMessage";
import { replaceName } from "@/utils/textprocess";
import { Loader2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";

type SummaryItem = { text: string };
type ProfileBioProps = {
  summary?: SummaryItem[];
  bio?: string;
  name: string;
  oneline?: string;
  isLoadingOneline: boolean;
  onToggleMore?: (nextOpen: boolean) => void;
  profileRevealed?: boolean;
};

export function sanitizeProfileLine(raw: string) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const ProfileBio = ({
  summary = [],
  bio = "",
  name,
  oneline = "",
  isLoadingOneline,
  onToggleMore,
  profileRevealed = true,
}: ProfileBioProps) => {
  const [isBioOpen, setIsBioOpen] = useState(false);
  const { m } = useMessages();

  const displayLine = useMemo(() => {
    if (summary?.length > 0 && summary[0]?.text)
      return sanitizeProfileLine(replaceName(summary[0].text, name));
    if (oneline) return sanitizeProfileLine(replaceName(oneline, name));
    return "";
  }, [summary, oneline, name]);

  const hasBio = Boolean(bio?.trim()) && profileRevealed;

  return (
    <div className="pb-4">
      {hasBio && (
        <div className="flex flex-row w-full items-center justify-end gap-2">
          <BareButton
            type="button"
            className="text-sm text-neutral-muted font-normal hover:text-neutral-primary transition-all duration-200"
            onClick={() => {
              const nextOpen = !isBioOpen;
              onToggleMore?.(nextOpen);
              setIsBioOpen(nextOpen);
            }}
            aria-expanded={isBioOpen}
          >
            {isBioOpen ? "접기" : "더보기"}
          </BareButton>
        </div>
      )}
      <div className="text-neutral-primary grid grid-cols-7 mt-2">
        {/* Header */}
        <div className="col-span-1">
          <div className="text-base font-normal text-neutral-primary">
            {m?.data?.summary ?? "요약"}
          </div>
        </div>
        <div className="text-neutral-primary col-span-6 flex flex-col gap-2 mb-2">
          {displayLine ? (
            <div className="whitespace-pre-wrap leading-relaxed text-[15px] wrap-break-word">
              {displayLine}
            </div>
          ) : !profileRevealed ? (
            <div className="whitespace-pre-wrap leading-relaxed text-[15px] wrap-break-word text-neutral-muted">
              열람 후 확인할 수 있습니다.
            </div>
          ) : isLoadingOneline ? (
            <div className="flex flex-row items-center gap-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              <div className="animate-textGlow text-sm">
                설명을 작성중입니다...
              </div>
            </div>
          ) : null}

          {/* Bio */}
          {hasBio && (
            <div className="text-[15px] text-neutral-primary leading-6 font-light mt-1">
              {isBioOpen ? (
                <div className="whitespace-pre-wrap">
                  {replaceName(bio, name)}
                </div>
              ) : (
                <div className="line-clamp-1">{replaceName(bio, name)}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProfileBio);
