export type GithubProfilePreview = {
  name: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  publicRepos: number;
  ownerCreatorTotalStars: number;
  topLanguages: string[];
  topRepoStars: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, value));
}

export function formatGithubRepoCount(count: number) {
  return `${formatCount(count)} repos`;
}

export function formatGithubOwnerCreatorStars(count: number) {
  return `${formatCount(count)} stars`;
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
    `Owner/creator stars: ${formatCount(preview.ownerCreatorTotalStars)}`,
    `Followers: ${formatCount(preview.followers)}`,
    `Repositories: ${formatCount(preview.publicRepos)}`,
    preview.topLanguages.length > 0
      ? `Languages: ${preview.topLanguages.slice(0, 3).join(", ")}`
      : "",
    preview.topRepoStars > 0
      ? `Top repo: ${formatCount(preview.topRepoStars)} stars`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}
