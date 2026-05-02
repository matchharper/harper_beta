import { dateToFormatLong } from "@/utils/textprocess";
import React, { useState } from "react";
import { Command, MoreHorizontal, Pin, Trash2 } from "lucide-react";
import { Tooltips } from "../ui/tooltip";
import Link from "next/link";
import { QueryHistoryItem } from "@/hooks/useSearchHistory";
import { ActionDropdown, ActionDropdownItem } from "../ui/action-dropdown";

const HistoryItem = ({
  queryItem,
  onDelete,
  collapsed,
  isActive,
}: {
  queryItem: QueryHistoryItem;
  onDelete: (queryId: string) => void;
  collapsed: boolean;
  isActive: boolean;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isLiked = (queryItem.runs ?? []).some(
    (run) =>
      Number(run.feedback ?? 0) === 1 &&
      String(run.status ?? "").toLowerCase() !== "stopped"
  );

  return (
    <Link
      href={`/my/c/${queryItem.query_id}`}
      className={[
        "group relative flex flex-row items-center justify-between px-2.5 min-h-10 py-1.5 text-beige900 font-normal cursor-pointer rounded-lg gap-1 hover:bg-beige900/8",
        isActive ? "bg-beige500/55" : "",
      ].join(" ")}
      key={queryItem.query_id}
    >
      <div
        className={`flex flex-col items-start w-full font-normal ${
          collapsed ? "max-w-full" : "max-w-[86%]"
        }`}
      >
        <div className="flex w-full items-center gap-1.5">
          <div className="truncate text-[13px] flex-1">
            {queryItem.query_keyword !== ""
              ? queryItem.query_keyword
              : queryItem.raw_input_text}
          </div>
          {collapsed && isLiked ? (
            <Pin
              className="h-3 w-3 shrink-0 text-accenta1"
              fill="currentColor"
              strokeWidth={1.8}
            />
          ) : null}
        </div>
        {!collapsed && (
          <div className="flex flex-row w-full items-center justify-start gap-1 text-xs text-beige900/45">
            <span>
              {dateToFormatLong(
                new Date(queryItem.created_at).toLocaleDateString()
              )}
            </span>
            {isLiked ? (
              <Pin
                className="h-2.5 w-2.5 shrink-0 text-accenta1"
                fill="currentColor"
                strokeWidth={1.8}
              />
            ) : null}
          </div>
        )}
      </div>
      <ActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="start"
        contentClassName="w-40"
        trigger={
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={[
              "rounded-sm h-7 w-7 flex items-center justify-center",
              "hover:bg-beige900/8 focus:outline-beige900/10 focus:ring-beige900/10",
              "transition-opacity",
              menuOpen
                ? "opacity-100 ring-2 ring-beige900/30"
                : "opacity-0 group-hover:opacity-100 ring-0",
              collapsed
                ? "absolute right-1.5 top-1/2 -translate-y-1/2"
                : "opacity-0",
            ].join(" ")}
          >
            <MoreHorizontal size={16} />
          </button>
        }
      >
        <ActionDropdownItem
          tone="danger"
          className="p-2"
          onSelect={() => {
            onDelete(queryItem.query_id);
          }}
        >
          <Trash2 size={14} />
          <span>삭제</span>
        </ActionDropdownItem>
      </ActionDropdown>
    </Link>
  );
};

export default React.memo(HistoryItem);

export function NavItem({
  collapsed,
  active = false,
  label,
  icon,
  href,
  onNavigate,
  shortcut,
}: {
  collapsed: boolean;
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  href: string;
  onNavigate?: () => void;
  shortcut?: string;
}) {
  return (
    <Tooltips text={collapsed ? label : ""} side="right">
      <Link
        href={href}
        onClick={onNavigate}
        className={[
          "w-full flex text-sm font-extralight items-center justify-between gap-2 rounded-[6px] h-10 text-beige900",
          shortcut ? "bg-beige900/5 border border-beige900/8" : "",
          active
            ? "bg-beige500/55 shadow-sm"
            : "bg-transparent hover:bg-beige900/8",
          collapsed ? "px-3" : "px-2.5",
        ].join(" ")}
      >
        <div className="flex flex-row items-center gap-2">
          <div className="shrink-0">{icon}</div>
          {!collapsed && (
            <div className="truncate text-sm font-normal">{label}</div>
          )}
        </div>
        {!collapsed && shortcut && (
          <div className="flex flex-row items-center gap-0.5 text-xs text-beige900/45">
            <Command size={10} /> + K
          </div>
        )}
      </Link>
    </Tooltips>
  );
}
