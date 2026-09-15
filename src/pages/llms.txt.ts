import type { BlogLocale, BlogPostMeta } from "@/lib/blog";
import { getBlogDisplayTitle } from "@/lib/blog";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { GetServerSideProps } from "next";

const SITE_URL = getConfiguredPublicSiteUrl();

function formatPost(post: BlogPostMeta, locale: BlogLocale) {
  const language = locale === "ko" ? "Korean" : "English";
  return [
    `- ${getBlogDisplayTitle(post.title)}`,
    `  - URL: ${SITE_URL}/blog/${post.slug}`,
    `  - Language: ${language}`,
    `  - Category: ${post.category}`,
    `  - Summary: ${post.excerpt.replace(/\s+/g, " ").trim()}`,
    `  - Published: ${post.publishedAt}`,
    `  - Updated: ${post.updatedAt}`,
  ].join("\n");
}

export function buildLlmsText(
  koreanPosts: BlogPostMeta[],
  englishPosts: BlogPostMeta[]
) {
  const sections = [
    "# Harper",
    "",
    "Harper is a career and hiring service that helps talent discover relevant opportunities and talk with Harper about their next move.",
    "",
    "## Primary pages",
    "",
    `- Home: ${SITE_URL}`,
    `- Blog: ${SITE_URL}/blog`,
    `- Open roles: ${SITE_URL}/jobs`,
    `- About Harper: ${SITE_URL}/about`,
    `- XML sitemap: ${SITE_URL}/sitemap.xml`,
    `- Korean blog RSS: ${SITE_URL}/blog/feed.xml?lang=ko`,
    `- English blog RSS: ${SITE_URL}/blog/feed.xml?lang=en`,
    "",
    "## Korean blog posts",
    "",
    koreanPosts.length > 0
      ? koreanPosts.map((post) => formatPost(post, "ko")).join("\n")
      : "- No Korean posts are currently published.",
    "",
    "## English blog posts",
    "",
    englishPosts.length > 0
      ? englishPosts.map((post) => formatPost(post, "en")).join("\n")
      : "- No English posts are currently published.",
    "",
  ];

  return sections.join("\n");
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const { getAllPostsMeta } = await import("@/lib/blog.server");
  const [koreanPosts, englishPosts] = await Promise.all([
    getAllPostsMeta("ko"),
    getAllPostsMeta("en"),
  ]);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=900, stale-while-revalidate=86400"
  );
  res.write(buildLlmsText(koreanPosts, englishPosts));
  res.end();

  return { props: {} };
};

export default function LlmsTextPage() {
  return null;
}
