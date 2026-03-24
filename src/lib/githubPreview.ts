export type GithubProfilePreview = {
  githubProfileId: string;
  githubUsername: string | null;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  publicRepos: number;
  topLanguages: string[];
  topRepoStars: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, value));
}

export function formatGithubRepoCount(count: number) {
  return `${formatCount(count)} repos`;
}

export function formatGithubFollowerCount(count: number) {
  return `${formatCount(count)} followers`;
}

export function buildGithubDeveloperTooltip(
  preview?: GithubProfilePreview | null
) {
  if (!preview) return "GitHub developer signals unavailable";

  const lines = [
    preview.name ? `Name: ${preview.name}` : "",
    preview.company ? `Company: ${preview.company}` : "",
    preview.location ? `Location: ${preview.location}` : "",
    `Repositories: ${formatCount(preview.publicRepos)}`,
    `Followers: ${formatCount(preview.followers)}`,
    preview.topLanguages.length > 0
      ? `Languages: ${preview.topLanguages.slice(0, 3).join(", ")}`
      : "",
    preview.topRepoStars > 0
      ? `Top repo: ${formatCount(preview.topRepoStars)} stars`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}