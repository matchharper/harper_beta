// pages/share/[token].tsx (pages-router 기준)
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Share2, Lock, ExternalLink, AlertTriangle } from "lucide-react";

import MainProfile from "@/pages/my/p/components/MainProfile";
import ProfileBio from "@/pages/my/p/components/ProfileBio";
import ItemBox from "@/pages/my/p/components/ItemBox";
import PublicationBox from "@/pages/my/p/components/PublicationBox";
import { Box } from "@/pages/my/p/CandidateProfile"; // 현재 파일에서 export한 Box를 재사용한다는 가정
// 만약 경로/파일명이 다르면 Box를 별도 컴포넌트로 빼는 걸 추천

import {
    companyEnToKo,
    degreeEnToKo,
    koreaUniversityEnToKo,
    majorEnToKo,
} from "@/utils/language_map";
import SharedChatPanel from "@/components/chat/SharedChatPanel";

type SharePayload = {
    candid: any;
    include_chat?: boolean;
    messages?: any[];
};

function normalizeLinks(raw: any): string[] {
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const l of raw) {
        const ll = String(l ?? "").replace(/\/+$/, "");
        if (!ll) continue;
        if (!out.includes(ll)) out.push(ll);
    }
    return out;
}

function ErrorCard({ title, desc }: { title: string; desc: string }) {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-6">
            <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        <AlertTriangle className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        <div className="mt-2 text-sm leading-6 text-gray-600">{desc}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PublicBadge() {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
            <Lock className="h-3.5 w-3.5" />
            외부 공유용 보기
        </div>
    );
}

export default function ShareTokenPage() {
    const router = useRouter();
    const token = typeof router.query.token === "string" ? router.query.token : "";

    const [data, setData] = useState<SharePayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        if (!router.isReady) return;
        if (!token) return;

        let cancelled = false;

        async function run() {
            setLoading(true);
            setErr("");
            try {
                const res = await fetch(`/api/share/get?token=${encodeURIComponent(token)}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error ?? "Failed to load shared profile");
                if (!cancelled) setData(json);
            } catch (e: any) {
                if (!cancelled) setErr(e?.message ?? "Unknown error");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [router.isReady, token]);

    const candid = data?.candid;
    const messages = data?.messages;

    const links = useMemo(() => normalizeLinks(candid?.links), [candid?.links]);

    if (loading) return <div>Loading...</div>;

    if (err || !candid) {
        return (
            <ErrorCard
                title="공유 링크를 열 수 없어요"
                desc={err || "No data"}
            />
        );
    }

    return (
        <div className="w-full flex flex-row h-screen items-start justify-between overflow-hidden">
            {
                messages && messages.length > 0 && (
                    <SharedChatPanel title={candid.name} messages={messages ?? []} />
                )
            }
            <div className="h-screen bg-hgray200 font-sans text-white w-full overflow-y-auto">
                {/* Top bar */}
                <div className="sticky top-0 z-20 border-b border-b-white/10 backdrop-blur">
                    <div className="mx-auto max-w-[920px] px-4 py-3 flex items-center justify-between">
                        <div className="cursor-pointer hover:underline" onClick={() => window.open("https://matchharper.com/companies", "_blank")}><span className="text-sm text-hgray900">From </span> <span className="font-bold text-accenta1 font-hedvig">Harper</span></div>
                    </div>
                </div>

                <div className="mx-auto max-w-[920px] px-4 py-10 space-y-10">
                    {/* Hero card */}
                    <div className="p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-6">
                            {/* 기존 MainProfile 재사용 */}
                            <MainProfile
                                profile_picture={candid.profile_picture}
                                name={candid.name}
                                headline={candid.headline}
                                location={candid.location}
                                total_exp_months={candid.total_exp_months}
                            />

                            {/* 오른쪽 정보/액션 (공유 전용) */}
                            <div className="hidden md:flex flex-col items-end gap-3">
                                {candid?.linkedin_url && (
                                    <a
                                        href={candid.linkedin_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        LinkedIn
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Bio / Summary */}
                        <div className="mt-8">
                            <ProfileBio
                                summary={candid.summary ?? []}
                                bio={candid.bio ?? ""}
                                name={candid.name ?? ""}
                                oneline={candid.oneline ?? ""} // 없으면 빈값
                                isLoadingOneline={false}
                                links={links}
                            />
                        </div>
                    </div>

                    {/* Experiences */}
                    {(candid.experience_user ?? []).length > 0 && (
                        <Box title="경력">
                            <div className="space-y-3">
                                {(candid.experience_user ?? []).map((e: any, idx: number) => (
                                    <ItemBox
                                        key={idx}
                                        title={e.role}
                                        company_id={e.company_id}
                                        name={companyEnToKo(e?.company_db?.name)}
                                        start_date={e.start_date}
                                        end_date={e.end_date}
                                        link={e?.company_db?.linkedin_url}
                                        description={e.description}
                                        logo_url={e?.company_db?.logo}
                                        months={e.months}
                                    />
                                ))}
                            </div>
                        </Box>
                    )}

                    {/* Educations */}
                    {(candid.edu_user ?? []).length > 0 && (
                        <Box title="학력">
                            <div className="space-y-3">
                                {(candid.edu_user ?? []).map((ed: any, idx: number) => (
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
                    )}

                    {/* Awards */}
                    {(candid.extra_experience ?? []).length > 0 && (
                        <Box title="수상 기록">
                            <div className="space-y-3">
                                {(candid.extra_experience ?? []).map((extra: any, idx: number) => (
                                    <ItemBox
                                        key={idx}
                                        title={`${extra.title}`}
                                        name={extra.issued_by}
                                        start_date={extra.issued_at}
                                        end_date={""}
                                        link={""}
                                        description={extra.description}
                                        typed="award"
                                    />
                                ))}
                            </div>
                        </Box>
                    )}

                    {/* Publications */}
                    {(candid.publications ?? []).length > 0 && (
                        <Box title="논문/퍼블리케이션">
                            <div className="grid grid-cols-1 gap-3">
                                {(candid.publications ?? []).map((p: any, idx: number) => (
                                    <PublicationBox
                                        key={idx}
                                        title={p.title}
                                        published_at={p.published_at}
                                        link={p.link}
                                    />
                                ))}
                            </div>
                        </Box>
                    )}

                    {/* Footer */}
                    <div className="mt-[20vh] pt-2 pb-10 font-light text-center text-xs text-gray-400">
                        Shared from <span className="text-accenta1" onClick={() => window.open("https://matchharper.com/companies", "_blank")}>Harper</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
