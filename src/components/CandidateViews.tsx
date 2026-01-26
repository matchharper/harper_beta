import { CandidateTypeWithConnection } from "@/hooks/useSearchCandidates";
import { QueryType } from "@/types/type";
import React, { useMemo } from "react";
import CandidateRow from "./CandidatesListTable";
import CandidateCard from "./CandidatesList";
import { useSettingStore } from "@/store/useSettingStore";
import { supabase } from "@/lib/supabase";
import { Tooltips } from "./ui/tooltip";
import { Columns2, Table } from "lucide-react";
const asArr = (v: any) => (Array.isArray(v) ? v : []);

const CandidateViews = ({
  items,
  userId,
  queryItem,
  criterias = [],
  isMyList = false,
}: {
  items: any[];
  userId: string;
  queryItem: any;
  criterias?: string[];
  isMyList?: boolean;
}) => {
  const { viewType, setViewType } = useSettingStore();

  const changeViewType = async (type: "table" | "card") => {
    setViewType(type);
    if (userId) {
      const res = await supabase
        .from("logs")
        .insert({ type: type, user_id: userId });
    }
  };

  const criteriaList = asArr(criterias ?? []);
  const gridTemplateColumns = useMemo(() => {
    // Candidate | Company | Location | School | (criteria * N) | Actions
    const fixed = [isMyList ? "400px" : "280px"];
    const defaultCols = isMyList ? "320px" : "240px";
    const criteriaCols = criteriaList.map(() => "140px"); // 한 criteria는 작은 칸
    const actions = ["0px"];

    if (criterias?.length === 0)
      return [...fixed, defaultCols, defaultCols, ...actions].join(" ");
    return [
      ...fixed,
      ...criteriaCols,
      defaultCols,
      defaultCols,
      ...actions,
    ].join(" ");
  }, [criteriaList]);

  return (
    <div className="w-full px-4 relative h-full">
      {items.length > 0 && (
        <div
          className={`${viewType === "table" ? "w-full " : "w-[980px]"
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
                className="inline-grid items-center py-2 text-xs text-hgray800 font-light bg-hgray200 border border-white/5 w-full"
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-30 px-4 bg-hgray200 border-r border-white/5">
                  프로필
                </div>

                {!isMyList && (
                  <>
                    {criteriaList.map((criteria: string, idx: number) => (
                      <Tooltips key={`header-crit-${idx}`} text={criteria}>
                        <div className="w-full px-2 text-left truncate border-r border-white/5">
                          {criteria}
                        </div>
                      </Tooltips>
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
        <div className="w-full space-y-2 mt-4">
          <div className="space-y-4">
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
