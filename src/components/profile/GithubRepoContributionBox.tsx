import type { GithubContributionWithRepo } from "@/hooks/useCandidateDetail";
import React, { useMemo, useState } from "react";
import {
  Star,
  GitFork,
  ChevronDown,
  ChevronUp,
  GitCommitHorizontal,
  GitPullRequest,
  CalendarDays,
  CircleDot,
} from "lucide-react";
import { Tooltips } from "../ui/tooltip";
import { useRepoModalStore } from "@/store/useRepoModalStore";
import { MarkdownView } from "@/components/chat/MarkDownView";

const numberFormatter = new Intl.NumberFormat("en-US");

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
  Jupyter: "#DA5B0B",
};

const COLLAPSE_PREVIEW_CHARS = 220;

function normalizeRepoLabel(repoFullName: string) {
  const cleaned = repoFullName
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\/+$/, "");

  return cleaned || repoFullName;
}

function normalizeRepoUrl(repoFullName: string) {
  if (!repoFullName) return "";
  if (
    repoFullName.startsWith("http://") ||
    repoFullName.startsWith("https://")
  ) {
    return repoFullName;
  }
  if (repoFullName.startsWith("github.com/")) {
    return `https://${repoFullName}`;
  }
  return `https://github.com/${repoFullName.replace(/^\/+/, "")}`;
}

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return numberFormatter.format(value);
}

function getRoleVariant(contribution: GithubContributionWithRepo) {
  const raw = String(contribution.role ?? "")
    .trim()
    .toLowerCase();

  if (raw === "owner") {
    return {
      raw: "owner",
      label: "Owner",
      isOwner: true,
    };
  }

  return {
    raw: "contributor",
    label: "Contributor",
    isOwner: false,
  };
}

function stableColorForLanguage(lang: string) {
  const known = GITHUB_LANG_COLORS[lang];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < lang.length; i++) {
    hash = (hash * 31 + lang.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}

type LangEntry = {
  name: string;
  pct: number;
};

function getTopLanguages(languages: unknown, limit = 3): LangEntry[] {
  if (!languages || typeof languages !== "object") return [];

  return Object.entries(languages as Record<string, unknown>)
    .map(([name, value]) => ({
      name,
      pct: typeof value === "number" ? value : Number(value),
    }))
    .filter((item) => Number.isFinite(item.pct) && item.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

function formatRepoCreatedAt(dateString?: string | null) {
  if (!dateString) return null;

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
  }).format(date);
}

function getRelativeRepoAge(dateString?: string | null) {
  if (!dateString) return null;

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    years -= 1;
  }

  if (years < 1) return "Less than 1 year old";
  if (years === 1) return "1 year old";
  return `${years} years old`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function RolePill({ isOwner }: { isOwner: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold",
        isOwner ? "bg-white/10 text-white" : "bg-white/5 text-hgray700"
      )}
    >
      {isOwner ? "Owner" : "Contributor"}
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
  dimmed = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dimmed?: boolean;
}) {
  return (
    <Tooltips text={label}>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-sm",
          dimmed ? "text-hgray700" : "text-hgray800"
        )}
      >
        <span className={cn(dimmed ? "text-hgray700" : "text-hgray600")}>
          {icon}
        </span>
        <span
          className={cn(
            "font-medium",
            dimmed ? "text-hgray800" : "text-hgray950"
          )}
        >
          {value}
        </span>
      </div>
    </Tooltips>
  );
}

function LanguagePill({ name, pct }: { name: string; pct: number }) {
  const color = stableColorForLanguage(name);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[13px] text-hgray800"
      title={`${name} ${pct.toFixed(1)}%`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
}

function TopicPill({ topic }: { topic: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-1 text-[12px] text-hgray700">
      {topic}
    </span>
  );
}

function CollapsibleReadmeSection({
  markdown,
  onExpand,
}: {
  markdown: string;
  onExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isLong = markdown.length > COLLAPSE_PREVIEW_CHARS;
  const displayMarkdown =
    expanded || !isLong
      ? markdown
      : `${markdown.slice(0, COLLAPSE_PREVIEW_CHARS)}...`;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (!expanded && onExpand) {
      onExpand();
    }

    setExpanded((prev) => !prev);
  };

  return (
    <div className="mt-4 w-full">
      <div className="[&_.prose]:max-w-none [&_.prose]:text-hgray800 [&_.prose_a]:text-blue-500 [&_.prose_code]:text-hgray900 [&_.prose_headings]:text-hgray1000 [&_.prose_p]:!my-1 [&_.prose]:text-sm">
        <MarkdownView markdown={displayMarkdown} />
      </div>

      {isLong && (
        <button
          type="button"
          onClick={handleToggle}
          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-500 transition hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              Read more
            </>
          )}
        </button>
      )}
    </div>
  );
}

const GithubRepoContributionBox = ({
  contribution,
}: {
  contribution?: GithubContributionWithRepo | null;
}) => {
  const { handleOpenRepo } = useRepoModalStore();

  const role = useMemo(
    () =>
      contribution
        ? getRoleVariant(contribution)
        : { raw: "contributor", label: "Contributor", isOwner: false },
    [contribution]
  );

  if (!contribution) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-hgray700">
        GitHub repository data is unavailable.
      </div>
    );
  }

  const repo = contribution.github_repo;
  const repoFullName = repo?.repo_full_name ?? "";
  const repoLabel = normalizeRepoLabel(repoFullName);
  const repoUrl = normalizeRepoUrl(repoFullName);

  const description = repo?.description?.trim() ?? "";
  const readmeExcerpt =
    typeof repo?.readme_excerpt === "string" &&
    repo.readme_excerpt.trim().length > 0
      ? repo.readme_excerpt.trim()
      : null;

  const topLangs = getTopLanguages(repo?.languages, 3);
  const topics = Array.isArray(repo?.topics) ? repo.topics.slice(0, 4) : [];

  const stars = repo?.stars ?? null;
  const forks = repo?.forks ?? null;

  const commits = contribution.commits ?? 0;
  const mergedPrs = contribution.merged_prs ?? 0;

  const createdAtLabel = formatRepoCreatedAt(repo?.updated_at);

  const handleClick = () => {
    if (contribution.repo_id) {
      handleOpenRepo({
        repoId: contribution.repo_id,
        repoFullName: repoLabel,
      }).catch(() => {});
      return;
    }

    if (repoUrl) {
      window.open(repoUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group w-full rounded-2xl border text-left transition-all duration-200 flex flex-col items-start justify-start",
        "px-5 py-4",
        role.isOwner
          ? "border-white/0 bg-white/[0.04] hover:bg-white/[0.06] hover:border-white/10"
          : "border-white/0 bg-white/[0.02] hover:bg-white/5 hover:border-white/5"
      )}
    >
      <div className="flex items-start justify-between gap-4 w-full">
        <div className="min-w-0 flex flex-wrap flex-col items-start justify-start">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[15px] font-medium text-blue-500/95 group-hover:underline">
              {repoLabel || "Unknown repo"}
            </div>
          </div>

          {createdAtLabel && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-hgray700">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} />
                Last Updated {createdAtLabel}
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0">
          <RolePill isOwner={role.isOwner} />
        </div>
      </div>

      {description ? (
        <div
          className={cn(
            "mt-4 rounded-xl px-3.5 py-3 text-sm leading-6 w-full",
            role.isOwner
              ? "bg-white/6 text-hgray850"
              : "bg-white/5 text-hgray800"
          )}
        >
          {description}
        </div>
      ) : readmeExcerpt ? (
        <CollapsibleReadmeSection markdown={readmeExcerpt} />
      ) : (
        <div className="mt-4 text-sm italic text-hgray700">
          [No description]
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {commits > 0 && (
          <Metric
            icon={<GitCommitHorizontal size={15} />}
            label="Commits"
            value={`${formatNumber(commits)} commits`}
            dimmed={!role.isOwner}
          />
        )}

        {mergedPrs > 0 && (
          <Metric
            icon={<GitPullRequest size={15} />}
            label="Merged PRs"
            value={`${formatNumber(mergedPrs)} PRs`}
            dimmed={!role.isOwner}
          />
        )}

        {createdAtLabel && !commits && !mergedPrs && (
          <Metric
            icon={<CalendarDays size={15} />}
            label="Created at"
            value={createdAtLabel}
            dimmed={!role.isOwner}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2">
          {topics.map((topic) => (
            <TopicPill key={topic} topic={topic} />
          ))}
        </div>

        <div
          className={cn(
            "flex items-center gap-3",
            !role.isOwner && "opacity-75"
          )}
        >
          <Metric
            icon={<Star size={16} className="text-yellow-300" />}
            label="Stars"
            value={formatNumber(stars)}
            dimmed={!role.isOwner}
          />
          <Metric
            icon={<GitFork size={16} />}
            label="Forks"
            value={formatNumber(forks)}
            dimmed={!role.isOwner}
          />
        </div>
      </div>

      {topLangs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {topLangs.map((lang) => (
            <LanguagePill key={lang.name} name={lang.name} pct={lang.pct} />
          ))}
        </div>
      )}
    </button>
  );
};

export default React.memo(GithubRepoContributionBox);
