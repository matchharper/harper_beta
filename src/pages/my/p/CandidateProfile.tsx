import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  CandidateDetail,
  candidateKey,
} from "@/hooks/useCandidateDetail";
import ShareProfileModal from "@/components/Modal/ShareProfileModal";
import { Check, Share2, Upload, XIcon } from "lucide-react";
import Bookmarkbutton from "@/components/ui/bookmarkbutton";
import ItemBox from "./components/ItemBox";
import PublicationBox from "./components/PublicationBox";
import { replaceName } from "@/utils/textprocess";
import { useEffect, useMemo, useState } from "react";
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
import SimpleAreaModal from "@/components/Modal/SimpleAreaModal";
import { logger } from "@/utils/logger";
import { Loading } from "@/components/ui/loading";

export const ExperienceCal = (months: number) => {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years > 0 ? `${years}년 ` : ""}${remainingMonths}${remainingMonths > 1 ? "개월" : "개월"
    }`;
};

export default function CandidateProfileDetailPage({
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
  const [isLikeOpen, setIsLikeOpen] = useState(false);
  const [isPassOpen, setIsPassOpen] = useState(false);

  const logEvent = useLogEvent();
  const { m } = useMessages();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const qc = useQueryClient();

  const c: any = data;
  const isLiked = c && c.connection?.some((connection: any) => connection.typed === 4);
  const isPassed = c && c.connection?.some((connection: any) => connection.typed === 5);
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
      <div className="w-[95%] max-w-[1080px] mx-auto px-4 py-10 space-y-12">
        <div className="flex flex-row items-start justify-between w-full">
          <MainProfile profile_picture={c.profile_picture} name={c.name} headline={c.headline} location={c.location} total_exp_months={c.total_exp_months} />
          <div className="absolute top-2 right-2 font-normal flex flex-col gap-1 ">
            <div className="flex flex-row items-end justify-end gap-2">
              <button
                onClick={() => {
                  logEvent("open share: " + candidId);
                  setIsShareOpen(true)
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
            {
              showAutomationFeedback && (
                <div className="flex flex-row items-end justify-end gap-2 mt-1">
                  <button
                    onClick={() => {
                      setIsLikeOpen(true)
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl px-2 py-2 pr-3 text-sm hover:bg-opacity-90 ${isLiked ? "bg-green-500/10" : ""}`}
                  >
                    <Check className="w-4 h-4 text-green-500" />{isLiked ? "등록됨" : "관심있어요"}
                  </button>
                  <button
                    onClick={() => {
                      setIsPassOpen(true)
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl px-2 py-2 pr-3 text-sm hover:bg-opacity-90 ${isPassed ? "bg-red-500/10" : ""}`}
                  >
                    <XIcon
                      className="w-4 h-4 text-red-500"
                    />
                    {isPassed ? "등록됨" : "아쉬워요"}
                  </button>
                  <SimpleAreaModal
                    open={isLikeOpen}
                    candidId={candidId}
                    name={c.name}
                    onClose={() => setIsLikeOpen(false)}
                    title={isLiked ? "선호 후보자로 등록되어 있습니다." : "선호 후보자로 등록합니다."}
                    placeholder="여기에 선호 이유 혹은 원하는 다음 과정을 짧게 적어주세요. (ex. 커피챗 잡고 싶습니다.)"
                    // placeholder="여기에 키워드나 이유를 짧게 적어주세요. 더 완벽한 분을 찾아오겠습니다!"
                    onConfirm={async () => {
                      await qc.invalidateQueries({
                        queryKey: candidateKey(candidId, userId), // 너 useCandidateDetail의 키랑 반드시 동일해야 함
                      });
                      setIsLikeOpen(false);
                    }}
                    isLike={true}
                  />
                  <SimpleAreaModal
                    open={isPassOpen}
                    candidId={candidId}
                    name={c.name}
                    onClose={() => setIsPassOpen(false)}
                    title="추천 결과가 아쉬우셨나요?"
                    placeholder="예: 기술 스택 불일치, 연차가 너무 높음... (빈칸으로 제출하실 수 있습니다.)"
                    onConfirm={async () => {
                      await qc.invalidateQueries({
                        queryKey: candidateKey(candidId, userId), // 너 useCandidateDetail의 키랑 반드시 동일해야 함
                      });
                      setIsPassOpen(false);
                    }}
                    isLike={false}
                  />
                </div>
              )
            }
          </div>

          <ShareProfileModal
            open={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            candidId={candidId}
          />
        </div>

        <ProfileBio summary={c.s ?? []} bio={c.bio ?? ""} name={c.name ?? ""} oneline={oneline ?? ""} isLoadingOneline={isLoadingOneline ?? false} links={links} />

        {/* <ExperienceTimeline experiences={c.experience_user ?? []} /> */}

        {/* Experiences */}
        <Box title={`${m.data.experience}`}>
          <div className="space-y-3">
            {(c.experience_user ?? []).map((e: any, idx: number) => {
              return (
                <ItemBox
                  key={idx}
                  title={e.role}
                  company_id={e.company_id}
                  name={companyEnToKo(e.company_db.name)}
                  start_date={e.start_date}
                  end_date={e.end_date}
                  link={e.company_db.linkedin_url}
                  description={e.description}
                  logo_url={e.company_db.logo}
                  months={e.months}
                />
              );
            })}
          </div>
        </Box>

        {/* Educations */}
        <Box title={`${m.data.education}`}>
          <div className="space-y-3">
            {(c.edu_user ?? []).map((ed: any, idx: number) => (
              <ItemBox
                key={idx}
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
              />
            ))}
          </div>
        </Box>

        {/* Awards */}
        {
          (c.extra_experience ?? []).length > 0 && (
            <Box title={`수상 기록`}>
              <div className="space-y-3">
                {(c.extra_experience ?? []).map((extra: any, idx: number) => (
                  <ItemBox
                    key={idx}
                    title={`${extra.title}`}
                    name={
                      extra.issued_by
                    }
                    start_date={extra.issued_at}
                    end_date={""}
                    link={''}
                    description={extra.description}
                    typed="award"
                  />
                ))}
              </div>
            </Box>)
        }

        {/* Publications */}
        {
          c.publications && c.publications.length > 0 && (
            <Box title={`${m.data.publications}`}>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                {(c.publications ?? []).map((p: any, idx: number) => (
                  <PublicationBox
                    key={idx}
                    title={p.title}
                    published_at={p.published_at}
                    link={p.link}
                  />
                ))}
              </div>
            </Box>
          )
        }
      </div>
    </div>
  );
}

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
    <div className="rounded-xl shadow-sm w-full">
      <div className="flex items-center gap-2 text-base font-normal text-hgray900">
        {icon}
        {title}
      </div>
      <div className="mt-[10px]">{children}</div>
    </div>
  );
};
