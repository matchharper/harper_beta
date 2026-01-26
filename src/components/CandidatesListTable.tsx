import { CandidateTypeWithConnection } from "@/hooks/useSearchCandidates";
import React, { useMemo, useState } from "react";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  locationEnToKo,
  majorEnToKo,
} from "@/utils/language_map";
import Bookmarkbutton from "./ui/bookmarkbutton";
import { GraduationCap, BriefcaseBusiness } from "lucide-react";
import router from "next/router";
import { Avatar } from "./NameProfile";
import { Tooltips } from "./ui/tooltip";
import SummaryCell, { SynthItem } from "./information/SummaryCell";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

function parseSynthesizedSummary(text: string | null | undefined): SynthItem[] {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];

    // arr item이 "만족,이유..." 같은 string이라고 가정
    return arr.map((raw: any) => {
      const s = String(raw ?? "");
      const score = s.split(",")[0] ?? "";
      const reason = s.split(",").slice(1).join(",") ?? "";
      return { score, reason };
    });
  } catch {
    return [];
  }
}

function CandidateRow({
  c,
  userId,
  isMyList = false,
  criterias,
  gridTemplateColumns,
}: {
  c: CandidateTypeWithConnection;
  userId: string;
  isMyList?: boolean;
  criterias: string[];
  gridTemplateColumns: string;
}) {
  const candidId = c.id;

  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);

  const latestCompany = exps[0];
  const latestEdu = edus[0];

  const synthList = useMemo(() => {
    const rawText = c.synthesized_summary?.[0]?.text ?? "[]";
    return parseSynthesizedSummary(rawText);
  }, [c.synthesized_summary]);

  return (
    <div className="w-full">
      <div
        role="row"
        onClick={() => router.push(`/my/p/${candidId}`)}
        // onClick={() => router.push(`/my/p/${candidId}`)}
        className="group relative w-full border-b border-white/5 hover:bg-[#242424] transition-colors cursor-pointer"
      >
        <div
          className="inline-grid items-center"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-20 h-full px-4 py-3 flex items-center gap-3 min-w-0 bg-hgray200 border-r border-white/5 group-hover:bg-[#242424] transition-colors cursor-pointer">
            <div className="shrink-0 rounded-full border border-transparent hover:border-accenta1/80 transition-colors">
              <Avatar url={c.profile_picture} name={c.name} size="md" />
            </div>

            <div className="min-w-0">
              <div className="text-[14px] text-white font-normal truncate">
                {c.name}
              </div>
              <div className="text-xs text-hgray700 truncate">
                {c.location ? locationEnToKo(c.location) : "-"}
              </div>
            </div>
            <div
              className="px-2 absolute right-1 flex items-center justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={
                  isMyList || c.connection?.map((con: any) => con.typed).includes(0) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }
              >
                <Bookmarkbutton
                  userId={userId}
                  candidId={c.id}
                  connection={c.connection}
                  isText={false}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {criterias.map((criteria: string, idx: number) => (
            <div key={`${candidId}-critwrap-${idx}`} className="min-w-0">
              <SummaryCell
                key={`${candidId}-crit-${idx}`}
                criteria={criteria}
                item={synthList[idx]}
              />
            </div>
          ))}

          <Cell
            title={
              latestCompany?.company_db?.name
                ? companyEnToKo(latestCompany.company_db.name)
                : "-"
            }
            description={latestCompany?.role ?? "-"}
          />
          <Cell
            title={
              latestEdu?.school ? koreaUniversityEnToKo(latestEdu.school) : "-"
            }
            description={`${latestEdu?.field_of_study
              ? majorEnToKo(latestEdu.field_of_study)
              : ""
              }
                ${latestEdu?.field_of_study && latestEdu?.degree ? " • " : ""}
                ${latestEdu?.degree ? degreeEnToKo(latestEdu.degree) : ""}`}
          />
        </div>
      </div>
    </div>
  );
}

export default React.memo(CandidateRow);

const Cell = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <div className="min-w-0 cell1">
      <div className="flex items-center min-w-0  w-full">
        <div className="flex-1 min-w-0 text-[13px] text-hgray800 truncate">
          {title}
        </div>
      </div>
      <div className="text-[13px] text-hgray600 truncate mt-0.5 max-w-full">
        {description}
      </div>
    </div>
  );
};

export const RoleBox = ({
  company,
  role,
  startDate,
  endDate,
}: {
  company: string;
  role: string;
  startDate?: string;
  endDate?: string;
}) => {
  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips
        text={`${startDate ? startDate : ""} ${startDate ? " - " : ""} ${endDate && endDate
          } ${!endDate && startDate && "현재"}`}
      >
        <div className="flex flex-row items-start justify-between w-full pr-8">
          <div className="flex flex-row items-start justify-start gap-x-2 min-w-0 relative">
            <BriefcaseBusiness className="absolute left-0 top-[2px] w-4 h-4 text-hgray800" />
            <span className="text-hgray800 font-normal break-words">
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              {company && companyEnToKo(company)}
            </span>
          </div>
        </div>
      </Tooltips>
      <div className="text-hgray600 font-normal">{role}</div>
    </div>
  );
};

export const SchoolBox = ({
  school,
  role,
  field,
}: {
  school: string;
  role: string;
  field: string;
}) => {
  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips text="가장 최근 학력">
        <div className="flex flex-row items-start justify-start gap-x-2 min-w-0 relative">
          <GraduationCap className="absolute left-0 top-[2px] w-4 h-4 text-hgray800" />
          <span className="text-hgray800 font-normal break-words">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            {school && koreaUniversityEnToKo(school)}
          </span>
        </div>
      </Tooltips>
      <div className="flex flex-row items-start justify-start gap-x-1 min-w-0 relative">
        {field && (
          <div className="text-hgray600 font-normal">{majorEnToKo(field)}</div>
        )}
        {field && role && <div className="text-hgray600 font-normal">•</div>}
        {role && (
          <div className="text-hgray600 font-normal">{degreeEnToKo(role)}</div>
        )}
      </div>
    </div>
  );
};
