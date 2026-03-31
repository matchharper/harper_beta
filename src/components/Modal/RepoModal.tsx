import React, { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Book,
  GitFork,
  Star,
  Users,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { initials } from "@/components/NameProfile";
import { useRepoModalStore } from "@/store/useRepoModalStore";
import { useRepoDetail } from "@/hooks/useRepoDetail";

const numberFormatter = new Intl.NumberFormat("en-US");

const formatNumber = (value?: number | string | null) => {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || Number.isNaN(num)) return "-";
  return numberFormatter.format(num);
};

const GITHUB_LANG_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Scala: "#c22d40",
  Dart: "#00B4AB",
  "Jupyter Notebook": "#DA5B0B",
};

const stableColorForLanguage = (lang: string) => {
  const known = GITHUB_LANG_COLORS[lang];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < lang.length; i++)
    hash = (hash * 31 + lang.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
};

type LangEntry = { name: string; pct: number };

const getTopLanguages = (languages: unknown, limit = 5): LangEntry[] => {
  if (!languages || typeof languages !== "object") return [];
  const entries = Object.entries(languages as Record<string, unknown>)
    .map(([name, v]) => ({
      name,
      pct: typeof v === "number" ? v : Number(v),
    }))
    .filter((x) => Number.isFinite(x.pct) && x.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
  return entries;
};

function MetaCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <div className="text-sm text-hgray600">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-base text-hgray900">
        {icon}
        {value}
      </div>
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

export default function RepoModalRoot() {
  const { isOpen, payload, close } = useRepoModalStore();
  const closeOnBackdrop = payload?.closeOnBackdrop ?? true;
  const repoId = payload?.repoId;
  const repoFullName = payload?.repoFullName;
  const { data, isLoading, error } = useRepoDetail(repoId);

  useEffect(() => {
    if (!isOpen) return;
    history.pushState({ modal: "repo" }, "");
    const onPopState = () => close();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  const repo = data?.repo ?? null;
  const contributors = data?.contributors ?? [];

  const topLangs = useMemo(
    () => getTopLanguages(repo?.languages),
    [repo?.languages]
  );

  const repoUrl = repo
    ? `https://github.com/${repo.repo_full_name}`
    : repoFullName
      ? `https://github.com/${repoFullName}`
      : "";

  const displayTitle = repo?.repo_full_name ?? repoFullName ?? "Repo 정보를 불러오는 중";

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
            aria-label="Close repo modal backdrop"
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
            {/* Header */}
            <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-start justify-between border-b border-white/5 bg-hgray200/95 px-6 pb-4 backdrop-blur md:-mx-8 md:px-8">
              <div className="pr-4 pt-6">
                <div className="text-xs tracking-[0.14em] text-accenta1/80">
                  GitHub Repository
                </div>
                <div className="mt-2 text-2xl leading-tight text-hgray1000">
                  {displayTitle}
                </div>
                {repoUrl && (
                  <div className="mt-2">
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-sm text-blue-500 transition hover:bg-white/10 hover:underline"
                    >
                      GitHub에서 보기
                    </a>
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
                Repo 정보를 불러오는 중입니다.
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-white/5 px-4 py-6 text-sm text-red-300">
                Repo 정보를 불러오지 못했습니다.
              </div>
            ) : !repo ? (
              <div className="rounded-2xl bg-white/5 px-4 py-6 text-sm text-hgray600">
                해당 Repo 정보를 찾을 수 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {/* Description */}
                {repo.description && (
                  <div className="text-sm leading-7 text-hgray800">
                    {repo.description}
                  </div>
                )}

                {/* MetaCards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <MetaCard
                    label="Stars"
                    value={formatNumber(repo.stars)}
                    icon={<Star size={16} className="text-yellow-300" />}
                  />
                  <MetaCard
                    label="Forks"
                    value={formatNumber(repo.forks)}
                    icon={<GitFork size={16} className="text-hgray600" />}
                  />
                </div>

                {/* Languages */}
                {topLangs.length > 0 && (
                  <Section title="Languages">
                    <div className="flex flex-wrap items-center gap-3">
                      {topLangs.map((l) => {
                        const color = stableColorForLanguage(l.name);
                        return (
                          <span
                            key={l.name}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-sm text-hgray800"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            {l.name}
                            <span className="text-hgray600">
                              {l.pct.toFixed(1)}%
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* Topics */}
                {repo.topics && repo.topics.length > 0 && (
                  <Section title="Topics">
                    <div className="flex flex-wrap items-center gap-2">
                      {(repo.topics as string[]).map((topic: string) => (
                        <span
                          key={topic}
                          className="inline-flex items-center rounded-full bg-accenta1/10 px-3 py-1 text-xs text-accenta1"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {/* README Excerpt */}
                {repo.readme_excerpt && (
                  <Section title="About">
                    <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm leading-6 text-hgray800 whitespace-pre-wrap">
                      {repo.readme_excerpt}
                    </div>
                  </Section>
                )}

                {/* Contributors */}
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
                        const profile = contributor.github_profile;
                        const contributorName =
                          profile?.name?.trim() ||
                          profile?.github_username ||
                          "Unknown contributor";
                        const contributorCompany =
                          profile?.company?.trim() || "";
                        const contributorLocation =
                          profile?.location?.trim() || "";

                        const content = (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/0 bg-white/5">
                                {profile?.avatar_url ? (
                                  <img
                                    src={profile.avatar_url}
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
                                  {profile?.github_username && (
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-hgray600">
                                      @{profile.github_username}
                                    </span>
                                  )}
                                  {contributor.role && (
                                    <span className="rounded-full bg-accenta1/15 px-2 py-0.5 text-[11px] text-accenta1">
                                      {contributor.role}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 text-sm text-hgray700">
                                  {[contributorCompany, contributorLocation]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                            </div>
                            <div className="ml-14 mt-3 flex flex-wrap items-center gap-3 text-sm text-hgray700">
                              {(contributor.commits ?? 0) > 0 && (
                                <div className="inline-flex items-center gap-1">
                                  <span>
                                    {formatNumber(contributor.commits)} Commits
                                  </span>
                                </div>
                              )}
                              {(contributor.merged_prs ?? 0) > 0 && (
                                <div className="inline-flex items-center gap-1">
                                  <span>
                                    {formatNumber(contributor.merged_prs)} PRs
                                  </span>
                                </div>
                              )}
                            </div>
                          </>
                        );

                        if (profile?.candid_id) {
                          return (
                            <Link
                              key={`${contributor.repo_id}-${contributor.github_profile_id}`}
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
                            key={`${contributor.repo_id}-${contributor.github_profile_id}`}
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
