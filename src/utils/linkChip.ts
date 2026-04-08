type BrandMatchInput = {
  host: string;
  url: string;
};

type BrandConfig = {
  match: ({ host, url }: BrandMatchInput) => boolean;
  label: string;
  icon: string;
};

const DEFAULT_ICON = "/svgs/chain.svg";

const normalizeUrl = (raw: string) =>
  raw.startsWith("http") ? raw : `https://${raw}`;

const parseUrl = (raw: string) => {
  try {
    return new URL(normalizeUrl(raw));
  } catch {
    return null;
  }
};

const getHost = (raw: string) => parseUrl(raw)?.hostname.replace(/^www\./, "") ?? raw;

const getProfileLabel = (parsed: URL) => {
  const host = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "github.com" && segments.length === 1) {
    return segments[0];
  }

  if ((host === "x.com" || host === "twitter.com") && segments.length === 1) {
    return segments[0];
  }

  return null;
};

const BRAND_MAP: BrandConfig[] = [
  {
    match: ({ host }) => host.includes("linkedin.com"),
    label: "linkedin",
    icon: "https://www.linkedin.com/favicon.ico",
  },
  {
    match: ({ host }) => host === "x.com" || host === "twitter.com",
    label: "x.com",
    icon: "https://abs.twimg.com/favicons/twitter.3.ico",
  },
  {
    match: ({ host }) => host.includes("instagram.com"),
    label: "instagram",
    icon: "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png",
  },
  {
    match: ({ host }) => host.includes("github.com"),
    label: "github",
    icon: "/svgs/github_white.svg",
  },
  {
    match: ({ host }) => host.includes("scholar.google."),
    label: "google scholar",
    icon: "https://scholar.google.com/favicon.ico",
  },
  {
    match: ({ url }) => url.toLowerCase().includes("cv.pdf"),
    label: "cv.pdf",
    icon: "/svgs/file.svg",
  },
  {
    match: ({ host }) => host.includes("crunchbase.com"),
    label: "crunchbase",
    icon: "/images/crunchbase.png",
  },
];

export const getLinkChipMeta = (raw: string) => {
  const url = normalizeUrl(raw);
  const parsed = parseUrl(raw);
  const host = getHost(raw);
  const brand = BRAND_MAP.find((entry) => entry.match({ host, url }));

  return {
    url,
    host,
    brand,
    label: parsed ? getProfileLabel(parsed) ?? brand?.label ?? host : brand?.label ?? host,
    icon: brand?.icon ?? DEFAULT_ICON,
  };
};
