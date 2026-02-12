import { useMessages } from "@/i18n/useMessage";
import { dateToFormatLong } from "@/utils/textprocess";
import React, { useState } from "react";
import { useRouter } from "next/router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const ScoutCard = ({
  item,
  setExpandedId,
  expandedId,
  onRequestAction,
  resultCount = 0,
  isActionLoading = false,
}: {
  item: any;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  expandedId: string | null;
  onRequestAction: (action: "pause" | "resume" | "delete", item: any) => void;
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
      className={`relative flex flex-col gap-1 border border-white/10 rounded-xl bg-white/5 px-5 py-4 text-left transition hover:bg-white/10 ${isExpanded ? "border-accenta1" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2 text-white">
          <div className="text-base font-medium">
            {item.title ?? m.scout.itemFallbackTitle} #{item.id.slice(0, 6)}
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
            {resultCountLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
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
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 bg-bgDark400/80 backdrop-blur-md border-none text-white"
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
      <div className="flex flex-row items-end justify-between gap-1 mt-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-xgray800 mt-4">
            {m.scout.createdAt} {dateToFormatLong(item.created_at)}
          </div>
          <div className="text-xs text-xgray800">
            {m.scout.updatedAt} {dateToFormatLong(updatedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={[
              "rounded-full text-[13px]",
              item.is_in_progress ? " text-accenta1" : " text-hgray700",
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="mt-2 w-full">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/my/scout/${item.id}`);
          }}
          className="w-full rounded-md bg-accenta1 px-3 py-2 text-sm text-black transition hover:bg-accenta1/80"
        >
          {m.scout.edit}
        </button>
      </div>
    </div>
  );
};

export default React.memo(ScoutCard);
