import { useMessages } from "@/i18n/useMessage";
import { dateToFormatLong } from "@/utils/textprocess";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Input as UiInput } from "@/components/ui/input";
import { BareButton } from "@/components/ui/button";

function normalizeTitle(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

const ScoutCard = ({
  item,
  setExpandedId,
  expandedId,
  onRequestAction,
  onRenameTitle,
  resultCount = 0,
  isActionLoading = false,
}: {
  item: any;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  expandedId: string | null;
  onRequestAction: (action: "pause" | "resume" | "delete", item: any) => void;
  onRenameTitle: (
    automationId: string,
    title: string
  ) => Promise<string | null>;
  resultCount?: number;
  isActionLoading?: boolean;
}) => {
  const { m } = useMessages();
  const updatedAt = item.last_updated_at || item.created_at;
  const statusLabel = item.is_in_progress
    ? m.scout.statusRunning
    : m.scout.statusStopped;
  const resultCountLabel = m.scout.resultCountLabel.replace(
    "{count}",
    String(resultCount ?? 0)
  );
  const isExpanded = expandedId === item.id;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [localTitle, setLocalTitle] = useState<string | null>(
    item.title ?? null
  );
  const [isTitleSaving, setIsTitleSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const isTitleSavingRef = useRef(false);
  const skipBlurSaveRef = useRef(false);

  const displayTitle = useMemo(
    () => normalizeTitle(localTitle ?? item.title, m.scout.itemFallbackTitle),
    [item.title, localTitle, m.scout.itemFallbackTitle]
  );

  useEffect(() => {
    setLocalTitle(item.title ?? null);
  }, [item.id, item.title]);

  useEffect(() => {
    if (!isEditingTitle) return;
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isEditingTitle]);

  const closeTitleEdit = (skipSave = false) => {
    if (skipSave) {
      skipBlurSaveRef.current = true;
    }
    setTitleInput(displayTitle);
    setIsEditingTitle(false);
  };

  const submitTitle = async () => {
    if (!item?.id || isTitleSavingRef.current) return;
    isTitleSavingRef.current = true;
    setIsTitleSaving(true);
    try {
      const savedTitle = await onRenameTitle(item.id, titleInput);
      if (!savedTitle) {
        setTitleInput(displayTitle);
        setIsEditingTitle(false);
        return;
      }
      setLocalTitle(savedTitle);
      setTitleInput(savedTitle);
      setIsEditingTitle(false);
    } finally {
      isTitleSavingRef.current = false;
      setIsTitleSaving(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() =>
        setExpandedId((prev) => (prev === item.id ? null : item.id))
      }
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setExpandedId((prev) => (prev === item.id ? null : item.id));
      }}
      className={`relative flex flex-col items-start justify-between gap-1 border border-white/10 rounded-xl bg-white/5 px-5 py-4 text-left transition hover:bg-white/10 ${isExpanded ? "border-accent-200" : ""}`}
    >
      <div className="w-full flex items-start justify-between">
        <div className="flex flex-col gap-2 text-white">
          <div className="text-base font-medium flex items-center gap-1 w-full">
            {isEditingTitle ? (
              <UiInput
                unstyled
                ref={titleInputRef}
                value={titleInput}
                maxLength={80}
                disabled={isTitleSaving}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={() => {
                  if (skipBlurSaveRef.current) {
                    skipBlurSaveRef.current = false;
                    return;
                  }
                  void submitTitle();
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitTitle();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeTitleEdit(true);
                  }
                }}
                className="h-7 w-full min-w-[300px] rounded-md border border-white/15 bg-white/5 px-2 text-base font-medium text-white outline-none focus:border-white/40"
              />
            ) : (
              <BareButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTitleInput(displayTitle);
                  setIsEditingTitle(true);
                }}
                className="text-base text-left font-medium text-white hover:text-accent-200 transition-colors"
              >
                {displayTitle}
              </BareButton>
            )}
            {/* <span className="text-white/70">#{item.id.slice(0, 6)}</span> */}
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
            {resultCountLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <BareButton
                type="button"
                aria-label="Scout actions"
                disabled={isActionLoading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={[
                  "h-7 w-7 rounded-md flex items-center justify-center",
                  "text-white/70 hover:text-white hover:bg-white/10",
                  "focus:outline-none focus:ring-2 focus:ring-white/40",
                  menuOpen ? "bg-white/10 text-white" : "",
                ].join(" ")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </BareButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 bg-neutral-800/80 backdrop-blur-md border-none text-white"
            >
              {item.is_in_progress ? (
                <DropdownMenuItem
                  disabled={isActionLoading}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestAction("pause", item);
                  }}
                >
                  진행 정지
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={isActionLoading}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestAction("resume", item);
                  }}
                >
                  진행 재개
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={isActionLoading}
                className="cursor-pointer text-red-400 focus:text-red-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestAction("delete", item);
                }}
              >
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="w-full flex flex-col gap-3">
        <div className="w-full flex flex-row items-end justify-between gap-1">
          <div className="flex flex-col gap-1">
            <div className="text-xs text-neutral-600 mt-4">
              {m.scout.createdAt} {dateToFormatLong(item.created_at)}
            </div>
            <div className="text-xs text-neutral-600">
              {m.scout.updatedAt} {dateToFormatLong(updatedAt)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={[
                "rounded-full text-[13px]",
                item.is_in_progress ? " text-accent-200" : " text-neutral-500",
              ].join(" ")}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="w-full">
          <BareButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/my/scout/${item.id}`);
            }}
            className="w-full rounded-md bg-accent-200 px-3 py-2 text-sm text-black transition hover:bg-accent-200/80"
          >
            {m.scout.edit}
          </BareButton>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ScoutCard);
