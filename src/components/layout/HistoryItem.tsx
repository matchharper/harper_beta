import { dateToFormatLong } from "@/utils/textprocess";
import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Command, MoreHorizontal } from "lucide-react";
import { QueryType } from "@/types/type";
import { useRouter } from "next/router";
import { Tooltips } from "../ui/tooltip";

const HistoryItem = ({
  queryItem,
  onDelete,
  collapsed,
  isActive,
}: {
  queryItem: QueryType;
  onDelete: (queryId: string) => void;
  collapsed: boolean;
  isActive: boolean;
}) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={[
        "group relative flex flex-row items-center justify-between px-2.5 min-h-10 py-1.5 text-white font-normal cursor-pointer rounded-lg gap-1 hover:bg-white/5",
        isActive ? "bg-white/10" : "",
      ].join(" ")}
      key={queryItem.query_id}
      onClick={() => router.push(`/my/c/${queryItem.query_id}`)}
    >
      <div
        className={`flex flex-col items-start w-full font-normal ${
          collapsed ? "max-w-full" : "max-w-[85%]"
        }`}
      >
        <div className="truncate text-[13px] w-full">
          {queryItem.query_keyword !== ""
            ? queryItem.query_keyword
            : queryItem.raw_input_text}
        </div>
        {!collapsed && (
          <div className="text-[12px] text-hgray600">
            {dateToFormatLong(
              new Date(queryItem.created_at).toLocaleDateString()
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={[
                "rounded-sm h-7 w-7 flex items-center justify-center",
                "hover:bg-bgDark500 focus:outline-white/5 focus:ring-white/10",
                "transition-opacity",
                menuOpen
                  ? "opacity-100 ring-2 ring-white/60"
                  : "opacity-0 group-hover:opacity-100 ring-0",
              ].join(" ")}
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-40 bg-bgDark400/80 backdrop-blur-md border-none"
            align="start"
          >
            {/* <DropdownMenuGroup>
          <DropdownMenuItem>
          Profile
          <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem> */}
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="text-red-500 cursor-pointer p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(queryItem.query_id);
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default React.memo(HistoryItem);

export function NavItem({
  collapsed,
  active = false,
  label,
  icon,
  onClick,
  shortcut,
}: {
  collapsed: boolean;
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <Tooltips text={collapsed ? label : ""} side="right">
      <button
        type="button"
        onClick={onClick}
        className={[
          "w-full flex text-sm font-extralight items-center justify-between gap-2 rounded-[6px] h-10 text-white",
          shortcut ? "bg-gray-300/5 border border-white/5" : "",
          active
            ? "bg-bgDark500  shadow-sm"
            : "bg-transparent hover:bg-white/10",
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
          <div className="flex flex-row items-center gap-0.5 text-xs text-white/50">
            <Command size={10} /> + K
          </div>
        )}
      </button>
    </Tooltips>
  );
}
