import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import React, { useMemo } from "react";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  locationEnToKo,
} from "@/utils/language_map";
import { Avatar } from "./NameProfile";
import Bookmarkbutton from "./ui/bookmarkbutton";
import { Tooltips } from "./ui/tooltip";
import { Check, Dot, X } from "lucide-react";
import { useRouter } from "next/router";
import { RoleBox, SchoolBox } from "./CandidatesListTable";
import { SummaryScore } from "@/types/type";
import { useLogEvent } from "@/hooks/useLog";
import Link from "next/link";
import ShortlistMemoEditor from "./ui/ShortlistMemoEditor";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

function sanitizeSummaryReason(raw: string) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?strong>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function sanitizeSummaryText(raw: string | null | undefined) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseSynthesizedSummary(
  rawText: string | null | undefined
): { reason: string; score: string }[] {
  if (!rawText) return [];
  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      const text = String(item ?? "");
      return {
        reason: text,
        score: text.split(",")[0] ?? "",
      };
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

function CandidateCard({
  c,
  userId,
  criterias,
  isMyList = false,
  showShortlistMemo = false,
}: {
  c: CandidateTypeWithConnection;
  userId: string;
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  criterias: string[];
}) {
  const router = useRouter();
  const logEvent = useLogEvent();

  const candidId = c.id;
  const sourceRunId =
    typeof router.query.run === "string" ? router.query.run : "";
  const profileHref = sourceRunId
    ? `/my/p/${candidId}?run=${encodeURIComponent(sourceRunId)}`
    : `/my/p/${candidId}`;

  const synthesizedSummary = useMemo(
    () => parseSynthesizedSummary(c.synthesized_summary?.[0]?.text),
    [c.synthesized_summary]
  );
  const shortlistSummaryText = useMemo(() => {
    return sanitizeSummaryText(c.s?.[0]?.text ?? c.summary);
  }, [c.s, c.summary]);
  const shortlistMemo = useMemo(() => {
    return String(c.shortlist_memo ?? "");
  }, [c.shortlist_memo]);

  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);

  const latestCompany = exps[0];
  const school = useMemo(() => edus[0], [edus]);

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

  return (
    <Link
      href={profileHref}
      onClick={() => logEvent("candidate_card_click: " + candidId)}
      className="group relative w-full rounded-[28px] max-w-[980px] text-white bg-white/5 p-6 cursor-pointer hover:bg-[#FFFFFF18] transition-colors duration-200"
    >
      <div className="flex flex-row flex-1 items-start gap-4">
        <div className="w-[40%]">
          <div className="flex flex-row flex-1 items-start gap-4">
            <div className="cursor-pointer rounded-full hover:border-accenta1/80 border border-transparent transition-colors duration-100">
              <Avatar url={c.profile_picture} name={c.name} size="lg" />
            </div>

            <div className="flex flex-col items-start justify-between">
              <div className="flex flex-col gap-0">
                <div className="truncate font-medium text-lg hover:underline cursor-pointer relative">
                  {c.name ?? "None"}
                </div>
                {c.location && (
                  <div className="text-sm text-hgray600 font-normal">
                    {locationEnToKo(c.location)}
                  </div>
                )}
                {/* {c.links && c.links.length > 0 && (
                  <div className="mt-3">
                    <LinkChips links={c.links} size="sm" />
                  </div>
                )} */}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-0 flex flex-col gap-3 w-[60%]">
          {latestCompany && (
            <RoleBox
              company={latestCompany.company_db.name ?? ""}
              role={latestCompany.role}
              tooltipText={companyHistoryTooltipText}
              tooltipSide="bottom"
            />
          )}
          {school && (
            <SchoolBox
              school={school.school}
              role={school.degree}
              field={school.field}
              tooltipText={schoolHistoryTooltipText}
              tooltipSide="bottom"
            />
          )}
        </div>
      </div>

      {(synthesizedSummary.length !== 0 ||
        (isMyList && shortlistSummaryText.length > 0)) && (
        <div className="mt-8 text-hgray700 leading-relaxed font-light">
          {synthesizedSummary.length !== 0 && (
            <div>
              {synthesizedSummary?.map((item: any, index: number) => (
                <MemoizedSummaryBox
                  key={index}
                  reason={item.reason}
                  criteria={criterias[index] ?? ""}
                  score={item.score}
                />
              ))}
            </div>
          )}
          {isMyList && shortlistSummaryText.length > 0 && (
            <div
              className={`text-[14px] whitespace-pre-wrap break-words ${
                synthesizedSummary.length !== 0 ? "mt-6" : ""
              }`}
            >
              {shortlistSummaryText}
            </div>
          )}
        </div>
      )}
      {isMyList && showShortlistMemo && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <ShortlistMemoEditor
            userId={userId}
            candidId={c.id}
            initialMemo={shortlistMemo}
            rows={4}
          />
        </div>
      )}

      <div
        className={`flex flex-row items-center justify-start group-hover:opacity-100  absolute top-3 right-3 ${
          isMyList ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Bookmarkbutton
          userId={userId}
          candidId={c.id}
          connection={c.connection}
          isText={false}
          size="sm"
        />
        {/* <Requestbutton c={c} isBeta={true} /> */}
      </div>
    </Link>
  );
}
export default React.memo(CandidateCard);

const CriteriaBox = ({
  reason,
  criteria,
  score,
}: {
  reason: string;
  criteria: string;
  score: string;
}) => {
  const badeStyle = useMemo(() => {
    if (score === SummaryScore.SATISFIED) return "text-accenta1";
    if (score === SummaryScore.AMBIGUOUS) return "text-hgray900";
    if (score === SummaryScore.UNSATISFIED) return "text-hgray900";
    return "";
  }, [score]);

  const badgeIcon = useMemo(() => {
    if (score === SummaryScore.SATISFIED)
      return <Check className="w-3 h-3 text-accenta1" strokeWidth={2} />;
    if (score === SummaryScore.AMBIGUOUS)
      return <Dot className="w-3 h-3 text-hgray700" strokeWidth={2} />;
    if (score === SummaryScore.UNSATISFIED)
      return <X className="w-3 h-3 text-red-700" strokeWidth={2} />;
    return null;
  }, [score]);

  const tooltipText = useMemo(() => {
    if (score === SummaryScore.SATISFIED) return "Matches your criteria";
    if (score === SummaryScore.AMBIGUOUS)
      return "Not enough information to decide";
    if (score === SummaryScore.UNSATISFIED)
      return "Does not match this criterion";
    return "";
  }, [score]);

  const safeReasonText = useMemo(() => {
    return sanitizeSummaryReason(reason.split(",").slice(1).join(","));
  }, [reason]);

  return (
    <div className="mt-5">
      <Tooltips text={tooltipText}>
        <div
          className={`flex-row inline-flex items-center font-normal gap-1 py-1.5 px-2 rounded-md text-[12px] bg-white/5 cursor-default ${badeStyle}`}
        >
          {badgeIcon}
          <span>{criteria}</span>
        </div>
      </Tooltips>
      {/* </Tooltips> */}
      {reason && (
        <div className="mt-2 text-[14px] font-normal whitespace-pre-wrap break-words">
          {safeReasonText}
        </div>
      )}
    </div>
  );
};

const MemoizedSummaryBox = React.memo(CriteriaBox);
