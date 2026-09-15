import type { IncomingMessage } from "http";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import { getPublicOfficialJobListItems } from "@/lib/officialJobs/server";
import { resolveOfficialJobsLocaleFromRequest } from "@/lib/officialJobs/copy";
import { supabaseServer } from "@/lib/supabaseServer";
import type {
  BlogCategorySummary,
  BlogLocale,
  BlogPost,
  BlogPostMeta,
  BlogSchemaType,
} from "./blog";

const BLOG_POST_SELECT_COLUMNS = [
  "id",
  "slug",
  "category_ko",
  "category_en",
  "title_ko",
  "title_en",
  "excerpt_ko",
  "excerpt_en",
  "content_ko",
  "content_en",
  "seo_title_ko",
  "seo_title_en",
  "seo_description_ko",
  "seo_description_en",
  "author_name",
  "author_avatar_url",
  "thumbnail_url",
  "published_at",
  "updated_at",
  "is_published",
  "is_pinned",
  "tags",
  "schema_type",
  "related_job_slugs",
  "related_post_slugs",
].join(",");

type BlogPostRow = {
  author_avatar_url: string;
  author_name: string;
  category_en: string | null;
  category_ko: string | null;
  content_en: string | null;
  content_ko: string | null;
  excerpt_en: string | null;
  excerpt_ko: string | null;
  id: string;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  related_job_slugs: string[] | null;
  related_post_slugs: string[] | null;
  schema_type: string;
  seo_description_en: string | null;
  seo_description_ko: string | null;
  seo_title_en: string | null;
  seo_title_ko: string | null;
  slug: string;
  tags: string[] | null;
  thumbnail_url: string;
  title_en: string | null;
  title_ko: string | null;
  updated_at: string;
};

type RequestWithCookies = IncomingMessage & {
  cookies?: Record<string, string | undefined>;
};

type BlogPageData = {
  jobs: OfficialJobListItem[];
  morePosts: BlogPostMeta[];
  post: BlogPost;
};

function getUntypedBlogTable() {
  return (
    supabaseServer as unknown as {
      from: (table: string) => any;
    }
  ).from("blog_posts");
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getLocalizedRow(row: BlogPostRow, locale: BlogLocale) {
  if (locale === "ko") {
    return {
      category: normalizeOptionalText(row.category_ko),
      content: normalizeOptionalText(row.content_ko),
      excerpt: normalizeOptionalText(row.excerpt_ko),
      seoDescription: normalizeOptionalText(row.seo_description_ko),
      seoTitle: normalizeOptionalText(row.seo_title_ko),
      title: normalizeOptionalText(row.title_ko),
    };
  }

  return {
    category: normalizeOptionalText(row.category_en),
    content: normalizeOptionalText(row.content_en),
    excerpt: normalizeOptionalText(row.excerpt_en),
    seoDescription: normalizeOptionalText(row.seo_description_en),
    seoTitle: normalizeOptionalText(row.seo_title_en),
    title: normalizeOptionalText(row.title_en),
  };
}

function hasCompleteLocalizedVersion(row: BlogPostRow, locale: BlogLocale) {
  const localized = getLocalizedRow(row, locale);
  return Boolean(
    localized.category &&
    localized.content &&
    localized.excerpt &&
    localized.title
  );
}

function normalizeSchemaType(value: string): BlogSchemaType {
  if (value === "faq" || value === "none") return value;
  return "article";
}

function countReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function mapBlogPostRow(row: BlogPostRow, locale: BlogLocale): BlogPost | null {
  if (!hasCompleteLocalizedVersion(row, locale)) return null;
  const localized = getLocalizedRow(row, locale);
  const content = localized.content!;

  return {
    author: row.author_name,
    authorAvatar: row.author_avatar_url,
    category: localized.category!,
    content,
    excerpt: localized.excerpt!,
    id: row.id,
    isPinned: row.is_pinned,
    publishedAt: row.published_at,
    readingMinutes: countReadingMinutes(content),
    relatedJobSlugs: row.related_job_slugs ?? [],
    relatedPostSlugs: row.related_post_slugs ?? [],
    schemaType: normalizeSchemaType(row.schema_type),
    seoDescription: localized.seoDescription,
    seoTitle: localized.seoTitle,
    slug: row.slug,
    tags: row.tags ?? [],
    thumbnail: row.thumbnail_url,
    title: localized.title!,
    updatedAt: row.updated_at,
  };
}

function toMeta(post: BlogPost): BlogPostMeta {
  const { content: _content, readingMinutes: _readingMinutes, ...meta } = post;
  return meta;
}

function compareByPublishedDateDesc(a: BlogPostMeta, b: BlogPostMeta): number {
  if (a.publishedAt === b.publishedAt) {
    return b.slug.localeCompare(a.slug);
  }
  return b.publishedAt.localeCompare(a.publishedAt);
}

async function fetchPublishedRows(): Promise<BlogPostRow[]> {
  const { data, error } = await getUntypedBlogTable()
    .select(BLOG_POST_SELECT_COLUMNS)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .order("slug", { ascending: false });

  if (error) {
    console.warn("blog post query failed:", error.message);
    return [];
  }

  return (data ?? []) as BlogPostRow[];
}

export function resolveBlogLocaleFromRequest(req: RequestWithCookies) {
  const acceptLanguage = req.headers["accept-language"];
  const hasAcceptLanguage = Array.isArray(acceptLanguage)
    ? acceptLanguage.some((value) => value.trim().length > 0)
    : Boolean(acceptLanguage?.trim());
  if (!req.cookies?.NEXT_LOCALE?.trim() && !hasAcceptLanguage) return "ko";

  return resolveOfficialJobsLocaleFromRequest(req);
}

export async function getAllPostsMeta(
  locale: BlogLocale
): Promise<BlogPostMeta[]> {
  const rows = await fetchPublishedRows();
  return rows
    .map((row) => mapBlogPostRow(row, locale))
    .filter((post): post is BlogPost => Boolean(post))
    .map(toMeta)
    .sort(compareByPublishedDateDesc);
}

export async function getPostBySlug(
  slug: string,
  locale: BlogLocale
): Promise<BlogPost | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const { data, error } = await getUntypedBlogTable()
    .select(BLOG_POST_SELECT_COLUMNS)
    .eq("slug", normalizedSlug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.warn("blog post detail query failed:", error.message);
    return null;
  }
  if (!data) return null;
  return mapBlogPostRow(data as BlogPostRow, locale);
}

export async function getPublishedPostSitemapRows(): Promise<
  Array<{
    slug: string;
    thumbnail: string;
    title: string;
    updatedAt: string;
  }>
> {
  const { data, error } = await getUntypedBlogTable()
    .select(
      "slug,updated_at,title_ko,title_en,content_ko,content_en,thumbnail_url"
    )
    .eq("is_published", true)
    .order("slug", { ascending: true });

  if (error) {
    console.warn("blog sitemap query failed:", error.message);
    return [];
  }

  return (data ?? [])
    .filter(
      (row: Record<string, unknown>) =>
        (normalizeOptionalText(row.title_ko as string | null) &&
          normalizeOptionalText(row.content_ko as string | null)) ||
        (normalizeOptionalText(row.title_en as string | null) &&
          normalizeOptionalText(row.content_en as string | null))
    )
    .map((row: Record<string, unknown>) => ({
      slug: String(row.slug),
      thumbnail: String(row.thumbnail_url ?? ""),
      title:
        normalizeOptionalText(row.title_ko as string | null) ??
        normalizeOptionalText(row.title_en as string | null) ??
        String(row.slug),
      updatedAt: String(row.updated_at),
    }));
}

export function getCategorySummaries(
  posts: BlogPostMeta[]
): BlogCategorySummary[] {
  const counter = new Map<string, number>();
  for (const post of posts) {
    counter.set(post.category, (counter.get(post.category) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function takeRandomJobs(jobs: OfficialJobListItem[], limit: number) {
  const shuffled = [...jobs];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled.slice(0, limit);
}

export function selectBlogJobs(
  jobs: OfficialJobListItem[],
  selectedSlugs: string[],
  limit = 4
) {
  const cappedLimit = Math.max(0, Math.min(limit, 4));
  if (selectedSlugs.length === 0) return takeRandomJobs(jobs, cappedLimit);

  const jobsBySlug = new Map(jobs.map((job) => [job.slug, job]));
  return selectedSlugs
    .map((slug) => jobsBySlug.get(slug))
    .filter((job): job is OfficialJobListItem => Boolean(job))
    .slice(0, cappedLimit);
}

function selectMorePosts(
  posts: BlogPostMeta[],
  currentPost: BlogPost,
  limit = 3
) {
  const candidates = posts.filter((post) => post.slug !== currentPost.slug);
  const bySlug = new Map(candidates.map((post) => [post.slug, post]));
  const selected: BlogPostMeta[] = [];

  for (const slug of currentPost.relatedPostSlugs) {
    const post = bySlug.get(slug);
    if (!post || selected.some((item) => item.slug === post.slug)) continue;
    selected.push(post);
    if (selected.length >= limit) return selected;
  }

  for (const post of candidates) {
    if (selected.some((item) => item.slug === post.slug)) continue;
    selected.push(post);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function getBlogPageData(
  slug: string,
  locale: BlogLocale
): Promise<BlogPageData | null> {
  const [post, posts, jobs] = await Promise.all([
    getPostBySlug(slug, locale),
    getAllPostsMeta(locale),
    getPublicOfficialJobListItems(),
  ]);
  if (!post) return null;

  return {
    jobs: selectBlogJobs(jobs, post.relatedJobSlugs),
    morePosts: selectMorePosts(posts, post),
    post,
  };
}
