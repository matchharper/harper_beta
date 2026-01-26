import {
  CandidateTypeWithConnection,
  ExperienceUserType,
} from "@/hooks/useSearchCandidates";
import React, { useMemo } from "react";
import { companyEnToKo, locationEnToKo } from "@/utils/language_map";
import { useCompanyModalStore } from "@/store/useModalStore";
import { useQueryClient } from "@tanstack/react-query";
import NameProfile, { Avatar } from "./NameProfile";
import Bookmarkbutton from "./ui/bookmarkbutton";
import { dateToFormat } from "@/utils/textprocess";
import { Tooltips } from "./ui/tooltip";
import { Check, Dot, X } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import { useRouter } from "next/navigation";
import { RoleBox, SchoolBox } from "./CandidatesListTable";
import { SummaryScore } from "@/types/type";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

type ParsedSummary = { score: string; reason: string };

function parseSummaryText(
  summaryText: string | null | undefined
): ParsedSummary[] {
  if (!summaryText) return [];
  try {
    const temp = JSON.parse(summaryText);
    if (!Array.isArray(temp)) return [];
    return temp.map((item: any) => {
      // 기존: "만족,이유..." 형태의 string이라고 가정
      const str = String(item ?? "");
      const score = str.split(",")[0] ?? "";
      const reason = str.split(",").slice(1).join(",") ?? "";
      return { score, reason };
    });
  } catch {
    return [];
  }
}

function CandidateCard({
  c,
  userId,
  criterias,
  isMyList = false,
}: {
  c: CandidateTypeWithConnection;
  userId: string;
  isMyList?: boolean;
  criterias: string[];
}) {
  const router = useRouter();
  const { m } = useMessages();

  const candidId = c.id;
  const synthesizedSummary =
    JSON.parse(c.synthesized_summary?.[0]?.text ?? "[]").map((item: any) => {
      return {
        reason: item,
        score: item.split(",")[0] ?? "",
      };
    }) ?? null;

  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);

  const latestCompany = exps[0];
  const school = useMemo(() => edus[0], [edus]);

  const startDate = useMemo(
    () => (latestCompany ? dateToFormat(latestCompany.start_date ?? "") : ""),
    [latestCompany]
  );
  const endDate = useMemo(
    () => (latestCompany ? dateToFormat(latestCompany.end_date ?? "") : ""),
    [latestCompany]
  );

  return (
    <div
      key={c.id}
      onClick={() => {
        router.push(`/my/p/${candidId}`);
      }}
      className="group relative w-full rounded-[28px] max-w-[980px] text-white bg-white/5 p-6 cursor-pointer hover:bg-[#FFFFFF0a]"
    >
      <div className="flex flex-row flex-1 items-start gap-4">
        <div className="w-[40%]">
          <div className="flex flex-row flex-1 items-start gap-4">
            <div
              onClick={() => router.push(`/my/p/${candidId}`)}
              className="cursor-pointer rounded-full hover:border-accenta1/80 border border-transparent transition-colors duration-100"
            >
              <Avatar url={c.profile_picture} name={c.name} size="lg" />
            </div>

            <div className="flex flex-col items-start justify-between">
              <div className="flex flex-col gap-0">
                <div
                  className="truncate font-medium text-lg hover:underline cursor-pointer relative"
                  onClick={() => router.push(`/my/p/${candidId}`)}
                >
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
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {school && (
            <SchoolBox
              school={school.school}
              role={school.degree}
              field={school.field}
            />
          )}
          {/* {latestCompany && (
            <CompanyCard
              company={latestCompany}
              text={m.data.currentExperience}
            />
          )} */}
          {/* {firstCompany && (
            <CompanyCard
              company={firstCompany}
              text={isOnlyOneCompany ? "Single Experience" : "First Career"}
            />
          )} */}
          {/* {school && (
            <div className="flex flex-row items-start justify-start font-normal pt-3 border-t border-white/5">
              <div className="text-hgray600 text-sm w-24 pt-0.5 font-normal">
                {m.data.education}
              </div>
              <div className="flex flex-col gap-0.5 text-sm w-full">
                <div className="flex flex-row items-center justify-between">
                  <div className="text-white">
                    {koreaUniversityEnToKo(school.school)}
                    {school.degree && (
                      <span className="text-hgray600 font-light">
                        {" "}
                        &nbsp; {degreeEnToKo(school.degree)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )} */}
        </div>
      </div>

      <div className="mt-8 text-hgray700 leading-relaxed font-light">
        {synthesizedSummary && synthesizedSummary.length !== 0 && (
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
      </div>

      <div
        className={`flex flex-row items-center justify-start group-hover:opacity-100  absolute top-3 right-3 ${
          isMyList ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
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
    </div>
  );
}
export default React.memo(CandidateCard);

const CompanyCard = ({
  company,
  text,
}: {
  company: ExperienceUserType;
  text: string;
}) => {
  const startDate = useMemo(
    () => dateToFormat(company.start_date ?? ""),
    [company.start_date]
  );
  const endDate = useMemo(
    () => dateToFormat(company.end_date ?? ""),
    [company.end_date]
  );

  //
  const handleOpenCompany = useCompanyModalStore((s) => s.handleOpenCompany);
  const qc = useQueryClient();

  const onButtonClick = () => {
    handleOpenCompany({
      companyId: company.company_id ?? "",
      queryClient: qc,
    });
  };

  return (
    <div className="flex flex-row items-start justify-start font-normal">
      <div className="text-hgray600 text-sm w-24 pt-0.5 font-normal">
        {text}
      </div>
      <div className="flex flex-col gap-1 text-sm w-full">
        <div className="flex flex-row items-center justify-between">
          <div
            className="text-white font-normal text-[15px] hover:underline cursor-pointer"
            onClick={onButtonClick}
          >
            {companyEnToKo(company.company_db.name)}
          </div>
          <div className="text-xgray800 text-[13px] font-light">
            {startDate} -{" "}
            {endDate ? endDate : <span className="text-accenta1">현재</span>}
          </div>
        </div>
        <div className="flex flex-row items-center justify-between text-hgray600 font-light">
          <div>{company.role}</div>
        </div>
      </div>
    </div>
  );
};

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
        <div
          className="mt-2 text-[14px] font-normal"
          dangerouslySetInnerHTML={{
            __html: reason
              .split(",")
              .slice(1)
              .join(",")
              .replace(/strong>/g, 'span class="text-white font-normal">'),
          }}
        />
      )}
    </div>
  );
};

const MemoizedSummaryBox = React.memo(CriteriaBox);
