import fs from "fs";
import path from "path";
import { BlogCategorySummary, BlogPost, BlogPostMeta } from "./blog";

const BLOG_CONTENT_DIR = path.join(process.cwd(), "src", "content", "blog");
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_FRONTMATTER_FIELDS = [
  "title",
  "excerpt",
  "category",
  "author",
  "authorAvatar",
  "thumbnail",
  "publishedAt",
] as const;

type RequiredFrontmatterField = (typeof REQUIRED_FRONTMATTER_FIELDS)[number];

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(raw: string, filePath: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  const normalizedRaw = raw.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalizedRaw.match(FRONTMATTER_PATTERN);

  if (!frontmatterMatch) {
    throw new Error(`Blog post is missing frontmatter: ${filePath}`);
  }

  const frontmatterBlock = frontmatterMatch[1];
  const content = normalizedRaw.slice(frontmatterMatch[0].length).trim();
  const frontmatter: Record<string, string> = {};

  for (const rawLine of frontmatterBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = stripQuotes(value);
  }

  return { frontmatter, content };
}

function validateDate(dateString: string, slug: string, field: string): string {
  if (!DATE_PATTERN.test(dateString)) {
    throw new Error(
      `Invalid ${field} format in blog post "${slug}". Use YYYY-MM-DD.`
    );
  }
  return dateString;
}

function parseTags(tagsValue: string | undefined): string[] {
  if (!tagsValue) {
    return [];
  }
  return tagsValue
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parsePinnedValue(value: string | undefined, slug: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new Error(
    `Invalid "is_pinned" value in blog post "${slug}". Use true or false.`
  );
}

function countReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function assertRequiredFields(
  frontmatter: Record<string, string>,
  slug: string
): Record<RequiredFrontmatterField, string> {
  const required: Partial<Record<RequiredFrontmatterField, string>> = {};

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    const value = frontmatter[field];
    if (!value) {
      throw new Error(`Missing "${field}" in blog post "${slug}".`);
    }
    required[field] = value;
  }

  return required as Record<RequiredFrontmatterField, string>;
}

function parsePostFromFile(fileName: string): BlogPost {
  const slug = fileName.replace(/\.md$/, "");
  const fullPath = path.join(BLOG_CONTENT_DIR, fileName);
  const raw = fs.readFileSync(fullPath, "utf8");
  const { frontmatter, content } = parseFrontmatter(raw, fullPath);
  const required = assertRequiredFields(frontmatter, slug);

  const publishedAt = validateDate(required.publishedAt, slug, "publishedAt");
  const updatedAt = validateDate(
    frontmatter.updatedAt || publishedAt,
    slug,
    "updatedAt"
  );
  const isPinned = parsePinnedValue(
    frontmatter.is_pinned || frontmatter.isPinned,
    slug
  );

  return {
    slug,
    title: required.title,
    excerpt: required.excerpt,
    category: required.category,
    author: required.author,
    authorAvatar: required.authorAvatar,
    thumbnail: required.thumbnail,
    publishedAt,
    updatedAt,
    isPinned,
    tags: parseTags(frontmatter.tags),
    seoTitle: frontmatter.seoTitle,
    seoDescription: frontmatter.seoDescription,
    content,
    readingMinutes: countReadingMinutes(content),
  };
}

function getMarkdownFileNames(): string[] {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter(
      (fileName) =>
        fileName.endsWith(".md") &&
        !fileName.startsWith("_") &&
        fileName.toLowerCase() !== "readme.md"
    )
    .sort();
}

function compareByPublishedDateDesc(a: BlogPostMeta, b: BlogPostMeta): number {
  if (a.publishedAt === b.publishedAt) {
    return b.slug.localeCompare(a.slug);
  }
  return b.publishedAt.localeCompare(a.publishedAt);
}

export function getAllPostSlugs(): string[] {
  return getMarkdownFileNames().map((fileName) => fileName.replace(/\.md$/, ""));
}

export function getAllPostsMeta(): BlogPostMeta[] {
  return getMarkdownFileNames()
    .map((fileName) => parsePostFromFile(fileName))
    .map(({ content: _content, readingMinutes: _readingMinutes, ...meta }) => meta)
    .sort(compareByPublishedDateDesc);
}

export function getPostBySlug(slug: string): BlogPost | null {
  if (!slug) {
    return null;
  }

  const fileName = `${slug}.md`;
  if (!getMarkdownFileNames().includes(fileName)) {
    return null;
  }

  return parsePostFromFile(fileName);
}

export function getCategorySummaries(
  posts: BlogPostMeta[]
): BlogCategorySummary[] {
  const counter = new Map<string, number>();

  for (const post of posts) {
    counter.set(post.category, (counter.get(post.category) || 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.count === b.count) {
        return a.name.localeCompare(b.name);
      }
      return b.count - a.count;
    });
}
