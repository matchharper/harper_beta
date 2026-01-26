import LinkChips from "@/components/information/LinkChips";
import { useMessages } from "@/i18n/useMessage";
import { replaceName } from "@/utils/textprocess";
import { Loader2 } from "lucide-react";
import React, { useMemo, useState } from "react";

type SummaryItem = { text: string };

type ProfileBioProps = {
    summary?: SummaryItem[];
    bio?: string;
    name: string;
    oneline?: string;
    isLoadingOneline: boolean;
    links?: string[];
};

const ProfileBio = ({
    summary = [],
    bio = "",
    name,
    oneline = "",
    isLoadingOneline,
    links = [],
}: ProfileBioProps) => {
    const [isBioOpen, setIsBioOpen] = useState(false);
    const { m } = useMessages();

    const displayLine = useMemo(() => {
        if (summary?.length > 0 && summary[0]?.text) return replaceName(summary[0].text, name);
        if (oneline) return replaceName(oneline, name);
        return "";
    }, [summary, oneline, name]);

    const hasBio = Boolean(bio?.trim());
    const hasLinks = (links?.length ?? 0) > 0;

    return (
        <div className="text-hgray900 flex flex-col gap-2 mb-2">
            {/* Header */}
            <div className="flex flex-row items-center justify-between gap-2">
                <div className="text-base font-normal">{m?.data?.summary ?? "요약"}</div>

                {hasBio && (
                    <button
                        type="button"
                        className="text-sm text-ngray600 font-normal hover:text-accenta1 transition-all duration-200"
                        onClick={() => setIsBioOpen((v) => !v)}
                        aria-expanded={isBioOpen}
                    >
                        {isBioOpen ? "접기" : "더보기"}
                    </button>
                )}
            </div>

            {/* Summary / One-line / Loading */}
            {displayLine ? (
                <div>{displayLine}</div>
            ) : isLoadingOneline ? (
                <div className="flex flex-row items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <div className="animate-textGlow text-sm">설명을 작성중입니다...</div>
                </div>
            ) : null}

            {/* Bio */}
            {hasBio && (
                <div className="text-[15px] text-hgray700 leading-6 font-light mt-1">
                    {isBioOpen ? (
                        <div className="whitespace-pre-wrap">{replaceName(bio, name)}</div>
                    ) : (
                        <div className="line-clamp-1">{replaceName(bio, name)}</div>
                    )}
                </div>
            )}

            {/* Links */}
            <div className="mt-4">
                {!hasLinks ? (
                    <div className="text-sm text-xgray600">No links</div>
                ) : (
                    <LinkChips links={links} />
                )}
            </div>
        </div>
    );
};

export default React.memo(ProfileBio);
