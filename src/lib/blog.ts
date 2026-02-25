export type BlogPostMeta = {
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
  seoTitle?: string;
  seoDescription?: string;
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
  locale = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

export function toIsoDate(dateString: string): string {
  return `${dateString}T00:00:00.000Z`;
}
