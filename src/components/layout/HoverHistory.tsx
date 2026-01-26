import React, { useState } from "react";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DropdownMenu } from "../ui/dropdown-menu";
import { History } from "lucide-react";
import { ChevronUp } from "lucide-react";
import { ChevronDown } from "lucide-react";
import QueryHistories from "./QueryHistories";

const HoverHistory = ({
  collapsed,
  userId,
  activeQueryId,
}: {
  collapsed: boolean;
  userId: string;
  activeQueryId: string;
}) => {
  const [hoverHistory, setHoverHistory] = useState(false);
  const [openHistory, setOpenHistory] = useState(true);

  return (
    <div className="flex-1 h-full">
      {collapsed && (
        <div
          onMouseEnter={() => setHoverHistory(true)}
          onMouseLeave={() => setHoverHistory(false)}
        >
          <DropdownMenu open={hoverHistory} onOpenChange={setHoverHistory}>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-between px-3 py-2 text-[12px] text-hgray900 cursor-pointer hover:bg-white/5 rounded-[6px]">
                <History size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 border-none text-white px-1 bg-white/0 mt-[-4px]"
              side="right"
              align="start"
              sideOffset={0}
            >
              <DropdownMenuGroup>
                <div className="w-full h-full bg-white/5 backdrop-blur-md p-2 rounded-md">
                  {/* 2. Nav & History: 이 영역이 스크롤됨 */}
                  <div
                    className="px-0 py-0 gap-1 flex-1 overflow-y-auto mt-0
                [scrollbar-width:none]
                [-ms-overflow-style:none]
                [&::-webkit-scrollbar]:hidden"
                  >
                    {userId && (
                      <QueryHistories
                        collapsed={false}
                        isHoverModal={true}
                        userId={userId}
                        activeQueryId={activeQueryId}
                      />
                    )}
                  </div>
                </div>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <>
        <div
          onClick={() => setOpenHistory((v) => !v)}
          className={`flex flex-row items-center justify-between px-2 py-1 text-[12px] text-hgray600 cursor-pointer ${
            collapsed ? "hidden" : "flex"
          }`}
        >
          <div>History</div>
          <div>
            {openHistory ? (
              <ChevronUp size={16} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={16} strokeWidth={1.5} />
            )}
          </div>
        </div>
        <div
          className="mt-1 px-2 pb-3 gap-1 flex-1 overflow-y-auto
    [scrollbar-width:none]
    [-ms-overflow-style:none]
    [&::-webkit-scrollbar]:hidden"
        >
          {openHistory && userId && (
            <QueryHistories
              collapsed={collapsed}
              userId={userId}
              isHoverModal={false}
              activeQueryId={activeQueryId}
            />
          )}
        </div>
      </>
    </div>
  );
};

export default React.memo(HoverHistory);
