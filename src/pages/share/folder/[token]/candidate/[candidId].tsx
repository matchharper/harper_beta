import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  Lock,
  Share2,
} from "lucide-react";
import MainProfile from "@/pages/my/p/components/MainProfile";
import ProfileBio from "@/pages/my/p/components/ProfileBio";
import ItemBox from "@/pages/my/p/components/ItemBox";
import PublicationBox from "@/pages/my/p/components/PublicationBox";
import { Box } from "@/pages/my/p/CandidateProfile";
import CandidateMemoDock from "@/components/ui/CandidateMemoDock";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  majorEnToKo,
} from "@/utils/language_map";
import { Loading } from "@/components/ui/loading";

type SharedFolderCandidatePayload = {
  folder?: {
    id: number;
    name: string;
  };
  candid?: any;
};

function normalizeLinks(raw: any): string[] {
  if (!raw || !Array.isArray(raw)) return [];

  const links: string[] = [];
  for (const value of raw) {
    const link = String(value ?? "").replace(/\/+$/, "");
    if (!link || links.includes(link)) continue;
    links.push(link);
  }
  return links;
}

function ErrorCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-hgray200 px-6 font-sans text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-hgray700" />
          <div>
            <div className="text-base font-medium text-white">{title}</div>
            <div className="mt-2 text-sm leading-6 text-hgray700">{desc}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharedFolderCandidatePage() {
  const router = useRouter();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const candidId =
    typeof router.query.candidId === "string" ? router.query.candidId : "";

  const [data, setData] = useState<SharedFolderCandidatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !token || !candidId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          token,
          candidId,
        });
        const res = await fetch(
          `/api/share/folder/candidate?${params.toString()}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load candidate");
        }
        if (!cancelled) {
          setData(json);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token, candidId]);

  const candid = data?.candid;
  const folder = data?.folder;
  const links = useMemo(() => normalizeLinks(candid?.links), [candid?.links]);
  const ownerShortlistMemo = String(candid?.shortlist_memo ?? "").trim();
  const ownerCandidateMarkStatus = candid?.candidate_mark?.status ?? null;

  if (loading) {
    return <Loading className="min-h-screen justify-center text-hgray700" />;
  }

  if (error || !candid) {
    return (
      <ErrorCard title="프로필을 열 수 없어요" desc={error || "No data"} />
    );
  }

  return (
    <div className="min-h-screen bg-hgray200 font-sans text-white">
      <div className="sticky top-0 z-20 border-b border-b-white/5 bg-hgray200/90 backdrop-blur">
        <div className="mx-auto flex max-w-[980px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/share/folder/${encodeURIComponent(token)}`}
              className="inline-flex items-center gap-2 text-sm text-hgray800 transition-colors hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              {folder?.name ?? "Shared folder"}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[980px] space-y-10 px-4 py-10">
        <div className="">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-hgray700">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5" />
              공유 폴더에서 열람 중
            </span>
          </div>
          <div className="flex items-start justify-between gap-6">
            <MainProfile
              profile_picture={candid.profile_picture}
              name={candid.name}
              headline={candid.headline}
              location={candid.location}
              links={links}
              profileRevealed={candid.profile_revealed !== false}
            />

            <div className="hidden md:flex flex-col items-end gap-3">
              {candid?.linkedin_url ? (
                <a
                  href={candid.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm text-hgray900 transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="h-4 w-4" />
                  LinkedIn
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <ProfileBio
              summary={candid.summary ?? []}
              bio={candid.bio ?? ""}
              name={candid.name ?? ""}
              oneline={candid.oneline ?? ""}
              isLoadingOneline={false}
              profileRevealed={candid.profile_revealed !== false}
            />
          </div>

          {ownerShortlistMemo || ownerCandidateMarkStatus ? (
            <div className="mt-8">
              <Box title="폴더 소유자 메모" color="accenta1">
                <CandidateMemoDock
                  candidId={candid.id}
                  initialMemo={ownerShortlistMemo}
                  initialMarkStatus={ownerCandidateMarkStatus}
                  showMarkButton={Boolean(ownerCandidateMarkStatus)}
                  editorClassName="min-h-[88px]"
                />
              </Box>
            </div>
          ) : null}
        </div>

        {(candid.experience_user ?? []).length > 0 ? (
          <Box title="경력">
            <div className="space-y-3">
              {(candid.experience_user ?? []).map(
                (item: any, index: number) => (
                  <ItemBox
                    key={index}
                    title={item.role}
                    company_id={item.company_id}
                    name={companyEnToKo(item?.company_db?.name)}
                    start_date={item.start_date}
                    end_date={item.end_date}
                    link={item?.company_db?.linkedin_url}
                    description={item.description}
                    logo_url={item?.company_db?.logo}
                    months={item.months}
                    disableEntityClick={candid.profile_revealed === false}
                  />
                )
              )}
            </div>
          </Box>
        ) : null}

        {(candid.edu_user ?? []).length > 0 ? (
          <Box title="학력">
            <div className="space-y-3">
              {(candid.edu_user ?? []).map((item: any, index: number) => (
                <ItemBox
                  key={index}
                  title={`${koreaUniversityEnToKo(item.school)}`}
                  name={
                    item.field
                      ? `${majorEnToKo(item.field)}, ${degreeEnToKo(item.degree)}`
                      : item.degree
                  }
                  start_date={item.start_date}
                  end_date={item.end_date}
                  link={item.url}
                  description={item.description ?? ""}
                  typed="edu"
                  disableEntityClick={candid.profile_revealed === false}
                />
              ))}
            </div>
          </Box>
        ) : null}

        {(candid.extra_experience ?? []).length > 0 ? (
          <Box title="수상 기록">
            <div className="space-y-3">
              {(candid.extra_experience ?? []).map(
                (item: any, index: number) => (
                  <ItemBox
                    key={index}
                    title={item.title}
                    name={item.issued_by}
                    start_date={item.issued_at}
                    end_date=""
                    link=""
                    description={item.description}
                    typed="award"
                  />
                )
              )}
            </div>
          </Box>
        ) : null}

        {(candid.publications ?? []).length > 0 ? (
          <Box title="논문/퍼블리케이션">
            <div className="grid grid-cols-1 gap-3">
              {(candid.publications ?? []).map((item: any, index: number) => (
                <PublicationBox
                  key={index}
                  title={item.title}
                  published_at={item.published_at}
                  link={item.link}
                  citation_num={item.citation_num ?? -1}
                  disabled={candid.profile_revealed === false}
                />
              ))}
            </div>
          </Box>
        ) : null}
      </div>
    </div>
  );
}
