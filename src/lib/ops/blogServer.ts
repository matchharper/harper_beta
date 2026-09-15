import type { BlogLocale, BlogSchemaType } from "@/lib/blog";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import { getPublicOfficialJobListItems } from "@/lib/officialJobs/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { randomUUID } from "node:crypto";

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
  "is_published",
  "is_pinned",
  "tags",
  "schema_type",
  "related_job_slugs",
  "related_post_slugs",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_AUTHOR_AVATAR_URL = "/images/logo.png";
const DEFAULT_AUTHOR_NAME = "Harper";

type LocalizedBlogInput = {
  content?: unknown;
  excerpt?: unknown;
  title?: unknown;
};

type BlogPostRow = {
  author_avatar_url: string;
  author_name: string;
  category_en: string | null;
  category_ko: string | null;
  content_en: string | null;
  content_ko: string | null;
  created_at: string;
  created_by: string | null;
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
  updated_by: string | null;
};

export type OpsBlogLocalizedContent = {
  category: string;
  content: string;
  excerpt: string;
  seoDescription: string;
  seoTitle: string;
  title: string;
};

export type OpsBlogPost = {
  authorAvatarUrl: string;
  authorName: string;
  createdAt: string;
  createdBy: string | null;
  id: string;
  isPinned: boolean;
  isPublished: boolean;
  localized: Record<BlogLocale, OpsBlogLocalizedContent>;
  publishedAt: string;
  relatedJobSlugs: string[];
  relatedPostSlugs: string[];
  schemaType: BlogSchemaType;
  slug: string;
  tags: string[];
  thumbnailUrl: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type OpsBlogResponse = {
  jobs: OfficialJobListItem[];
  posts: OpsBlogPost[];
};

export type OpsBlogSaveInput = {
  id?: unknown;
  isPinned?: unknown;
  isPublished?: unknown;
  localized?: Partial<Record<BlogLocale, LocalizedBlogInput>>;
  relatedJobSlugs?: unknown;
  relatedPostSlugs?: unknown;
  tags?: unknown;
  thumbnailUrl?: unknown;
};

export type OpsBlogSaveResponse = {
  ok: true;
  post: OpsBlogPost;
};

function getAdmin() {
  return getTalentSupabaseAdmin() as unknown as {
    from: (table: string) => any;
  };
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").trim();
  if (normalized.length > maxLength) {
    throw new Error(`Value must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  maxLength: number
) {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStringList(
  value: unknown,
  maxItems: number,
  maxLength: number
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const item = normalizeText(String(rawValue ?? ""), maxLength);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeLocalizedInput(
  value: LocalizedBlogInput | undefined
): OpsBlogLocalizedContent {
  return {
    category: "",
    content: normalizeText(value?.content, 120_000),
    excerpt: normalizeText(value?.excerpt, 600),
    seoDescription: "",
    seoTitle: "",
    title: normalizeText(value?.title, 240),
  };
}

function isLocalizedVersionEmpty(content: OpsBlogLocalizedContent) {
  return !Object.values(content).some(Boolean);
}

function validateLocalizedVersion(
  content: OpsBlogLocalizedContent,
  locale: BlogLocale
) {
  if (isLocalizedVersionEmpty(content)) return false;
  const missing = (["content", "excerpt", "title"] as const).filter(
    (field) => !content[field]
  );
  if (missing.length > 0) {
    throw new Error(
      `${locale.toUpperCase()} version requires ${missing.join(", ")}`
    );
  }
  return true;
}

function normalizeSlug(value: unknown, field = "slug") {
  const slug = normalizeRequiredText(value, field, 160).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${field} must use lowercase letters, numbers, and hyphens`
    );
  }
  return slug;
}

export function getOpsBlogPublishedDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildOpsBlogSlugBase(title: string) {
  return title
    .replace(/\s*\|\s*Harper\s*$/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140)
    .replace(/-$/g, "");
}

export function deriveOpsBlogLocalizedContent(
  content: OpsBlogLocalizedContent,
  category: string,
  hasVersion: boolean
): OpsBlogLocalizedContent {
  if (!hasVersion) {
    return {
      category: "",
      content: "",
      excerpt: "",
      seoDescription: "",
      seoTitle: "",
      title: "",
    };
  }
  return {
    ...content,
    category,
    seoDescription: content.excerpt,
    seoTitle: content.title,
  };
}

export function inferOpsBlogSchemaType(
  localized: Record<BlogLocale, OpsBlogLocalizedContent>
): BlogSchemaType {
  return Object.values(localized).some((content) =>
    /^##\s+FAQ\s*$/im.test(content.content)
  )
    ? "faq"
    : "article";
}

async function createUniqueBlogSlug(
  admin: ReturnType<typeof getAdmin>,
  title: string,
  publishedAt: string
) {
  const semanticBase = buildOpsBlogSlugBase(title);
  const base =
    semanticBase ||
    `post-${publishedAt.replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const { data, error } = await admin
      .from("blog_posts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return normalizeSlug(candidate);
  }
  throw new Error("Could not generate a unique blog slug");
}

function toOpsBlogPost(row: BlogPostRow): OpsBlogPost {
  const schemaType =
    row.schema_type === "faq" || row.schema_type === "none"
      ? row.schema_type
      : "article";
  return {
    authorAvatarUrl: row.author_avatar_url,
    authorName: row.author_name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    isPinned: row.is_pinned,
    isPublished: row.is_published,
    localized: {
      en: {
        category: row.category_en ?? "",
        content: row.content_en ?? "",
        excerpt: row.excerpt_en ?? "",
        seoDescription: row.seo_description_en ?? "",
        seoTitle: row.seo_title_en ?? "",
        title: row.title_en ?? "",
      },
      ko: {
        category: row.category_ko ?? "",
        content: row.content_ko ?? "",
        excerpt: row.excerpt_ko ?? "",
        seoDescription: row.seo_description_ko ?? "",
        seoTitle: row.seo_title_ko ?? "",
        title: row.title_ko ?? "",
      },
    },
    publishedAt: row.published_at,
    relatedJobSlugs: row.related_job_slugs ?? [],
    relatedPostSlugs: row.related_post_slugs ?? [],
    schemaType,
    slug: row.slug,
    tags: row.tags ?? [],
    thumbnailUrl: row.thumbnail_url,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function fetchOpsBlogPosts(): Promise<OpsBlogResponse> {
  const admin = getAdmin();
  const [postsResult, jobs] = await Promise.all([
    admin
      .from("blog_posts")
      .select(BLOG_POST_SELECT_COLUMNS)
      .order("is_published", { ascending: false })
      .order("published_at", { ascending: false })
      .order("updated_at", { ascending: false }),
    getPublicOfficialJobListItems(),
  ]);

  if (postsResult.error) {
    throw new Error(postsResult.error.message ?? "Failed to load blog posts");
  }

  return {
    jobs,
    posts: ((postsResult.data ?? []) as BlogPostRow[]).map(toOpsBlogPost),
  };
}

export async function saveOpsBlogPost(args: {
  actorEmail?: string | null;
  input: OpsBlogSaveInput;
}): Promise<OpsBlogSaveResponse> {
  const admin = getAdmin();
  const id = normalizeText(args.input.id, 80);
  let existingPost: BlogPostRow | null = null;
  if (id) {
    const { data, error } = await admin
      .from("blog_posts")
      .select(BLOG_POST_SELECT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Blog post not found");
    existingPost = data as BlogPostRow;
  }

  const normalizedLocalized = {
    en: normalizeLocalizedInput(args.input.localized?.en),
    ko: normalizeLocalizedInput(args.input.localized?.ko),
  };
  const hasEnglish = validateLocalizedVersion(normalizedLocalized.en, "en");
  const hasKorean = validateLocalizedVersion(normalizedLocalized.ko, "ko");
  const isPublished = normalizeBoolean(args.input.isPublished);
  if (isPublished && !hasEnglish && !hasKorean) {
    throw new Error(
      "A published post needs at least one complete language version"
    );
  }
  const tags = normalizeStringList(args.input.tags, 20, 64);
  if ((hasEnglish || hasKorean) && tags.length === 0) {
    throw new Error("A post with content needs at least one tag");
  }
  const category = tags[0] ?? "";
  const localized = {
    en: deriveOpsBlogLocalizedContent(
      normalizedLocalized.en,
      category,
      hasEnglish
    ),
    ko: deriveOpsBlogLocalizedContent(
      normalizedLocalized.ko,
      category,
      hasKorean
    ),
  };
  const publishedAt = getOpsBlogPublishedDate();
  const slug = existingPost
    ? normalizeSlug(existingPost.slug)
    : await createUniqueBlogSlug(
        admin,
        localized.en.title || localized.ko.title,
        publishedAt
      );

  const relatedJobSlugs = normalizeStringList(
    args.input.relatedJobSlugs,
    4,
    180
  ).map((value) => normalizeSlug(value, "relatedJobSlugs"));
  if (relatedJobSlugs.length > 0) {
    const { data: jobs, error: jobsError } = await admin
      .from("official_jobs")
      .select("slug")
      .in("slug", relatedJobSlugs)
      .eq("is_published", true);
    if (jobsError) throw new Error(jobsError.message);
    const available = new Set(
      (jobs ?? []).map((row: { slug: string }) => row.slug)
    );
    const missing = relatedJobSlugs.filter((value) => !available.has(value));
    if (missing.length > 0) {
      throw new Error(`Selected jobs are not public: ${missing.join(", ")}`);
    }
  }

  const relatedPostSlugs = normalizeStringList(
    args.input.relatedPostSlugs,
    3,
    160
  )
    .map((value) => normalizeSlug(value, "relatedPostSlugs"))
    .filter((value) => value !== slug);
  const actorEmail = normalizeText(args.actorEmail, 320) || null;
  const now = new Date().toISOString();
  const payload = {
    author_avatar_url:
      existingPost?.author_avatar_url ?? DEFAULT_AUTHOR_AVATAR_URL,
    author_name: existingPost?.author_name ?? DEFAULT_AUTHOR_NAME,
    category_en: localized.en.category || null,
    category_ko: localized.ko.category || null,
    content_en: localized.en.content || null,
    content_ko: localized.ko.content || null,
    excerpt_en: localized.en.excerpt || null,
    excerpt_ko: localized.ko.excerpt || null,
    is_pinned: normalizeBoolean(args.input.isPinned),
    is_published: isPublished,
    published_at: publishedAt,
    related_job_slugs: relatedJobSlugs,
    related_post_slugs: relatedPostSlugs,
    schema_type: inferOpsBlogSchemaType(localized),
    seo_description_en: localized.en.seoDescription || null,
    seo_description_ko: localized.ko.seoDescription || null,
    seo_title_en: localized.en.seoTitle || null,
    seo_title_ko: localized.ko.seoTitle || null,
    slug,
    tags,
    thumbnail_url: normalizeRequiredText(
      args.input.thumbnailUrl,
      "thumbnailUrl",
      1000
    ),
    title_en: localized.en.title || null,
    title_ko: localized.ko.title || null,
    updated_at: now,
    updated_by: actorEmail,
  };

  const query = id
    ? admin.from("blog_posts").update(payload).eq("id", id)
    : admin.from("blog_posts").insert({
        ...payload,
        created_by: actorEmail,
      });
  const { data, error } = await query.select(BLOG_POST_SELECT_COLUMNS).single();

  if (error) throw new Error(error.message ?? "Failed to save blog post");
  return { ok: true, post: toOpsBlogPost(data as BlogPostRow) };
}
