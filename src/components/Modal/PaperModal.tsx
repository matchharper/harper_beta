import React, { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  BookOpenText,
  FileText,
  GraduationCap,
  Quote,
  Users,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { initials } from "@/components/NameProfile";
import { usePaperModalStore } from "@/store/usePaperModalStore";
import { usePaperDetail } from "@/hooks/usePaperDetail";
import LinkChips from "@/pages/my/p/components/LinkChips";
import { normalizeVenue, parsePublishedAt } from "@/utils/conference_map";

function MetaCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <div className="text-sm text-hgray600">{label}</div>
      <div className="mt-2 text-base text-hgray900">{value}</div>
      {subvalue ? (
        <div className="mt-1 text-sm leading-5 text-hgray600">{subvalue}</div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-hgray700">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function PaperModalRoot() {
  const { isOpen, payload, close } = usePaperModalStore();
  const closeOnBackdrop = payload?.closeOnBackdrop ?? true;
  const paperId = payload?.paperId;
  const { data, isLoading, error } = usePaperDetail(paperId);

  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ modal: "paper" }, "");

    const onPopState = () => {
      close();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  const paper = data?.paper ?? null;
  const contributors = data?.contributors ?? [];

  const paperLinks = useMemo(() => {
    if (!paper) return [];
    return [paper.external_link ?? "", paper.scholar_link ?? ""].filter(
      (link, index, array) => !!link && array.indexOf(link) === index
    );
  }, [paper]);

  const cited_by_scholar_link = paper?.cited_by_scholar_link ?? "";

  const { venue, year } = parsePublishedAt(paper?.published_at ?? "");
  const mappedVenue = normalizeVenue(paper?.published_at ?? "");

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[10000] font-sans"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Close paper modal backdrop"
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              if (closeOnBackdrop) close();
            }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 top-[6vh] mx-auto max-h-[88vh] w-[min(760px,92vw)] overflow-y-auto rounded-[28px] bg-hgray200 px-6 pb-8 text-hgray900 shadow-2xl md:px-8"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
          >
            <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-start justify-between border-b border-white/5 bg-hgray200/95 px-6 pb-4 backdrop-blur md:-mx-8 md:px-8">
              <div className="pr-4 pt-6">
                <div className="text-xs tracking-[0.14em] text-accenta1/80">
                  {year}
                </div>
                <div className="mt-2 text-2xl leading-tight text-hgray1000">
                  {paper?.title ?? "논문 정보를 불러오는 중"}
                </div>

                {paperLinks.length > 0 && (
                  <div className="mt-2">
                    <LinkChips links={paperLinks} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-2 text-hgray700 transition hover:bg-white/5"
              >
                <XIcon className="h-5 w-5" strokeWidth={1.6} />
              </button>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-sm text-hgray600">
                논문 정보를 불러오는 중입니다.
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-white/5 px-4 py-6 text-sm text-red-300">
                논문 정보를 불러오지 못했습니다.
              </div>
            ) : !paper ? (
              <div className="rounded-2xl bg-white/5 px-4 py-6 text-sm text-hgray600">
                해당 논문 정보를 찾을 수 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <MetaCard
                    label="Venue"
                    value={mappedVenue || venue || "Unknown"}
                    subvalue={year || undefined}
                  />
                  <MetaCard
                    label="Citations"
                    value={`${paper.total_citations ?? 0}`}
                    subvalue={
                      <div
                        className="flex items-center gap-1 flex-row cursor-pointer hover:text-white transition-all duration-200"
                        onClick={() => {
                          window.open(cited_by_scholar_link, "_blank");
                        }}
                      >
                        <span>인용한 논문들 보기</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </div>
                    }
                  />
                </div>

                {/* <Section
                  title="Abstract"
                  icon={<FileText className="h-4 w-4" />}
                >
                  <div className="rounded-2xl bg-white/5 px-4 py-4 text-sm leading-7 text-hgray800">
                    {paper.abstract?.trim() ||
                      "등록된 abstract가 없습니다. 위 링크에서 원문 정보를 확인할 수 있습니다."}
                  </div>
                </Section> */}

                <Section
                  title={`Contributors (${contributors.length})`}
                  icon={<Users className="h-4 w-4" />}
                >
                  <div className="flex flex-col gap-3">
                    {contributors.length === 0 ? (
                      <div className="rounded-2xl bg-white/5 px-4 py-4 text-sm text-hgray600">
                        기여자 정보가 아직 연결되어 있지 않습니다.
                      </div>
                    ) : (
                      contributors.map((contributor) => {
                        const profile = contributor.scholar_profile;
                        const contributorName =
                          profile?.name?.trim() || "Unknown author";
                        const contributorAffiliation =
                          profile?.affiliation?.trim() ||
                          "Affiliation unavailable";

                        const content = (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/0 bg-white/5">
                                {profile?.profile_image_url ? (
                                  <img
                                    src={profile.profile_image_url}
                                    alt={contributorName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="text-sm text-hgray800">
                                    {initials(contributorName)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-base text-hgray1000">
                                    {contributorName}
                                  </div>
                                  {contributor.author_order ? (
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-hgray600">
                                      Author #{contributor.author_order}
                                    </span>
                                  ) : null}
                                  {contributor.is_first_author ? (
                                    <span className="rounded-full bg-accenta1/15 px-2 py-0.5 text-[11px] text-accenta1">
                                      First author
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-sm text-hgray700">
                                  {contributorAffiliation}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-hgray600">
                                  {profile?.topics ? (
                                    <div className="inline-flex items-center gap-1">
                                      <BookOpenText className="h-3.5 w-3.5" />
                                      <span className="line-clamp-1">
                                        {profile.topics}
                                      </span>
                                    </div>
                                  ) : null}
                                  {/* {profile?.scholar_url ? (
                                    <div className="inline-flex items-center gap-1">
                                      <GraduationCap className="h-3.5 w-3.5" />
                                      <span>Scholar profile</span>
                                    </div>
                                  ) : null} */}
                                </div>
                              </div>
                            </div>
                            <div className="ml-14 mt-3 flex flex-wrap items-center gap-3 text-sm text-hgray700">
                              <div className="inline-flex items-center gap-1">
                                <span>
                                  {profile?.total_citations_num ?? 0} citations
                                </span>
                              </div>
                            </div>
                          </>
                        );

                        if (profile?.candid_id) {
                          return (
                            <Link
                              key={`${contributor.paper_id}-${contributor.scholar_profile_id}`}
                              href={`/my/p/${profile.candid_id}`}
                              onClick={close}
                              className="rounded-2xl bg-white/5 px-4 py-4 transition hover:bg-white/10"
                            >
                              {content}
                            </Link>
                          );
                        }

                        return (
                          <div
                            key={`${contributor.paper_id}-${contributor.scholar_profile_id}`}
                            className="rounded-2xl bg-white/5 px-4 py-4"
                          >
                            {content}
                          </div>
                        );
                      })
                    )}
                  </div>
                </Section>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
