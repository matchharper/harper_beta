import React, { useCallback, useEffect, useMemo } from "react";
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
import RevealProfileButton from "@/components/ui/RevealProfileButton";
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
    <div className="rounded-2xl bg-beige100 px-4 py-3">
      <div className="text-sm text-beige900/55">{label}</div>
      <div className="mt-2 text-base text-beige900">{value}</div>
      {subvalue ? (
        <div className="mt-1 text-sm leading-5 text-beige900/55">{subvalue}</div>
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
      <div className="flex items-center gap-2 text-sm text-beige900/55">
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
  const requestClose = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.history.state?.modal === "paper"
    ) {
      close();
      window.history.back();
      return;
    }

    close();
  }, [close]);

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
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

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
              if (closeOnBackdrop) requestClose();
            }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 top-[6vh] mx-auto max-h-[88vh] w-[min(760px,92vw)] scrollbar-none overflow-y-auto rounded-xl bg-beige50 px-6 pb-8 text-beige900 shadow-2xl md:px-8"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
          >
            <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-start justify-between border-b border-beige900/8 bg-beige50/95 px-6 pb-4 backdrop-blur md:-mx-8 md:px-8">
              <div className="pr-4 pt-6">
                <div className="text-sm text-accentBronze/80">{year}</div>
                <div className="mt-2 text-2xl leading-tight text-beige900">
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
                onClick={requestClose}
                className="absolute right-4 top-4 rounded-lg p-2 text-beige900/55 transition hover:bg-beige50/80"
              >
                <XIcon className="h-5 w-5" strokeWidth={1.6} />
              </button>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-sm text-beige900/55">
                논문 정보를 불러오는 중입니다.
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-6 text-sm text-rose-700">
                논문 정보를 불러오지 못했습니다.
              </div>
            ) : !paper ? (
              <div className="rounded-2xl bg-beige100 px-4 py-6 text-sm text-beige900/55">
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
                        className="flex items-center gap-1 flex-row cursor-pointer hover:text-beige900 transition-all duration-200"
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
                  <div className="rounded-2xl bg-beige100 px-4 py-4 text-sm leading-7 text-beige900/80">
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
                      <div className="rounded-2xl bg-beige100 px-4 py-4 text-sm text-beige900/55">
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
                        const contributorCandidId = String(
                          profile?.candid_id ?? ""
                        ).trim();
                        const profilePath = contributorCandidId
                          ? `/my/p/${contributorCandidId}`
                          : "";
                        const isProfileRevealed =
                          contributor.profile_revealed !== false ||
                          !contributorCandidId;
                        const contributorKey = [
                          contributor.paper_id,
                          contributor.scholar_profile_id ?? "unknown",
                          contributor.author_order ?? "na",
                        ].join("-");

                        const content = (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-beige900/8 bg-beige100">
                                {profile?.profile_image_url ? (
                                  <>
                                    {profile?.profile_image_url.includes(
                                      "scholar.google"
                                    ) ? (
                                      <img
                                        src="/images/scholar_profile.png"
                                        alt={contributorName}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <img
                                        src={profile.profile_image_url}
                                        alt={contributorName}
                                        className="h-full w-full object-cover"
                                      />
                                    )}
                                  </>
                                ) : (
                                  <div className="text-sm text-beige900/80">
                                    {initials(contributorName)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-base text-beige900">
                                    {contributorName}
                                  </div>
                                  {contributorCandidId && !isProfileRevealed ? (
                                    <span className="rounded-full bg-beige500/55 px-2 py-0.5 text-[11px] text-beige900/55">
                                      Harper profile locked
                                    </span>
                                  ) : null}
                                  {contributor.author_order ? (
                                    <span className="rounded-full bg-beige500/55 px-2 py-0.5 text-[11px] text-beige900/55">
                                      Author #{contributor.author_order}
                                    </span>
                                  ) : null}
                                  {contributor.is_first_author ? (
                                    <span className="rounded-full bg-accentBronze/15 px-2 py-0.5 text-[11px] text-accentBronze">
                                      First author
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-sm text-beige900/55">
                                  {contributorAffiliation}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-beige900/45">
                                  {profile?.topics && (
                                    <div className="inline-flex items-center gap-1">
                                      <BookOpenText className="h-3.5 w-3.5" />
                                      <span className="line-clamp-1">
                                        {profile.topics}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="ml-14 mt-3 flex flex-wrap items-center gap-3 text-sm text-beige900/55">
                              <div className="inline-flex items-center gap-1">
                                <span>
                                  {profile?.total_citations_num ?? 0} citations
                                </span>
                              </div>
                            </div>
                          </>
                        );

                        if (profilePath && isProfileRevealed) {
                          return (
                            <div
                              key={contributorKey}
                              className="rounded-2xl bg-beige100 px-4 py-4 transition hover:bg-beige500/55"
                            >
                              <Link
                                href={profilePath}
                                replace
                                onClick={close}
                                className="block"
                              >
                                {content}
                              </Link>
                              <div className="ml-14 mt-3 flex flex-wrap items-center gap-2 text-xs text-beige900/45">
                                <Link
                                  href={profilePath}
                                  replace
                                  onClick={close}
                                  className="inline-flex items-center gap-1 rounded-full bg-beige500/55 px-3 py-1.5 text-beige900/55 transition hover:bg-beige50/80"
                                >
                                  <span>프로필 보기</span>
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={contributorKey}
                            className="relative group rounded-2xl bg-beige100 px-4 py-4"
                          >
                            {profilePath ? (
                              <Link
                                href={profilePath}
                                replace
                                onClick={close}
                                className="block transition hover:opacity-95"
                              >
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                            {profilePath && !isProfileRevealed && (
                              <div className="ml-14 mt-3 gap-2 text-xs text-beige900/45">
                                <RevealProfileButton
                                  overlay
                                  overlayClassName="w-full h-full z-30 rounded-2xl group-hover:border-accentBronze/40 group-hover:bg-beige900/8"
                                  candidId={contributorCandidId}
                                  label="프로필 열람"
                                  className="px-4 py-1.5 text-xs"
                                />
                              </div>
                            )}
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
