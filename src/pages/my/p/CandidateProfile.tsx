import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  CandidateDetail,
} from "@/hooks/useCandidateDetail";
import ShareProfileModal from "@/components/Modal/ShareProfileModal";
import { Share2, Upload } from "lucide-react";
import Bookmarkbutton from "@/components/ui/bookmarkbutton";
import Requestbutton from "@/components/ui/requestbutton";
import ItemBox from "./components/ItemBox";
import PublicationBox from "./components/PublicationBox";
import LinkChips from "./components/LinkChips";
import { replaceName } from "@/utils/textprocess";
import { useEffect, useMemo, useState } from "react";
import { useMessages } from "@/i18n/useMessage";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  locationEnToKo,
  majorEnToKo,
} from "@/utils/language_map";
import { logger } from "@/utils/logger";
import { Loader2, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import MainProfile from "./components/MainProfile";
import ProfileBio from "./components/ProfileBio";

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

  const { m } = useMessages();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const qc = useQueryClient();

  // const { data, isLoading, error } = useCandidateDetail(userId, candidId);
  const c: any = data;

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
      queryKey: ["candidate", candidId, userId], // 너 useCandidateDetail의 키랑 반드시 동일해야 함
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
    return <div>Loading...</div>;

  // 대충: email은 string일 수도 / JSON string일 수도 있어서 try-catch 한 번만
  let emails: string[] = [];
  try {
    emails = Array.isArray(c.email) ? c.email : JSON.parse(c.email || "[]");
  } catch {
    emails = c.email ? [String(c.email)] : [];
  }

  logger.log("c ", c);

  return (
    <div className="w-full mx-auto overflow-y-auto h-screen">
      <div className="w-[95%] max-w-[1080px] mx-auto px-4 py-10 space-y-12">
        {/* Header */}
        <div className="flex flex-row items-start justify-between w-full">
          <MainProfile profile_picture={c.profile_picture} name={c.name} headline={c.headline} location={c.location} total_exp_months={c.total_exp_months} />
          <div className="flex flex-row absolute top-2 right-2 items-start justify-end gap-2 font-normal">
            <div className="flex flex-col items-end gap-2">
              {/* <Requestbutton c={c} /> */}
              <button
                onClick={() => setIsShareOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-hgray900/5"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>
            <Bookmarkbutton
              userId={userId}
              candidId={c.id}
              connection={c.connection}
            />
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
