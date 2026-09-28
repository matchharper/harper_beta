export const CAREER_PROFILE_LINK_SOURCES = [
  {
    iconSrc: "/images/logos/linkedin.svg",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    iconSrc: "/images/logos/github.svg",
    placeholder: "https://github.com/username",
  },
  {
    iconSrc: "/images/logos/scholar.png",
    placeholder: "https://scholar.google.com/citations?user=",
  },
  { iconSrc: null, placeholder: "https://yourname.com" },
  {
    iconSrc: "/images/logos/xcom.png",
    placeholder: "https://x.com/username",
  },
] as const;

export const countCareerProfileLinks = (links: readonly string[]) =>
  links.filter((link) => Boolean(link.trim())).length;

export function getCareerProfileSourceSuggestion(
  links: readonly string[],
  gmailConnected: boolean
) {
  if (countCareerProfileLinks(links) + Number(gmailConnected) > 1) return null;
  return {
    missingLinkIndexes: CAREER_PROFILE_LINK_SOURCES.flatMap((_, index) =>
      links[index]?.trim() ? [] : [index]
    ),
    gmailMissing: !gmailConnected,
  };
}
