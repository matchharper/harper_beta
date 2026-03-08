import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
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
import { useRouter } from "next/router";
import { Avatar } from "./NameProfile";
import { Tooltips } from "./ui/tooltip";
import SummaryCell, { SynthItem } from "./information/SummaryCell";
import { useLogEvent } from "@/hooks/useLog";
import { getSchoolLogo } from "@/utils/school_logo";
import Link from "next/link";
import ShortlistMemoEditor from "./ui/ShortlistMemoEditor";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

function sanitizeSummaryText(raw: string | null | undefined, name: string) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<name>/g, `${name}`)
    .replace(/<[^>]+>/g, "")
    .trim();
}

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

function formatYearMonth(dateStr?: string | null) {
  if (!dateStr) return "";
  if (dateStr === "Present") return "현재";

  const ymMatch = String(dateStr).match(/^(\d{4})-(\d{1,2})/);
  if (ymMatch) {
    return `${ymMatch[1]}.${ymMatch[2].padStart(2, "0")}`;
  }

  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  return String(dateStr)
    .replace(/년\s?/g, ".")
    .replace(/월/g, "")
    .replace(/\s+/g, "");
}

function formatPeriod(startDate?: string | null, endDate?: string | null) {
  const start = formatYearMonth(startDate) || "시작 미상";
  const end = endDate ? formatYearMonth(endDate) || endDate : "현재";
  return `${start} ~ ${end}`;
}

function CandidateRow({
  c,
  userId,
  isMyList = false,
  showShortlistMemo = false,
  criterias,
  orderedColumnIds,
  gridTemplateColumns,
  rowIndex,
}: {
  c: CandidateTypeWithConnection;
  userId: string;
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  criterias: string[];
  orderedColumnIds: string[];
  gridTemplateColumns: string;
  rowIndex: number;
}) {
  const router = useRouter();
  const candidId = c.id;
  const logEvent = useLogEvent();
  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);
  const sourceRunId =
    typeof router.query.run === "string" ? router.query.run : "";
  const profileHref = sourceRunId
    ? `/my/p/${candidId}?run=${encodeURIComponent(sourceRunId)}`
    : `/my/p/${candidId}`;

  const latestCompany = exps[0];
  const latestEdu = edus[0];

  const synthList = useMemo(() => {
    const rawText = c.synthesized_summary?.[0]?.text ?? "[]";
    return parseSynthesizedSummary(rawText);
  }, [c.synthesized_summary]);
  const shortlistSummaryText = useMemo(() => {
    return sanitizeSummaryText(c.s?.[0]?.text ?? c.summary, c.name ?? "");
  }, [c.s, c.summary, c.name]);
  const shortlistMemo = useMemo(() => {
    return String(c.shortlist_memo ?? "");
  }, [c.shortlist_memo]);
  const isBookmarked = useMemo(() => {
    return (c.connection ?? []).some((con) => con.typed === 0);
  }, [c.connection]);

  const companyLogo = useMemo(() => {
    if (latestCompany?.company_db?.logo?.includes("media.licdn.com")) {
      return "";
    }
    return latestCompany?.company_db?.logo;
  }, [latestCompany]);

  const schoolLogo = useMemo(() => {
    return getSchoolLogo(latestEdu?.url);
  }, [latestEdu]);

  const companyHistoryTooltipText = useMemo(() => {
    if (exps.length === 0) return "경력 정보 없음";
    return exps
      .map((exp: any) => {
        const companyName = companyEnToKo(exp?.company_db?.name ?? "-");
        return `${companyName} (${formatPeriod(exp?.start_date, exp?.end_date)})`;
      })
      .join("\n");
  }, [exps]);

  const schoolHistoryTooltipText = useMemo(() => {
    if (edus.length === 0) return "학력 정보 없음";
    return edus
      .map((edu: any) => {
        const schoolName = koreaUniversityEnToKo(edu?.school ?? "-");
        const degreeName = degreeEnToKo(edu?.degree ?? "-");
        return `${schoolName} - ${degreeName}\n${formatPeriod(
          edu?.start_date,
          edu?.end_date
        )}`;
      })
      .join("\n\n");
  }, [edus]);

  const renderColumnCell = (columnId: string) => {
    if (columnId.startsWith("criteria:")) {
      const idx = Number(columnId.split(":")[1]);
      const criteria = criterias[idx] ?? "";
      return (
        <div
          key={columnId}
          className="min-w-0 h-full flex items-center justify-center"
        >
          <SummaryCell criteria={criteria} item={synthList[idx]} />
        </div>
      );
    }

    if (columnId === "company") {
      return (
        <Tooltips text={companyHistoryTooltipText} side="bottom">
          <div>
            <Cell
              key={columnId}
              title={
                latestCompany?.company_db?.name ? (
                  <div className="flex flex-row items-center justify-start gap-x-2 min-w-0 relative">
                    {companyLogo && (
                      <img
                        src={companyLogo}
                        alt={latestCompany.company_db.name}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    )}
                    <span className="text-hgray800 font-normal break-words">
                      {companyEnToKo(latestCompany.company_db.name)}
                    </span>
                  </div>
                ) : (
                  "-"
                )
              }
              description={latestCompany?.role ?? "-"}
            />
          </div>
        </Tooltips>
      );
    }

    if (columnId === "school") {
      return (
        <Tooltips text={schoolHistoryTooltipText} side="bottom">
          <div>
            <Cell
              key={columnId}
              title={
                latestEdu?.school ? (
                  <div className="flex flex-row items-center justify-start gap-x-2 min-w-0 relative">
                    {schoolLogo && (
                      <img
                        src={schoolLogo}
                        alt={latestEdu.school}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    )}
                    <span className="text-hgray800 font-normal break-words">
                      {koreaUniversityEnToKo(latestEdu.school)}
                    </span>
                  </div>
                ) : (
                  "-"
                )
              }
              description={`${
                latestEdu?.field_of_study
                  ? majorEnToKo(latestEdu.field_of_study)
                  : ""
              }
                ${latestEdu?.field_of_study && latestEdu?.degree ? " • " : ""}
                ${latestEdu?.degree ? degreeEnToKo(latestEdu.degree) : ""}`}
            />
          </div>
        </Tooltips>
      );
    }

    if (columnId === "summary") {
      return (
        <div
          key={columnId}
          className="px-4 py-3 min-w-0 h-full flex items-center"
        >
          <div className="text-[13px] font-normal text-hgray900 leading-5 whitespace-pre-wrap break-words line-clamp-3">
            {shortlistSummaryText || "-"}
          </div>
        </div>
      );
    }

    if (columnId === "memo") {
      return (
        <div
          key={columnId}
          className="px-4 py-2 min-w-0 h-full flex items-center"
        >
          <ShortlistMemoEditor
            userId={userId}
            candidId={c.id}
            initialMemo={shortlistMemo}
            rows={2}
            className="w-full"
          />
        </div>
      );
    }

    if (columnId === "actions") {
      return <div key={columnId} className="px-2 py-3 min-w-0 h-full" />;
    }

    return null;
  };

  return (
    <div className="w-full">
      <Link
        href={profileHref}
        role="row"
        onClick={() => logEvent("candidate_card_click: " + candidId)}
      >
        <div className="group relative w-full border-b border-white/5 hover:bg-[#242424] transition-colors cursor-pointer pr-60">
          <div
            className="inline-grid items-center"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-30 h-full px-3 flex items-center justify-center text-xs text-hgray700 bg-hgray200 group-hover:bg-[#242424] transition-colors">
              {rowIndex + 1}
            </div>
            <div className="sticky left-14 z-20 h-full px-4 py-3 flex items-center gap-3 min-w-0 bg-hgray200 border-r border-white/5 group-hover:bg-[#242424] transition-colors cursor-pointer">
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <div
                  className={`${
                    isBookmarked && !isMyList ? "opacity-100" : "opacity-0"
                  } group-hover:opacity-100`}
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

            {orderedColumnIds.map((columnId) => renderColumnCell(columnId))}
          </div>
        </div>
      </Link>
    </div>
  );
}

export default React.memo(CandidateRow);

const Cell = ({
  title,
  description,
}: {
  title: string | React.ReactNode;
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
  tooltipText,
  tooltipSide = "bottom",
}: {
  company: string;
  role: string;
  startDate?: string;
  endDate?: string;
  tooltipText?: string;
  tooltipSide?: "bottom" | "top" | "left" | "right";
}) => {
  const defaultTooltipText = `${startDate ? startDate : ""} ${
    startDate ? " - " : ""
  } ${endDate && endDate} ${!endDate && startDate && "현재"}`.trim();

  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips text={tooltipText ?? defaultTooltipText} side={tooltipSide}>
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
  tooltipText,
  tooltipSide = "bottom",
}: {
  school: string;
  role: string;
  field: string;
  tooltipText?: string;
  tooltipSide?: "bottom" | "top" | "left" | "right";
}) => {
  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips text={tooltipText ?? "가장 최근 학력"} side={tooltipSide}>
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
