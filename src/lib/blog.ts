export type BlogLocale = "ko" | "en";

export type BlogSchemaType = "article" | "faq" | "none";

export type BlogPostMeta = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  authorAvatar: string;
  thumbnail: string;
  publishedAt: string;
  updatedAt: string;
  isPinned: boolean;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  schemaType: BlogSchemaType;
  relatedJobSlugs: string[];
  relatedPostSlugs: string[];
};

export type BlogPost = BlogPostMeta & {
  content: string;
  readingMinutes: number;
};

export type BlogCategorySummary = {
  name: string;
  count: number;
};

export function formatBlogDate(
  dateString: string,
  locale: string = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

export function toIsoDate(dateString: string): string {
  const timestamp = Date.parse(dateString);
  if (!Number.isNaN(timestamp) && dateString.includes("T")) {
    return new Date(timestamp).toISOString();
  }
  return `${dateString}T00:00:00.000Z`;
}

export function buildBlogTalkToHarperHref(slug: string): string {
  const nextParams = new URLSearchParams({ source: "blog", slug });
  const loginParams = new URLSearchParams({
    next: `/career?${nextParams.toString()}`,
    source: "blog",
  });
  return `/career_login?${loginParams.toString()}`;
}

export function getBlogDisplayTitle(title: string): string {
  return title.replace(/\s*\|\s*Harper(?:\s+Blog)?\s*$/i, "").trim();
}
