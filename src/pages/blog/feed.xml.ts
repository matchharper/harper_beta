import type { BlogLocale, BlogPostMeta } from "@/lib/blog";
import { getBlogDisplayTitle } from "@/lib/blog";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { GetServerSideProps } from "next";

const SITE_URL = getConfiguredPublicSiteUrl();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRssDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? new Date(0).toUTCString()
    : new Date(timestamp).toUTCString();
}

export function buildBlogRss(posts: BlogPostMeta[], locale: BlogLocale) {
  const title = locale === "ko" ? "Harper 블로그" : "Harper Blog";
  const description =
    locale === "ko"
      ? "커리어와 채용 시장에서 새롭게 등장하는 역할과 일하는 방식을 Harper가 정리합니다."
      : "Harper's field notes on emerging roles, career decisions, and how hiring is changing.";
  const feedUrl = `${SITE_URL}/blog/feed.xml?lang=${locale}`;
  const lastBuildDate = toRssDate(
    posts[0]?.updatedAt ?? new Date().toISOString()
  );
  const items = posts
    .map((post) => {
      const postUrl = `${SITE_URL}/blog/${post.slug}`;
      return [
        "<item>",
        `<title>${escapeXml(getBlogDisplayTitle(post.title))}</title>`,
        `<link>${escapeXml(postUrl)}</link>`,
        `<guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
        `<description>${escapeXml(post.excerpt)}</description>`,
        `<category>${escapeXml(post.category)}</category>`,
        `<pubDate>${toRssDate(post.publishedAt)}</pubDate>`,
        "</item>",
      ].join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(`${SITE_URL}/blog`)}</link>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(description)}</description>`,
    `<language>${locale === "ko" ? "ko-KR" : "en-US"}</language>`,
    `<lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}

export const getServerSideProps: GetServerSideProps = async ({
  query,
  res,
}) => {
  const { getAllPostsMeta } = await import("@/lib/blog.server");
  const locale: BlogLocale = query.lang === "en" ? "en" : "ko";
  const posts = await getAllPostsMeta(locale);

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=900, stale-while-revalidate=86400"
  );
  res.write(buildBlogRss(posts, locale));
  res.end();

  return { props: {} };
};

export default function BlogFeedPage() {
  return null;
}
