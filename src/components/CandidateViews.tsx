import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import React, { useMemo, useState } from "react";
import CandidateRow from "./CandidatesListTable";
import CandidateCard from "./CandidatesList";
import { useSettingStore } from "@/store/useSettingStore";
import { supabase } from "@/lib/supabase";
import { Tooltips } from "./ui/tooltip";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsLeftRight, Columns2, Table } from "lucide-react";
import { useLogEvent } from "@/hooks/useLog";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

const CandidateViews = ({
  items,
  userId,
  criterias = [],
  isMyList = false,
}: {
  items: any[];
  userId: string;
  criterias: string[];
  isMyList?: boolean;
}) => {
  const { viewType, setViewType } = useSettingStore();
  const [isFolded, setIsFolded] = useState(false);
  const logEvent = useLogEvent();

  const toggleFold = () => {
    setIsFolded(!isFolded);
  };

  const changeViewType = async (type: "table" | "card") => {
    setViewType(type);
    if (userId)
      await logEvent(type);

  };

  const criteriaList = useMemo(() => asArr(criterias), [criterias]);
  const gridTemplateColumns = useMemo(() => {
    // Candidate | Company | Location | School | (criteria * N) | Actions
    const fixed = [isMyList ? "460px" : "280px"];
    const defaultCols = isMyList ? "320px" : "240px";
    const criteriaCols = criteriaList.map(() => isFolded ? "60px" : "140px"); // 한 criteria는 작은 칸
    const actions = ["80px"];

    if (criterias.length === 0)
      return [...fixed, defaultCols, defaultCols, ...actions].join(" ");
    return [
      ...fixed,
      ...criteriaCols,
      defaultCols,
      defaultCols,
      ...actions,
    ].join(" ");
  }, [criteriaList, isFolded]);

  return (
    <div className="w-full relative h-full">
      {items.length > 0 && (
        <div
          className={`${viewType === "table" ? "w-full " : "w-full"
            } flex flex-row items-center justify-between mt-2`}
        >
          <div></div>
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltips text="Table view">
              <button
                className={`cursor-pointer p-1.5 rounded-sm hover:bg-white/10 transition-all duration-200 ${viewType === "table" ? "bg-white/10" : ""
                  }`}
                onClick={() => changeViewType("table")}
              >
                <Table className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </Tooltips>
            <Tooltips text="Card view">
              <button
                className={`cursor-pointer p-1.5 rounded-sm hover:bg-white/10 transition-all duration-200 ${viewType === "card" ? "bg-white/10" : ""
                  }`}
                onClick={() => changeViewType("card")}
              >
                <Columns2 className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </Tooltips>
          </div>
        </div>
      )}
      {viewType === "table" && items.length > 0 && (
        <div className="w-full mt-4 h-full flex">
          <div
            className="w-full overflow-x-auto pb-52
            [scrollbar-width:none]
            [-ms-overflow-style:none]
            [&::-webkit-scrollbar]:hidden"
          >
            <div className="w-max min-w-full">
              <div
                className="inline-grid items-center py-2 text-xs text-hgray800 font-light bg-hgray200 border border-white/5 w-full relative"
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-30 px-4 bg-hgray200 border-r border-white/5">
                  프로필
                </div>

                {!isMyList && (
                  <>
                    {criteriaList.map((criteria: string, idx: number) => (
                      <div className="relative" key={`header-crit-${idx}`}>
                        <Tooltips key={`header-crit-${idx}`} text={criteria}>
                          <div className="w-full px-2 text-left truncate border-r border-white/5">
                            {criteria}
                          </div>
                        </Tooltips>
                        {
                          idx === criteriaList.length - 1 && (
                            <div onClick={toggleFold} className="absolute top-[-8px] right-0 bg-hgray300 p-0.5 rounded-bl-lg cursor-pointer h-4 w-4 hover:bg-hgray400 transition-colors duration-200">
                              {
                                isFolded ?
                                  <ChevronRight className="w-3 h-3 absolute top-[1px] right-[1px]" /> :
                                  <ChevronLeft className="w-3 h-3 absolute top-[1px] right-[1px]" />
                              }
                            </div>)
                        }
                      </div>
                    ))}
                  </>
                )}
                <div className="px-4">Company</div>
                <div className="px-4">School</div>
                <div />
              </div>

              {/* Rows */}
              <div className="border-x border-white/5">
                {items.map((c: any) => (
                  <CandidateRow
                    isMyList={isMyList}
                    key={c?.id}
                    c={c as CandidateTypeWithConnection}
                    userId={userId}
                    criterias={criterias}
                    gridTemplateColumns={gridTemplateColumns}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {viewType === "card" && items.length > 0 && (
        <div className="w-full flex flex-col space-y-2 mt-4 items-center justify-center">
          <div className="space-y-4 w-full items-center justify-center flex flex-col">
            {items.map((c: any) => (
              <CandidateCard
                isMyList={isMyList}
                key={c?.id}
                c={c as CandidateTypeWithConnection}
                userId={userId}
                criterias={criterias}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CandidateViews);
