import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { CandidateDetail, candidateKey } from "@/hooks/useCandidateDetail";
import ShareProfileModal from "@/components/Modal/ShareProfileModal";
import { Check, Share2, Upload, XIcon } from "lucide-react";
import Bookmarkbutton from "@/components/ui/bookmarkbutton";
import ItemBox from "./components/ItemBox";
import PublicationBox from "./components/PublicationBox";
import React, { useEffect, useMemo, useState } from "react";
import { useMessages } from "@/i18n/useMessage";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  majorEnToKo,
} from "@/utils/language_map";
import { useQueryClient } from "@tanstack/react-query";
import MainProfile from "./components/MainProfile";
import ProfileBio from "./components/ProfileBio";
import { useLogEvent } from "@/hooks/useLog";
import { logger } from "@/utils/logger";
import { Loading } from "@/components/ui/loading";
import FeedbackBanner from "./components/FeedbackBanner";

export const ExperienceCal = (months: number) => {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years > 0 ? `${years}년 ` : ""}${remainingMonths}${
    remainingMonths > 1 ? "개월" : "개월"
  }`;
};

function CandidateProfileDetailPage({
  candidId,
  data,
  isLoading,
  error,
}: {
  candidId: string;
  data: CandidateDetail;
  isLoading: boolean;
  error: Error | null;
}) {
  const [requested, setRequested] = useState(false);
  const [isLoadingOneline, setIsLoadingOneline] = useState(false);
  const [oneline, setOneline] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const logEvent = useLogEvent();
  const { m } = useMessages();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const qc = useQueryClient();

  const c: any = data;
  const showAutomationFeedback =
    data?.isAutomationResult && companyUser.is_custom;

  const links: string[] = useMemo(() => {
    if (!c?.links) return [];

    const newLinks: string[] = [];
    if (Array.isArray(c.links)) {
      for (const link of c.links) {
        const ll = link.replace(/\/+$/, "");
        if (ll && ll !== "" && !newLinks.includes(ll)) {
          newLinks.push(ll);
        }
      }
      return newLinks;
    }
    return [];
  }, [c]);

  const mergedExperience = useMemo(() => {
    if (!c) return [];
    const expItems = (c.experience_user ?? []).map((e: any) => ({
      kind: "exp" as const,
      item: e,
    }));
    const eduItems = (c.edu_user ?? []).map((ed: any, index: number) => ({
      kind: "edu" as const,
      index,
      item: ed,
    }));

    const parseStartDate = (value: string | null | undefined) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const datedItems = [
      ...expItems,
      ...eduItems.filter((ed: any) => !!parseStartDate(ed.item?.start_date)),
    ];

    datedItems.sort((a, b) => {
      const aDate = parseStartDate(a.item?.start_date);
      const bDate = parseStartDate(b.item?.start_date);
      if (aDate && bDate) {
        return bDate.getTime() - aDate.getTime();
      }
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return 0;
    });

    const undatedEdu = eduItems.filter(
      (ed: any) => !parseStartDate(ed.item?.start_date)
    );
    if (undatedEdu.length === 0) return datedItems;

    const merged = [...datedItems];

    undatedEdu.forEach((edu: any) => {
      const nextDatedEdu = eduItems
        .slice(edu.index + 1)
        .find((next: any) => !!parseStartDate(next.item?.start_date));

      if (!nextDatedEdu) {
        merged.push(edu);
        return;
      }

      const insertAt = merged.findIndex(
        (entry) => entry.kind === "edu" && entry.item === nextDatedEdu.item
      );

      if (insertAt === -1) {
        merged.push(edu);
      } else {
        merged.splice(insertAt, 0, edu);
      }
    });

    return merged;
  }, [c]);

  const generateOneLineSummary = async () => {
    setIsLoadingOneline(true);
    const res = await fetch("/api/search/criteria_summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: c,
        is_one_line: true,
      }),
    });

    const data = await res.json();
    setOneline(data.result);
    // ✅ 서버에서 DB 업데이트 끝났으면 캐시 무효화 → 최신 재조회
    await qc.invalidateQueries({
      queryKey: candidateKey(candidId, userId), // 너 useCandidateDetail의 키랑 반드시 동일해야 함
    });
    setIsLoadingOneline(false);
  };

  useEffect(() => {
    if (isLoading) return;
    if (!c || !userId || !candidId) return;

    const hasSummary = Array.isArray(c.s) && c.s.length > 0;
    if (hasSummary) return;

    // ✅ 같은 세션에서 중복 요청 방지
    if (requested) return;

    setRequested(true);
    generateOneLineSummary().finally(() => {
      // 실패 시 재시도 허용하고 싶으면 false로 돌려도 됨
      // setRequested(false);
    });
  }, [isLoading, c, userId, candidId, requested]);

  if (!candidId || !userId || isLoading || error || !data)
    return <Loading className="text-xgray800" />;

  // 대충: email은 string일 수도 / JSON string일 수도 있어서 try-catch 한 번만
  let emails: string[] = [];
  try {
    emails = Array.isArray(c.email) ? c.email : JSON.parse(c.email || "[]");
  } catch {
    emails = c.email ? [String(c.email)] : [];
  }

  return (
    <div className="w-full mx-auto overflow-y-auto h-screen relative">
      {showAutomationFeedback && (
        <FeedbackBanner
          name={c.name}
          connection={c.connection}
          candidId={candidId}
          userId={userId}
          qc={qc}
        />
      )}
      <div className="relative w-[95%] max-w-[1080px] mx-auto px-4 py-10 space-y-10">
        <div className="flex flex-row items-start justify-between w-full">
          <MainProfile
            profile_picture={c.profile_picture}
            name={c.name}
            headline={c.headline}
            location={c.location}
            links={links}
          />
          <div className="absolute top-2 right-2 font-normal flex flex-col gap-1 ">
            <div className="flex flex-row items-end justify-end gap-2">
              <button
                onClick={() => {
                  logEvent("open share: " + candidId);
                  setIsShareOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-hgray900/5"
              >
                <Upload className="w-4 h-4" />
              </button>
              <Bookmarkbutton
                userId={userId}
                candidId={c.id}
                connection={c.connection}
              />
            </div>
          </div>

          <ShareProfileModal
            open={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            candidId={candidId}
          />
        </div>

        <ProfileBio
          summary={c.s ?? []}
          bio={c.bio ?? ""}
          name={c.name ?? ""}
          oneline={oneline ?? ""}
          isLoadingOneline={isLoadingOneline ?? false}
          links={links}
        />

        {/* Experiences */}
        <Box title={`${m.data.experience}`}>
          <div className="space-y-0">
            {mergedExperience.map((entry, idx) => {
              if (entry.kind === "exp") {
                const e = entry.item;
                return (
                  <ItemBox
                    key={`exp-${idx}`}
                    isContinued={
                      idx > 0 &&
                      mergedExperience[idx - 1]?.kind === "exp" &&
                      mergedExperience[idx - 1]?.item?.company_db?.name ===
                        e.company_db?.name
                    }
                    title={e.role}
                    company_id={e.company_id}
                    name={companyEnToKo(e.company_db.name)}
                    start_date={e.start_date}
                    end_date={e.end_date}
                    link={e.company_db.linkedin_url}
                    description={e.description}
                    logo_url={e.company_db.logo}
                    months={e.months}
                    isLast={idx === mergedExperience.length - 1}
                  />
                );
              }

              const ed = entry.item;
              return (
                <ItemBox
                  key={`edu-${idx}`}
                  title={`${koreaUniversityEnToKo(ed.school)}`}
                  name={
                    ed.field
                      ? `${majorEnToKo(ed.field)}, ${degreeEnToKo(ed.degree)}`
                      : ed.degree
                  }
                  start_date={ed.start_date}
                  end_date={ed.end_date}
                  link={ed.url}
                  description={""}
                  typed="edu"
                  isLast={idx === mergedExperience.length - 1}
                />
              );
            })}
          </div>
        </Box>

        {/* Awards */}
        {(c.extra_experience ?? []).length > 0 && (
          <Box title={`수상 기록`}>
            <div className="space-y-0">
              {(c.extra_experience ?? []).map((extra: any, idx: number) => (
                <ItemBox
                  key={idx}
                  title={`${extra.title}`}
                  name={extra.issued_by}
                  start_date={extra.issued_at}
                  end_date={""}
                  link={""}
                  description={extra.description}
                  typed="award"
                  isLast={
                    idx === (c.extra_experience ?? []).length - 1 ? true : false
                  }
                />
              ))}
            </div>
          </Box>
        )}

        {/* Publications */}
        {c.publications && c.publications.length > 0 && (
          <Box title={`${m.data.publications} (${c.publications.length})`}>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              {(c.publications ?? []).map((p: any, idx: number) => (
                <PublicationBox
                  key={idx}
                  title={p.title}
                  published_at={p.published_at}
                  link={p.link}
                  citation_num={p.citation_num ?? -1}
                />
              ))}
            </div>
          </Box>
        )}
      </div>
    </div>
  );
}

export default React.memo(CandidateProfileDetailPage);

export const Box = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className="rounded-xl shadow-sm w-full grid grid-cols-7">
      <div className="col-span-1">
        <div className="flex items-center gap-2 text-base font-normal text-hgray1000">
          {icon}
          {title}
        </div>
      </div>
      <div className="col-span-6">{children}</div>
    </div>
  );
};
