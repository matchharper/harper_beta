import type { GithubRepoContributionRow } from "@/hooks/useCandidateDetail";
import { ArrowUpRight, GitFork, Star } from "lucide-react";
import React from "react";

const numberFormatter = new Intl.NumberFormat("en-US");

const normalizeRepoLabel = (repo: string) => {
  const cleaned = repo
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\/+$/, "");

  return cleaned || repo;
};

const normalizeRepoUrl = (repo: string) => {
  if (!repo) return "";
  if (repo.startsWith("http://") || repo.startsWith("https://")) return repo;
  if (repo.startsWith("github.com/")) return `https://${repo}`;
  return `https://github.com/${repo.replace(/^\/+/, "")}`;
};

const parseLanguages = (languages: GithubRepoContributionRow["languages"]) => {
  if (!languages) return [];

  if (Array.isArray(languages)) {
    return languages
      .map((language) => String(language).trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  if (typeof languages === "string") {
    return languages
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  if (typeof languages === "object") {
    const entries = Object.entries(languages as Record<string, unknown>);
    entries.sort((a, b) => {
      const aValue = typeof a[1] === "number" ? a[1] : 0;
      const bValue = typeof b[1] === "number" ? b[1] : 0;
      return bValue - aValue;
    });
    return entries
      .map(([language]) => language.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return [];
};

const parseTopics = (topics: string | null) => {
  if (!topics) return [];
  return topics
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 3);
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return numberFormatter.format(value);
};

const StatChip = ({
  label,
  value,
}: {
  label: React.ReactNode;
  value: string;
}) => (
  <div className="rounded-md bg-hgray1000/5 px-2 py-1.5 text-[12px] text-hgray700 font-light">
    <span className="text-hgray600">{label}</span>
    <span className="ml-1.5 text-hgray1000 font-normal">{value}</span>
  </div>
);

const GithubRepoContributionBox = ({
  contribution,
}: {
  contribution?: GithubRepoContributionRow | null;
}) => {
  if (!contribution) {
    return (
      <div className="rounded-lg border border-hgray1000/10 px-4 py-3 text-sm text-hgray700 font-light">
        GitHub repository data is unavailable.
      </div>
    );
  }

  const repoLabel = normalizeRepoLabel(contribution.repo);
  const repoUrl = normalizeRepoUrl(contribution.repo);
  const languages = parseLanguages(contribution.languages);
  const topics = parseTopics(contribution.topics);

  return (
    <div className="rounded-lg border border-hgray1000/10 px-4 py-3 hover:bg-hgray1000/[0.02] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-base font-medium text-hgray1000 hover:underline"
          >
            <span className="truncate">{repoLabel}</span>
            <ArrowUpRight size={15} className="shrink-0" />
          </a>
          <div className="mt-1 text-sm text-hgray700 font-light line-clamp-2">
            {contribution.description || "설명 없음"}
          </div>
        </div>
        <div className="shrink-0 text-[12px] text-hgray700">
          최근 기여: {formatDate(contribution.last_contrib_at)}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {contribution.role ? (
          <span className="rounded-full bg-accenta1/10 px-2 py-0.5 text-[11px] text-accenta1">
            {contribution.role}
          </span>
        ) : null}
        {languages.map((language) => (
          <span
            key={language}
            className="rounded-full bg-hgray1000/5 px-2 py-0.5 text-[11px] text-hgray700"
          >
            {language}
          </span>
        ))}
        {topics.map((topic) => (
          <span
            key={topic}
            className="rounded-full bg-hgray1000/5 px-2 py-0.5 text-[11px] text-hgray700"
          >
            #{topic}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatChip label="Commits" value={formatNumber(contribution.commits)} />
        <StatChip
          label="Merged PRs"
          value={formatNumber(contribution.merged_prs)}
        />
        <StatChip
          label="Contributors"
          value={formatNumber(contribution.contributors)}
        />
        <StatChip
          label={
            <span className="inline-flex items-center gap-1">
              <Star size={12} />
              Stars
            </span>
          }
          value={formatNumber(contribution.stars)}
        />
        <StatChip
          label={
            <span className="inline-flex items-center gap-1">
              <GitFork size={12} />
              Forks
            </span>
          }
          value={formatNumber(contribution.forks)}
        />
      </div>
    </div>
  );
};

export default React.memo(GithubRepoContributionBox);
