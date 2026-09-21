import type { BlogLocale, BlogSchemaType } from "@/lib/blog";
import {
  BLOG_CONVERSION_EVENT_PREFIX,
  BLOG_VIEW_EVENT_PREFIX,
} from "@/lib/blogMetrics";
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
const BLOG_ANALYTICS_DAYS = 30;
const BLOG_ANALYTICS_TIME_ZONE = "Asia/Seoul";
const LANDING_LOG_BATCH_SIZE = 1_000;

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

type BlogLandingLogRow = {
  created_at: string;
  id: number;
  local_id: string | null;
  type: string | null;
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

export type OpsBlogAnalyticsPostMetrics = {
  allJobsOpens: number;
  copyClicks: number;
  ctaClickers: number;
  ctaClicks: number;
  jobOpens: number;
  postOpens: number;
  slug: string;
  views: number;
  visitors: number;
};

export type OpsBlogAnalyticsPost = OpsBlogAnalyticsPostMetrics & {
  title: string;
};

export type OpsBlogAnalyticsSummary = Omit<
  OpsBlogAnalyticsPostMetrics,
  "slug"
> & {
  conversionRate: number | null;
};

export type OpsBlogAnalyticsDay = {
  date: string;
  posts: OpsBlogAnalyticsPostMetrics[];
  summary: OpsBlogAnalyticsSummary;
};

export type OpsBlogAnalytics = {
  daily: OpsBlogAnalyticsDay[];
  from: string;
  posts: OpsBlogAnalyticsPost[];
  summary: OpsBlogAnalyticsSummary;
  through: string;
  timeZone: typeof BLOG_ANALYTICS_TIME_ZONE;
};

export type OpsBlogResponse = {
  analytics: OpsBlogAnalytics;
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

function addDateOnly(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from: string, through: string) {
  const dates: string[] = [];
  for (let date = from; date <= through; date = addDateOnly(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function toKoreaDateOnly(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: BLOG_ANALYTICS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function emptyBlogPostMetrics(slug: string): OpsBlogAnalyticsPostMetrics {
  return {
    allJobsOpens: 0,
    copyClicks: 0,
    ctaClickers: 0,
    ctaClicks: 0,
    jobOpens: 0,
    postOpens: 0,
    slug,
    views: 0,
    visitors: 0,
  };
}

type MutableBlogPostMetrics = OpsBlogAnalyticsPostMetrics & {
  ctaClickerIds: Set<string>;
  visitorIds: Set<string>;
};

function mutableBlogPostMetrics(slug: string): MutableBlogPostMetrics {
  return {
    ...emptyBlogPostMetrics(slug),
    ctaClickerIds: new Set<string>(),
    visitorIds: new Set<string>(),
  };
}

function finalizeBlogPostMetrics(
  metrics: MutableBlogPostMetrics
): OpsBlogAnalyticsPostMetrics {
  return {
    allJobsOpens: metrics.allJobsOpens,
    copyClicks: metrics.copyClicks,
    ctaClickers: metrics.ctaClickerIds.size,
    ctaClicks: metrics.ctaClicks,
    jobOpens: metrics.jobOpens,
    postOpens: metrics.postOpens,
    slug: metrics.slug,
    views: metrics.views,
    visitors: metrics.visitorIds.size,
  };
}

function summarizeBlogMetrics(
  metrics: Iterable<MutableBlogPostMetrics>
): OpsBlogAnalyticsSummary {
  const visitorIds = new Set<string>();
  const ctaClickerIds = new Set<string>();
  const summary = {
    allJobsOpens: 0,
    copyClicks: 0,
    ctaClicks: 0,
    jobOpens: 0,
    postOpens: 0,
    views: 0,
  };

  for (const post of metrics) {
    summary.allJobsOpens += post.allJobsOpens;
    summary.copyClicks += post.copyClicks;
    summary.ctaClicks += post.ctaClicks;
    summary.jobOpens += post.jobOpens;
    summary.postOpens += post.postOpens;
    summary.views += post.views;
    post.visitorIds.forEach((id) => visitorIds.add(id));
    post.ctaClickerIds.forEach((id) => ctaClickerIds.add(id));
  }

  return {
    ...summary,
    conversionRate:
      visitorIds.size > 0 ? ctaClickerIds.size / visitorIds.size : null,
    ctaClickers: ctaClickerIds.size,
    visitors: visitorIds.size,
  };
}

type ParsedBlogEvent = {
  kind:
    | "all_jobs_open"
    | "copy_click"
    | "cta_click"
    | "job_open"
    | "post_open"
    | "view";
  slug: string;
};

function parseBlogEvent(type: string | null): ParsedBlogEvent | null {
  if (!type) return null;

  if (type.startsWith(BLOG_VIEW_EVENT_PREFIX)) {
    const slug = type.slice(BLOG_VIEW_EVENT_PREFIX.length);
    return SLUG_PATTERN.test(slug) ? { kind: "view", slug } : null;
  }
  if (type.startsWith(BLOG_CONVERSION_EVENT_PREFIX)) {
    const slug = type.slice(BLOG_CONVERSION_EVENT_PREFIX.length);
    return SLUG_PATTERN.test(slug) ? { kind: "cta_click", slug } : null;
  }

  const parts = type.split(":");
  const prefix = parts[0];
  const slug =
    prefix === "blog_post_open" ? parts[2] : parts.length > 1 ? parts[1] : "";
  if (!SLUG_PATTERN.test(slug)) return null;

  if (prefix === "blog_post_open") return { kind: "post_open", slug };
  if (prefix === "blog_copy_link") return { kind: "copy_click", slug };
  if (prefix === "blog_job_open") return { kind: "job_open", slug };
  if (prefix === "blog_all_jobs_open") {
    return { kind: "all_jobs_open", slug };
  }
  return null;
}

function recordBlogEvent(
  metrics: MutableBlogPostMetrics,
  event: ParsedBlogEvent,
  visitorId: string
) {
  if (event.kind === "view") {
    metrics.views += 1;
    metrics.visitorIds.add(visitorId);
    return;
  }
  if (event.kind === "cta_click") {
    metrics.ctaClicks += 1;
    metrics.ctaClickerIds.add(visitorId);
    return;
  }
  if (event.kind === "post_open") metrics.postOpens += 1;
  if (event.kind === "copy_click") metrics.copyClicks += 1;
  if (event.kind === "job_open") metrics.jobOpens += 1;
  if (event.kind === "all_jobs_open") metrics.allJobsOpens += 1;
}

export function buildOpsBlogAnalytics(args: {
  from: string;
  logs: BlogLandingLogRow[];
  postTitles: Record<string, string>;
  through: string;
}): OpsBlogAnalytics {
  const dailyMetrics = new Map(
    enumerateDates(args.from, args.through).map((date) => [
      date,
      new Map<string, MutableBlogPostMetrics>(),
    ])
  );
  const overallMetrics = new Map<string, MutableBlogPostMetrics>();

  for (const row of args.logs) {
    const event = parseBlogEvent(row.type);
    if (!event) continue;
    const date = toKoreaDateOnly(row.created_at);
    const day = dailyMetrics.get(date);
    if (!day) continue;
    const visitorId = row.local_id?.trim() || `event:${row.id}`;
    const dailyPost = day.get(event.slug) ?? mutableBlogPostMetrics(event.slug);
    const overallPost =
      overallMetrics.get(event.slug) ?? mutableBlogPostMetrics(event.slug);

    recordBlogEvent(dailyPost, event, visitorId);
    recordBlogEvent(overallPost, event, visitorId);
    day.set(event.slug, dailyPost);
    overallMetrics.set(event.slug, overallPost);
  }

  const posts = Array.from(overallMetrics.values())
    .map((metrics) => ({
      ...finalizeBlogPostMetrics(metrics),
      title: args.postTitles[metrics.slug] || metrics.slug,
    }))
    .sort(
      (left, right) =>
        right.visitors - left.visitors ||
        right.ctaClickers - left.ctaClickers ||
        left.title.localeCompare(right.title, "ko")
    );

  return {
    daily: Array.from(dailyMetrics, ([date, metrics]) => ({
      date,
      posts: Array.from(metrics.values()).map(finalizeBlogPostMetrics),
      summary: summarizeBlogMetrics(metrics.values()),
    })),
    from: args.from,
    posts,
    summary: summarizeBlogMetrics(overallMetrics.values()),
    through: args.through,
    timeZone: BLOG_ANALYTICS_TIME_ZONE,
  };
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

async function fetchOpsBlogAnalytics(
  posts: OpsBlogPost[],
  now = new Date()
): Promise<OpsBlogAnalytics> {
  const through = getOpsBlogPublishedDate(now);
  const from = addDateOnly(through, -(BLOG_ANALYTICS_DAYS - 1));
  const startIso = new Date(`${from}T00:00:00+09:00`).toISOString();
  const endIso = new Date(
    `${addDateOnly(through, 1)}T00:00:00+09:00`
  ).toISOString();
  const admin = getAdmin();
  const logs: BlogLandingLogRow[] = [];

  for (let offset = 0; ; offset += LANDING_LOG_BATCH_SIZE) {
    const { data, error } = await admin
      .from("landing_logs")
      .select("id,local_id,type,created_at")
      .like("type", "blog%")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("id", { ascending: true })
      .range(offset, offset + LANDING_LOG_BATCH_SIZE - 1);
    if (error)
      throw new Error(error.message ?? "Failed to load blog analytics");
    const page = (data ?? []) as BlogLandingLogRow[];
    logs.push(...page);
    if (page.length < LANDING_LOG_BATCH_SIZE) break;
  }

  return buildOpsBlogAnalytics({
    from,
    logs,
    postTitles: Object.fromEntries(
      posts.map((post) => [
        post.slug,
        post.localized.ko.title || post.localized.en.title || post.slug,
      ])
    ),
    through,
  });
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

  const posts = ((postsResult.data ?? []) as BlogPostRow[]).map(toOpsBlogPost);

  return {
    analytics: await fetchOpsBlogAnalytics(posts),
    jobs,
    posts,
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
