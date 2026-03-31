import type { GithubContributionWithRepo } from "@/hooks/useCandidateDetail";
import React from "react";
import { Book, Star, GitFork } from "lucide-react";
import { Tooltips } from "../ui/tooltip";
import { useRepoModalStore } from "@/store/useRepoModalStore";

const numberFormatter = new Intl.NumberFormat("en-US");

const normalizeRepoLabel = (repoFullName: string) => {
  const cleaned = repoFullName
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\/+$/, "");
  return cleaned || repoFullName;
};

const normalizeRepoUrl = (repoFullName: string) => {
  if (!repoFullName) return "";
  if (repoFullName.startsWith("http://") || repoFullName.startsWith("https://"))
    return repoFullName;
  if (repoFullName.startsWith("github.com/")) return `https://${repoFullName}`;
  return `https://github.com/${repoFullName.replace(/^\/+/, "")}`;
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return numberFormatter.format(value);
};

// Some datasets don't use `role` exactly. Try common fallbacks.
const pickRoleText = (contribution: GithubContributionWithRepo) => {
  const raw = contribution.role ?? null;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text || "Contributor";
};

const Badge = ({ text }: { text: string }) => (
  <span
    className={[
      "inline-flex items-center",
      "h-6 px-2.5",
      "text-[12px] font-medium",
      "text-hgray800",
      "bg-hgray1000/5",
      "border border-hgray1000/10",
      "rounded-full",
      "whitespace-nowrap",
    ].join(" ")}
    title={text}
  >
    {text}
  </span>
);

const Metric = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <Tooltips text={label}>
    <div className="inline-flex items-center gap-1.5 text-sm text-hgray700">
      <span className="text-hgray600">{icon}</span>
      <span className="font-medium text-hgray900">{value}</span>
    </div>
  </Tooltips>
);

/**
 * GitHub language colors (partial but useful). Add more as needed.
 * Fallback is deterministic per language via hash -> HSL.
 */
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

const stableColorForLanguage = (lang: string) => {
  const known = GITHUB_LANG_COLORS[lang];
  if (known) return known;

  // deterministic hash -> hue
  let hash = 0;
  for (let i = 0; i < lang.length; i++)
    hash = (hash * 31 + lang.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
};

type LangEntry = { name: string; pct: number };

const getTopLanguages = (languages: unknown, limit = 3): LangEntry[] => {
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

const LanguagePill = ({ name, pct }: { name: string; pct: number }) => {
  const color = stableColorForLanguage(name);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-hgray800"
      title={`${name} ${pct.toFixed(1)}%`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
};

const GithubRepoContributionBox = ({
  contribution,
}: {
  contribution?: GithubContributionWithRepo | null;
}) => {
  const { handleOpenRepo } = useRepoModalStore();

  if (!contribution) {
    return (
      <div className="border border-hgray1000/10 bg-white/5 px-4 py-3 text-sm text-hgray700">
        GitHub repository data is unavailable.
      </div>
    );
  }

  const repo = contribution.github_repo;
  const repoFullName = repo?.repo_full_name ?? "";
  const repoLabel = normalizeRepoLabel(repoFullName);
  const repoUrl = normalizeRepoUrl(repoFullName);
  const roleText = pickRoleText(contribution);

  // Use github_repo for repo details, fall back to contribution-level data
  const topLangs = getTopLanguages(repo?.languages, 3);
  const stars = repo?.stars ?? null;
  const forks = repo?.forks ?? null;
  const description = repo?.description ?? repo?.readme_excerpt ?? "";

  const handleClick = () => {
    if (contribution.repo_id) {
      handleOpenRepo({
        repoId: contribution.repo_id,
        repoFullName: repoLabel,
      }).catch(() => {});
      return;
    }
    // Fallback: no repo_id, open GitHub link
    if (repoUrl) {
      window.open(repoUrl, "_blank");
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-white/[0.02] px-4 py-3 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
    >
      {/* Top row */}
      <div className="flex items-center justify-start gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Book
            size={15}
            className="mt-[2px] text-hgray700 shrink-0"
            strokeWidth={1.6}
          />
          <div className="min-w-0">
            <div className="block max-w-full truncate text-[15px] font-normal text-blue-500 hover:underline">
              {repoLabel || "Unknown repo"}
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div className="shrink-0">
          <Badge text={roleText} />
        </div>
      </div>

      <div className="mt-1 text-sm text-hgray700 line-clamp-1">
        {description || "[No description]"}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Language chips */}
        {topLangs.length > 0 ? (
          <div className="flex flex-row flex-wrap items-center gap-2 mr-1">
            {topLangs.map((l) => (
              <LanguagePill key={l.name} name={l.name} pct={l.pct} />
            ))}
          </div>
        ) : null}

        <Metric
          icon={<Star size={16} className="text-yellow-300" />}
          label="Stars"
          value={formatNumber(stars)}
        />
        <Metric
          icon={<GitFork size={16} />}
          label="Forks"
          value={formatNumber(forks)}
        />
      </div>

      {/* Bottom metrics row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-normal text-hgray900">
        <div>활동 : </div>
        {(contribution.commits ?? 0) > 0 && (
          <div>{formatNumber(contribution.commits)} Commits</div>
        )}
        {(contribution.merged_prs ?? 0) > 0 && (
          <div>{formatNumber(contribution.merged_prs)} PRs</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(GithubRepoContributionBox);
